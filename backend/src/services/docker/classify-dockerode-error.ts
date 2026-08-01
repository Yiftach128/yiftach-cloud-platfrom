/**
 * Classifies dockerode failures: did the daemon answer and reject the request
 * (engine error), or was it never reached at all (connection error)? The manager
 * uses this to decide between mapping to an API error and booting WSL for a retry.
 */

/** Node system error codes that mean "never reached the daemon". */
const CONNECTION_ERROR_CODES = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ETIMEDOUT',
    'EPIPE',
    'ECONNABORTED',
]);

/**
 * docker-modem attaches `statusCode` to errors the daemon actually answered. Stays
 * here rather than in interfaces.ts because it is a docker-modem wire detail.
 */
export interface EngineError extends Error {
    statusCode: number;
}

export function isEngineError(error: unknown): error is EngineError {
    if (!(error instanceof Error)) {
        return false;
    }
    return typeof (error as { statusCode?: unknown }).statusCode === 'number';
}

export function isConnectionError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && CONNECTION_ERROR_CODES.has(code)) {
        return true;
    }

    // http.request surfaces its own timeout without a code.
    if (error.message.includes('socket hang up')) {
        return true;
    }

    if (typeof error.cause === 'object' && error.cause !== null) {
        const causeCode = (error.cause as { code?: unknown }).code;
        if (typeof causeCode === 'string' && CONNECTION_ERROR_CODES.has(causeCode)) {
            return true;
        }
    }
    return false;
}
