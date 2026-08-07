/**
 * Validates the POST /builds-queue/:id/logs body: `{lines: string[]}`.
 * Deliberately light — the lines are build output for display, so ANSI color
 * escapes are allowed; the registry caps retention anyway. Throws
 * {@link ValidationError} (→ 400).
 */

import { ValidationError } from './validation-error.ts';

/** More than one registry cap per request is a misbehaving client. */
const MAX_LINES_PER_REQUEST = 1000;

export function parseAppendBuildLogsRequest(body: unknown): string[] {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new ValidationError('Request body must be a JSON object');
    }
    const record = body as Record<string, unknown>;

    const lines = record['lines'];
    if (!Array.isArray(lines)) {
        throw new ValidationError('"lines" must be an array of strings');
    }
    if (lines.length > MAX_LINES_PER_REQUEST) {
        throw new ValidationError(`"lines" must have at most ${MAX_LINES_PER_REQUEST} entries`);
    }
    for (const line of lines) {
        if (typeof line !== 'string') {
            throw new ValidationError('"lines" must contain only strings');
        }
    }
    return lines as string[];
}
