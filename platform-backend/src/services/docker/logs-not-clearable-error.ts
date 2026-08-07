/** The container's logging configuration rules out clearing its log. */
export class LogsNotClearableError extends Error {
    constructor(container: string, reason: string) {
        super(`Cannot clear logs of container "${container}": ${reason}`);
        this.name = 'LogsNotClearableError';
    }
}
