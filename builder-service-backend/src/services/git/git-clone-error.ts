/** A git clone failed; the message carries the tail of git's stderr. */
export class GitCloneError extends Error {
    constructor(gitUrl: string, detail: string) {
        super(`Cloning ${gitUrl} failed: ${detail}`);
        this.name = 'GitCloneError';
    }
}
