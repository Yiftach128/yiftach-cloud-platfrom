/** A build was requested while another one is still running. Maps to HTTP 409. */
export class BuildInProgressError extends Error {
    constructor() {
        super('Another image build is already running — wait for it to finish and try again');
        this.name = 'BuildInProgressError';
    }
}
