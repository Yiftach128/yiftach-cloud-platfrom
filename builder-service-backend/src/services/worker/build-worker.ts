/**
 * The builder's main loop: claim → clone → build → create container → report,
 * strictly one task at a time (the platform's queue is serial by design). The
 * clone workspace is ALWAYS deleted afterwards — success, failure, or abandon.
 *
 * Failure routing: a lost job (404) is abandoned quietly; everything else is
 * flushed to the job log and reported as a failed result so the user sees the
 * reason in the UI. The loop itself never throws — a platform outage just
 * means the next claim attempt fails and is retried a poll later.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { ImageBuilderService } from '../docker/image-builder-service.ts';
import { GitCloneService } from '../git/git-clone-service.ts';
import { BuildJobLostError } from '../platform/build-job-lost-error.ts';
import type { BuildTask } from '../platform/interfaces.ts';
import { PlatformApiClient } from '../platform/platform-api-client.ts';
import type { BuildWorkerOptions } from './interfaces.ts';
import { LogBatcher } from './log-batcher.ts';

/**
 * Provenance labels stamped on every built image, next to the managed label.
 * The platform's image-detail endpoint serves them and the frontend's image
 * detail page displays them — keep the names in sync with
 * frontend/src/components/image-details.tsx.
 */
const REPO_URL_LABEL = 'cloudplatform.repo-url';
const GIT_REF_LABEL = 'cloudplatform.git-ref';
const COMMIT_LABEL = 'cloudplatform.commit';
const BUILD_JOB_ID_LABEL = 'cloudplatform.build-job-id';

export class BuildWorker {
    private readonly platform: PlatformApiClient;
    private readonly git: GitCloneService;
    private readonly images: ImageBuilderService;
    private readonly options: BuildWorkerOptions;
    private stopRequested = false;

    constructor(
        platform: PlatformApiClient,
        git: GitCloneService,
        images: ImageBuilderService,
        options: BuildWorkerOptions,
    ) {
        this.platform = platform;
        this.git = git;
        this.images = images;
        this.options = options;
    }

    /** Finishes the in-flight task (if any), then lets {@link run} return. */
    public requestStop(): void {
        this.stopRequested = true;
    }

    public async run(): Promise<void> {
        console.log('polling the platform for build tasks...');
        while (!this.stopRequested) {
            let task: BuildTask | null;
            try {
                task = await this.platform.claimBuildTask();
            } catch (error) {
                // Platform down or restarting — not an event worth a log line
                // per poll; stay quiet and retry next tick.
                task = null;
            }

            if (task === null) {
                await sleep(this.options.pollIntervalMs);
                continue;
            }

            await this.processTask(task);
        }
    }

    private async processTask(task: BuildTask): Promise<void> {
        console.log(`claimed build ${task.jobId}: ${task.gitUrl} -> ${task.imageTag}`);
        const batcher = new LogBatcher(this.platform, task.jobId);
        const workspace: string = await mkdtemp(join(this.options.workspaceDir, 'build-'));

        try {
            batcher.push(`Cloning ${task.gitUrl} ...`);
            await this.git.cloneRepository({
                gitUrl: task.gitUrl,
                gitRef: task.gitRef,
                targetDir: workspace,
                timeoutMs: this.options.gitCloneTimeoutMs,
            });
            this.throwIfJobLost(task, batcher);

            const commitSha: string = await this.git.readHeadCommit({
                repositoryDir: workspace,
                timeoutMs: this.options.gitCloneTimeoutMs,
            });
            batcher.push(`Cloned commit ${commitSha}`);

            batcher.push(`Building image ${task.imageTag} ...`);
            await this.images.buildImage({
                contextDir: workspace,
                tag: task.imageTag,
                extraLabels: buildProvenanceLabels(task, commitSha),
                onProgressLine: (line: string) => batcher.push(line),
            });
            this.throwIfJobLost(task, batcher);

            batcher.push(`Creating container "${task.container.name}" ...`);
            await this.platform.createContainer({
                name: task.container.name,
                image: task.imageTag,
                ports: task.container.ports,
                env: task.container.env,
            });

            await batcher.flush();
            await this.platform.reportBuildResult(task.jobId, { status: 'succeeded' });
            console.log(`build ${task.jobId} succeeded`);
        } catch (error) {
            await this.reportFailure(task, batcher, error);
        } finally {
            batcher.stop();
            // The clone is never kept: success, failure, or abandon, the
            // workspace goes. Retries cover Windows's slow handle release on
            // git's read-only object files.
            await rm(workspace, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        }
    }

    private throwIfJobLost(task: BuildTask, batcher: LogBatcher): void {
        if (batcher.isJobLost()) {
            throw new BuildJobLostError(task.jobId);
        }
    }

    private async reportFailure(task: BuildTask, batcher: LogBatcher, error: unknown): Promise<void> {
        if (error instanceof BuildJobLostError) {
            console.warn(`build ${task.jobId}: job lost on the platform, abandoning`);
            return;
        }

        let message: string;
        if (error instanceof Error) {
            message = error.message;
        } else {
            message = String(error);
        }
        console.warn(`build ${task.jobId} failed: ${message}`);

        try {
            await batcher.flush();
            await this.platform.reportBuildResult(task.jobId, {
                status: 'failed',
                errorMessage: message,
            });
        } catch (reportError) {
            if (reportError instanceof BuildJobLostError) {
                return; // restarted platform — nothing left to tell
            }
            console.warn(`build ${task.jobId}: could not report the failure:`, reportError);
        }
    }
}

/** The built image's provenance: where it came from and which job produced it. */
function buildProvenanceLabels(task: BuildTask, commitSha: string): Record<string, string> {
    // The task carries the canonical clone URL; the label gets the browsable
    // repository URL, so the UI can link to it directly.
    let repoUrl: string = task.gitUrl;
    if (repoUrl.endsWith('.git')) {
        repoUrl = repoUrl.slice(0, repoUrl.length - '.git'.length);
    }

    const labels: Record<string, string> = {
        [REPO_URL_LABEL]: repoUrl,
        [COMMIT_LABEL]: commitSha,
        [BUILD_JOB_ID_LABEL]: task.jobId,
    };
    if (task.gitRef !== undefined) {
        labels[GIT_REF_LABEL] = task.gitRef;
    }
    return labels;
}
