/**
 * Buffers build log lines and flushes them to the platform about once a
 * second, so a chatty build never becomes a request per line. Losing the job
 * (404 mid-flush — the platform restarted) is recorded rather than thrown:
 * timer callbacks have no caller to catch, so the worker checks
 * {@link isJobLost} at each milestone instead. Log delivery is best-effort —
 * a failed flush drops its lines and the build carries on.
 */

import { BuildJobLostError } from '../platform/build-job-lost-error.ts';
import { PlatformApiClient } from '../platform/platform-api-client.ts';

const FLUSH_INTERVAL_MS = 1000;
/** Stay under the platform's 1000-lines-per-request validation cap. */
const MAX_LINES_PER_REQUEST = 500;

export class LogBatcher {
    private readonly platform: PlatformApiClient;
    private readonly jobId: string;
    private pending: string[] = [];
    private jobLost = false;
    private chain: Promise<void> = Promise.resolve();
    private timer: NodeJS.Timeout | undefined;

    constructor(platform: PlatformApiClient, jobId: string) {
        this.platform = platform;
        this.jobId = jobId;
        this.timer = setInterval(() => {
            void this.flush();
        }, FLUSH_INTERVAL_MS);
        this.timer.unref();
    }

    public push(line: string): void {
        if (!this.jobLost) {
            this.pending.push(line);
        }
    }

    /** True once a flush hit 404 — the job is gone and the worker should abandon. */
    public isJobLost(): boolean {
        return this.jobLost;
    }

    /** Sends everything buffered; concurrent calls serialize on one chain. */
    public flush(): Promise<void> {
        this.chain = this.chain.then(() => this.sendPending());
        return this.chain;
    }

    public stop(): void {
        if (this.timer !== undefined) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    private async sendPending(): Promise<void> {
        while (!this.jobLost && this.pending.length > 0) {
            const batch: string[] = this.pending.slice(0, MAX_LINES_PER_REQUEST);
            this.pending = this.pending.slice(MAX_LINES_PER_REQUEST);
            try {
                await this.platform.appendBuildLogs(this.jobId, batch);
            } catch (error) {
                if (error instanceof BuildJobLostError) {
                    this.jobLost = true;
                    this.pending = [];
                } else {
                    // Dropped lines only cost log fidelity; the job result is
                    // what decides success, and it is sent outside this class.
                    console.warn(`build ${this.jobId}: dropping ${batch.length} log lines:`, error);
                }
            }
        }
    }
}
