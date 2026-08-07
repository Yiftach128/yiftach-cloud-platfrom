/** A platform API call failed; `status` is null when the platform was unreachable. */
export class PlatformApiError extends Error {
    public readonly status: number | null;

    constructor(message: string, status: number | null) {
        super(message);
        this.name = 'PlatformApiError';
        this.status = status;
    }
}
