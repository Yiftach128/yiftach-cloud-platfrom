import { randomUUID } from 'node:crypto';

import type { DockerImageService } from '../docker/docker-image-service.ts';
import { BuildInProgressError } from './build-in-progress-error.ts';
import { BuildJobNotFoundError } from './build-job-not-found-error.ts';
import { BuildJobRegistry } from './build-job-registry.ts';
import type { BuildJob, StartBuildOptions } from './interfaces.ts';

export * from './build-in-progress-error.ts';
export * from './build-job-not-found-error.ts';
export * from './interfaces.ts';

/**
 * Runs daemon-side git builds as pollable jobs: `startBuild` answers immediately
 * with a job the client polls via `getJob`, while the build itself streams its
 * progress lines into the registry in the background.
 *
 * One build at a time: this is a single-user platform on one WSL daemon, and
 * serializing builds avoids disk and CPU thrash. Creating the container from the
 * built image is deliberately NOT part of the job — the client follows up with
 * the normal create call using the job's `imageTag`, so name/port conflicts
 * surface through the one validated creation path and a failed create never
 * costs a rebuild.
 */
export class ImageBuildService {
    private readonly images: DockerImageService;
    private readonly registry: BuildJobRegistry;

    constructor(images: DockerImageService, registry: BuildJobRegistry) {
        this.images = images;
        this.registry = registry;
    }

    /**
     * Starts a build and returns its job without waiting: even the daemon boot
     * happens inside the job, so a cold-daemon failure surfaces as a failed job
     * rather than a hung request. Throws {@link BuildInProgressError} while
     * another build runs.
     */
    startBuild(options: StartBuildOptions): BuildJob {
        if (this.registry.hasRunningJob()) {
            throw new BuildInProgressError();
        }

        // ".git" is always appended so moby's remote-context detection takes the
        // git-clone path, never the "download URL as a tarball" path.
        let remote = `https://github.com/${options.owner}/${options.repo}.git`;
        if (options.gitRef !== undefined) {
            remote = `${remote}#${options.gitRef}`;
        }

        const jobId: string = randomUUID();
        const shortId: string = jobId.replaceAll('-', '').slice(0, 8);
        const tag = `cloudplatform/build-${toTagSegment(options.owner)}-${toTagSegment(options.repo)}:${shortId}`;

        const job: BuildJob = this.registry.create(jobId, options.gitUrl, tag);
        // Fire and forget on purpose (the POST answers with the job right away);
        // runBuild never rejects, so nothing is left unhandled.
        void this.runBuild(jobId, remote, tag);
        return job;
    }

    /** Throws {@link BuildJobNotFoundError} for unknown, expired, or restart-lost ids. */
    getJob(id: string): BuildJob {
        const job = this.registry.get(id);
        if (job === undefined) {
            throw new BuildJobNotFoundError(id);
        }
        return job;
    }

    private async runBuild(jobId: string, remote: string, tag: string): Promise<void> {
        try {
            await this.images.buildImageFromGit({
                gitUrl: remote,
                tag: tag,
                onProgressLine: (line: string) => this.registry.appendLogLine(jobId, line),
            });
            this.registry.markSucceeded(jobId);
        } catch (error) {
            let message: string;
            if (error instanceof Error) {
                message = error.message;
            } else {
                message = String(error);
            }
            this.registry.markFailed(jobId, message);
        }
    }
}

/** Lowercases and strips anything a docker repository name cannot hold. */
function toTagSegment(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9_.-]/g, '-');
}
