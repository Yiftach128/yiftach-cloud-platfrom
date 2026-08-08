/** Reading the cloned repository's HEAD commit failed. */
export class GitRevParseError extends Error {
    constructor(detail: string) {
        super(`Reading the cloned commit failed: ${detail}`);
        this.name = 'GitRevParseError';
    }
}
