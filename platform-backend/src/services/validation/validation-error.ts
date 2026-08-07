/** A request body failed validation before reaching any service. Maps to HTTP 400. */
export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}
