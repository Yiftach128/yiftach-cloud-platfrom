/**
 * The one error type DockerFetcherService throws. Callers (components) match on
 * this instead of on axios internals, so the HTTP library never leaks upwards.
 */
export class DockerFetcherError extends Error {
    /** HTTP status of the backend response, or null when no response arrived. */
    public readonly status: number | null;

    constructor(message: string, status: number | null) {
        super(message);
        this.name = 'DockerFetcherError';
        this.status = status;
    }
}
