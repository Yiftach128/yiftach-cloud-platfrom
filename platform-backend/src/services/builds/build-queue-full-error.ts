/** The build queue is at capacity. Maps to HTTP 429 — a rate problem, not a conflict. */
export class BuildQueueFullError extends Error {
    constructor(limit: number) {
        super(`The build queue is full (${limit} waiting jobs); try again after one finishes`);
        this.name = 'BuildQueueFullError';
    }
}
