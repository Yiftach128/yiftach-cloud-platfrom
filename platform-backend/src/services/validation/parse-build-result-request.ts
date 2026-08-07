/**
 * Validates the POST /builds-queue/:id/result body:
 * `{status: 'succeeded' | 'failed', errorMessage?}`. Throws
 * {@link ValidationError} (→ 400).
 */

import type { BuildResultReport } from '../builds/interfaces.ts';
import { ValidationError } from './validation-error.ts';

const MAX_ERROR_MESSAGE_LENGTH = 10_000;

export function parseBuildResultRequest(body: unknown): BuildResultReport {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new ValidationError('Request body must be a JSON object');
    }
    const record = body as Record<string, unknown>;

    const status = record['status'];
    if (status !== 'succeeded' && status !== 'failed') {
        throw new ValidationError('"status" must be "succeeded" or "failed"');
    }

    const errorMessage = record['errorMessage'];
    if (errorMessage !== undefined && typeof errorMessage !== 'string') {
        throw new ValidationError('"errorMessage" must be a string when present');
    }

    const report: BuildResultReport = { status: status };
    if (errorMessage !== undefined) {
        report.errorMessage = errorMessage.slice(0, MAX_ERROR_MESSAGE_LENGTH);
    }
    return report;
}
