import { randomUUID } from 'node:crypto';

import type { DockerDaemonLifecycle } from '../docker/interfaces.ts';
import { BuildJobNotFoundError } from './build-job-not-found-error.ts';
import { BuildJobRegistry } from './build-job-registry.ts';
import { BuildQueueFullError } from './build-queue-full-error.ts';
import type {
    BuildJob,
    BuildResultReport,
    BuildTask,
    StartBuildOptions,
} from './interfaces.ts';

export * from './build-job-not-found-error.ts';
export * from './build-queue-full-error.ts';
export * from './interfaces.ts';

/** Jobs allowed to wait in the queue; enqueueing past this answers 429. */
const MAX_QUEUED_JOBS = 10;
/** A running job the builder has not touched for this long is declared abandoned. */
const DEFAULT_STALE_TIMEOUT_MS = 600_000;
/** How often the stale sweep runs. */
const SWEEP_INTERVAL_MS = 60_000;

/**
 * FIFO queue of build jobs, worked off by the external builder service
 * (builder-service-backend): `enqueue` answers immediately with a 'queued'
 * job the client polls via `getJob`, while the builder claims the oldest
 * queued job, streams its progress lines back, creates the container through
 * the normal POST /containers path, and reports the terminal result. Builds
 * run one at a time simply because the single builder works serially — the
 * queue itself no longer gates concurrency.
 *
 * The stale sweep is the safety net for a builder that dies mid-build: a
 * running job with no claim/log/result activity for `staleTimeoutMs` flips to
 * 'failed' so the UI never hangs forever.
 */
export class BuildQueueService {
    private readonly registry: BuildJobRegistry;
    private readonly daemon: DockerDaemonLifecycle;
    private readonly staleTimeoutMs: number;
    private sweepTimer: NodeJS.Timeout | undefined;

    constructor(registry: BuildJobRegistry, daemon: DockerDaemonLifecycle, staleTimeoutMs?: number) {
        this.registry = registry;
        this.daemon = daemon;
        if (staleTimeoutMs !== undefined) {
            this.staleTimeoutMs = staleTimeoutMs;
        } else {
            this.staleTimeoutMs = DEFAULT_STALE_TIMEOUT_MS;
        }
    }

    /** Throws {@link BuildQueueFullError} (→ 429) when too many jobs are already waiting. */
    enqueue(options: StartBuildOptions): BuildJob {
        if (this.registry.countQueued() >= MAX_QUEUED_JOBS) {
            throw new BuildQueueFullError(MAX_QUEUED_JOBS);
        }

        // ".git" is always appended so the builder's git clone never depends on
        // GitHub's redirect for the bare repository URL.
        const cloneUrl = `https://github.com/${options.owner}/${options.repo}.git`;

        const jobId: string = randomUUID();
        let tag: string;
        if (options.imageName !== undefined) {
            // The user picked the reference (a bare name gets the daemon's
            // implicit ":latest", so rebuilding the same name moves the tag).
            tag = options.imageName;
        } else {
            const shortId: string = jobId.replaceAll('-', '').slice(0, 8);
            tag = `cloudplatform/build-${toTagSegment(options.owner)}-${toTagSegment(options.repo)}:${shortId}`;
        }

        return this.registry.create(jobId, tag, cloneUrl, options);
    }

    /** Throws {@link BuildJobNotFoundError} for unknown, expired, or restart-lost ids. */
    getJob(id: string): BuildJob {
        const job = this.registry.get(id);
        if (job === undefined) {
            throw new BuildJobNotFoundError(id);
        }
        return job;
    }

    /** The builder's poll: claims the oldest queued job, or undefined when the queue is empty. */
    claimNextTask(): BuildTask | undefined {
        const task: BuildTask | undefined = this.registry.claimOldestQueued();
        if (task !== undefined) {
            // Warm the WSL daemon while the builder clones — by the time the
            // clone finishes, the ~10s boot is usually done. Failures surface
            // through the build itself, so log-and-swallow is enough here.
            void this.daemon.ensureRunning().catch((error: unknown) => {
                console.warn('docker daemon warm-up on claim failed:', error);
            });
        }
        return task;
    }

    /** Appends builder progress lines. Throws {@link BuildJobNotFoundError} on unknown ids. */
    appendLogs(id: string, lines: string[]): void {
        const known: boolean = this.registry.appendLogLines(id, lines);
        if (!known) {
            throw new BuildJobNotFoundError(id);
        }
    }

    /**
     * Records the builder's terminal report. Throws {@link BuildJobNotFoundError}
     * on unknown ids; silently keeps the first terminal status when the job is
     * already finished (e.g. swept stale before a late builder woke up).
     */
    completeJob(id: string, result: BuildResultReport): void {
        let errorMessage: string | undefined = undefined;
        if (result.status === 'failed') {
            if (result.errorMessage !== undefined) {
                errorMessage = result.errorMessage;
            } else {
                errorMessage = 'The builder reported no failure detail';
            }
        }

        const known: boolean = this.registry.complete(id, result.status, errorMessage);
        if (!known) {
            throw new BuildJobNotFoundError(id);
        }
    }

    /** Starts the stale-claim sweep; unref'd so it never keeps the process alive. */
    start(): void {
        if (this.sweepTimer !== undefined) {
            return;
        }
        this.sweepTimer = setInterval(() => {
            this.registry.failStaleRunningJobs(this.staleTimeoutMs);
        }, SWEEP_INTERVAL_MS);
        this.sweepTimer.unref();
    }

    stop(): void {
        if (this.sweepTimer !== undefined) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = undefined;
        }
    }
}

/** Lowercases and strips anything a docker repository name cannot hold. */
function toTagSegment(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9_.-]/g, '-');
}
