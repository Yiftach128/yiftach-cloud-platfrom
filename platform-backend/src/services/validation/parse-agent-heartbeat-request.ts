/**
 * Validates the POST /build-agents/heartbeat body:
 * `{name, status: 'idle' | 'building', currentJobId?, startedAt}`. Throws
 * {@link ValidationError} (→ 400).
 */

import type { AgentHeartbeatReport } from '../build-agents/interfaces.ts';
import { ValidationError } from './validation-error.ts';

const MAX_NAME_LENGTH = 200;
const MAX_JOB_ID_LENGTH = 100;

export function parseAgentHeartbeatRequest(body: unknown): AgentHeartbeatReport {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new ValidationError('Request body must be a JSON object');
    }
    const record = body as Record<string, unknown>;

    const name = record['name'];
    if (typeof name !== 'string' || name.trim() === '') {
        throw new ValidationError('"name" must be a non-empty string');
    }

    const status = record['status'];
    if (status !== 'idle' && status !== 'building') {
        throw new ValidationError('"status" must be "idle" or "building"');
    }

    const currentJobId = record['currentJobId'];
    if (currentJobId !== undefined && typeof currentJobId !== 'string') {
        throw new ValidationError('"currentJobId" must be a string when present');
    }

    const startedAtRaw = record['startedAt'];
    if (typeof startedAtRaw !== 'string') {
        throw new ValidationError('"startedAt" must be an ISO 8601 timestamp string');
    }
    const startedAt = new Date(startedAtRaw);
    if (Number.isNaN(startedAt.getTime())) {
        throw new ValidationError('"startedAt" must be a valid ISO 8601 timestamp');
    }

    const report: AgentHeartbeatReport = {
        name: name.trim().slice(0, MAX_NAME_LENGTH),
        status: status,
        startedAt: startedAt,
    };
    if (currentJobId !== undefined) {
        report.currentJobId = currentJobId.slice(0, MAX_JOB_ID_LENGTH);
    }
    return report;
}
