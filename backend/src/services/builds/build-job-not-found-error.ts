/** No build job with the requested id exists (unknown, expired, or lost to a restart). Maps to HTTP 404. */
export class BuildJobNotFoundError extends Error {
    constructor(id: string) {
        super(`No build job "${id}" — it may have expired or the server restarted`);
        this.name = 'BuildJobNotFoundError';
    }
}
