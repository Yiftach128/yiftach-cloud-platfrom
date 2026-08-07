import type { BuildJob, BuildJobStatus } from './interfaces.ts';

/** Progress lines kept per job; the oldest are dropped past this. */
const MAX_LOG_LINES = 500;
/** How long a finished job stays queryable before it is forgotten. */
const COMPLETED_JOB_TTL_MS = 30 * 60_000;

/**
 * In-memory store of build jobs. Single-threaded by nature (one Node process),
 * so `get` hands out the live object — callers must treat it as read-only.
 * Finished jobs expire after a TTL; running jobs never expire.
 */
export class BuildJobRegistry {
    private readonly jobs = new Map<string, BuildJob>();

    create(id: string, gitUrl: string, imageTag: string): BuildJob {
        const job: BuildJob = {
            id: id,
            status: 'running',
            gitUrl: gitUrl,
            imageTag: imageTag,
            createdAt: new Date(),
            logLines: [],
        };
        this.jobs.set(id, job);
        return job;
    }

    get(id: string): BuildJob | undefined {
        return this.jobs.get(id);
    }

    hasRunningJob(): boolean {
        for (const job of this.jobs.values()) {
            if (job.status === 'running') {
                return true;
            }
        }
        return false;
    }

    appendLogLine(id: string, line: string): void {
        const job = this.jobs.get(id);
        if (job === undefined) {
            return;
        }
        job.logLines.push(line);
        if (job.logLines.length > MAX_LOG_LINES) {
            job.logLines.shift();
        }
    }

    markSucceeded(id: string): void {
        this.finish(id, 'succeeded', undefined);
    }

    markFailed(id: string, errorMessage: string): void {
        this.finish(id, 'failed', errorMessage);
    }

    private finish(id: string, status: BuildJobStatus, errorMessage: string | undefined): void {
        const job = this.jobs.get(id);
        if (job === undefined) {
            return;
        }
        job.status = status;
        job.finishedAt = new Date();
        if (errorMessage !== undefined) {
            job.errorMessage = errorMessage;
        }

        // unref'd so a pending expiry never keeps the process alive on shutdown.
        const expiry = setTimeout(() => {
            this.jobs.delete(id);
        }, COMPLETED_JOB_TTL_MS);
        expiry.unref();
    }
}
