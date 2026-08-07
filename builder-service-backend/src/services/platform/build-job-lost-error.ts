/**
 * The platform no longer knows the job (404 on a logs/result call) — its
 * in-memory registry restarted. The worker abandons the task quietly; this is
 * the one and only abandon signal.
 */
export class BuildJobLostError extends Error {
    constructor(jobId: string) {
        super(`Build job ${jobId} no longer exists on the platform`);
        this.name = 'BuildJobLostError';
    }
}
