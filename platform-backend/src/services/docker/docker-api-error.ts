/** The daemon was reached but rejected the request. */
export class DockerApiError extends Error {
    readonly status: number;
    readonly endpoint: string;

    constructor(message: string, status: number, endpoint: string) {
        super(message);
        this.name = 'DockerApiError';
        this.status = status;
        this.endpoint = endpoint;
    }
}
