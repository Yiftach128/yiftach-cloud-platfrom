import type {
    BuildJob,
    BuildJobRecord,
    BuildTask,
    StartBuildOptions,
} from './interfaces.ts';

/** Progress lines kept per job; the oldest are dropped past this. */
const MAX_LOG_LINES = 500;
/** How long a finished job stays queryable before it is forgotten. */
const COMPLETED_JOB_TTL_MS = 30 * 60_000;

/**
 * In-memory store of build jobs, doubling as the FIFO queue: Map iteration
 * order is insertion order, so "the oldest queued job" is the first record
 * whose status is 'queued'. Single-threaded by nature (one Node process), so
 * `get` hands out the live job object — callers must treat it as read-only.
 * Finished jobs expire after a TTL; queued and running jobs never expire
 * (running jobs are reaped by {@link failStaleRunningJobs} instead).
 */
export class BuildJobRegistry {
    private readonly records = new Map<string, BuildJobRecord>();

    create(id: string, imageTag: string, cloneUrl: string, options: StartBuildOptions): BuildJob {
        const job: BuildJob = {
            id: id,
            status: 'queued',
            gitUrl: options.gitUrl,
            imageTag: imageTag,
            containerName: options.container.name,
            createdAt: new Date(),
            logLines: [],
        };
        const record: BuildJobRecord = {
            job: job,
            cloneUrl: cloneUrl,
            container: options.container,
            lastActivityAt: Date.now(),
        };
        if (options.gitRef !== undefined) {
            record.gitRef = options.gitRef;
        }
        this.records.set(id, record);
        return job;
    }

    get(id: string): BuildJob | undefined {
        const record = this.records.get(id);
        if (record === undefined) {
            return undefined;
        }
        return record.job;
    }

    countQueued(): number {
        let count = 0;
        for (const record of this.records.values()) {
            if (record.job.status === 'queued') {
                count = count + 1;
            }
        }
        return count;
    }

    /** Marks the oldest queued job running and returns its task; undefined when none is queued. */
    claimOldestQueued(): BuildTask | undefined {
        for (const record of this.records.values()) {
            if (record.job.status !== 'queued') {
                continue;
            }
            record.job.status = 'running';
            record.lastActivityAt = Date.now();

            const task: BuildTask = {
                jobId: record.job.id,
                gitUrl: record.cloneUrl,
                imageTag: record.job.imageTag,
                container: record.container,
            };
            if (record.gitRef !== undefined) {
                task.gitRef = record.gitRef;
            }
            return task;
        }
        return undefined;
    }

    /** False when the id is unknown (the caller maps that to 404). */
    appendLogLines(id: string, lines: string[]): boolean {
        const record = this.records.get(id);
        if (record === undefined) {
            return false;
        }
        for (const line of lines) {
            record.job.logLines.push(line);
            if (record.job.logLines.length > MAX_LOG_LINES) {
                record.job.logLines.shift();
            }
        }
        record.lastActivityAt = Date.now();
        return true;
    }

    /**
     * Moves the job to a terminal status. False when the id is unknown; a
     * no-op (but true) when the job is already terminal, so a builder waking
     * up after the stale sweep cannot flip a failed job to succeeded.
     */
    complete(id: string, status: 'succeeded' | 'failed', errorMessage: string | undefined): boolean {
        const record = this.records.get(id);
        if (record === undefined) {
            return false;
        }
        const job = record.job;
        if (job.status === 'succeeded' || job.status === 'failed') {
            return true;
        }

        job.status = status;
        job.finishedAt = new Date();
        if (errorMessage !== undefined) {
            job.errorMessage = errorMessage;
        }
        record.lastActivityAt = Date.now();

        // unref'd so a pending expiry never keeps the process alive on shutdown.
        const expiry = setTimeout(() => {
            this.records.delete(id);
        }, COMPLETED_JOB_TTL_MS);
        expiry.unref();
        return true;
    }

    /** Fails every running job the builder has not touched for `maxIdleMs`, so the UI never hangs forever. */
    failStaleRunningJobs(maxIdleMs: number): void {
        const now: number = Date.now();
        for (const record of this.records.values()) {
            if (record.job.status !== 'running') {
                continue;
            }
            if (now - record.lastActivityAt > maxIdleMs) {
                this.complete(record.job.id, 'failed', 'The builder went silent — the build was abandoned');
            }
        }
    }
}
