import type { Container } from '../fetchers/interfaces.ts';

/** Mirror of the backend's container name rule (services/validation/parse-container-fields.ts). */
export const CONTAINER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/;
export const MAX_CONTAINER_NAME_LENGTH = 63;

/**
 * Every name the given containers hold, aliases included. Unlike the ports
 * snapshot this set is complete: the list endpoint returns stopped containers
 * too, and a name conflicts regardless of state.
 */
export function collectTakenNames(containers: Container[]): Set<string> {
    const taken = new Set<string>();
    for (const container of containers) {
        for (const name of container.names) {
            taken.add(name);
        }
    }
    return taken;
}

/**
 * Makes a string valid against {@link CONTAINER_NAME_PATTERN}, or returns ''
 * when nothing survives: invalid characters become "-", dash runs collapse,
 * the name must start alphanumeric, and it is capped at
 * {@link MAX_CONTAINER_NAME_LENGTH}.
 */
export function sanitizeContainerName(raw: string): string {
    let sanitized: string = raw.replace(/[^a-zA-Z0-9_.-]/g, '-');
    sanitized = sanitized.replace(/-{2,}/g, '-');
    sanitized = sanitized.replace(/^[_.-]+/, '');
    if (sanitized.length > MAX_CONTAINER_NAME_LENGTH) {
        sanitized = sanitized.slice(0, MAX_CONTAINER_NAME_LENGTH);
    }
    sanitized = sanitized.replace(/-+$/, '');
    return sanitized;
}

/**
 * The first free name derived from `base`: the base itself, then "base-2",
 * "base-3", ... The base is truncated before suffixing so a candidate never
 * exceeds {@link MAX_CONTAINER_NAME_LENGTH}. If every candidate is taken
 * (pathological), returns `base` and lets the form's conflict validator
 * flag it.
 */
export function nextFreeName(base: string, takenNames: Set<string>): string {
    if (!takenNames.has(base)) {
        return base;
    }
    const limit: number = takenNames.size + 2;
    for (let suffix = 2; suffix <= limit; suffix++) {
        const suffixText: string = `-${suffix}`;
        let trimmedBase: string = base;
        const maxBaseLength: number = MAX_CONTAINER_NAME_LENGTH - suffixText.length;
        if (trimmedBase.length > maxBaseLength) {
            trimmedBase = trimmedBase.slice(0, maxBaseLength);
        }
        const candidate: string = trimmedBase + suffixText;
        if (!takenNames.has(candidate)) {
            return candidate;
        }
    }
    return base;
}

/**
 * The single entry point for name suggestions: sanitizes the base and bumps
 * it to a free name. Returns '' when the base sanitizes to nothing — the
 * caller leaves the field empty and the required rule prompts instead.
 */
export function suggestContainerName(base: string, takenNames: Set<string>): string {
    const sanitized: string = sanitizeContainerName(base);
    if (sanitized === '') {
        return '';
    }
    return nextFreeName(sanitized, takenNames);
}

/**
 * A name base from an image reference: the last path segment with any tag or
 * digest stripped — "ghcr.io/owner/app:v2" becomes "app", "app@sha256:..."
 * becomes "app". Taking the segment first sidesteps registry-port colons
 * ("localhost:5000/app").
 */
export function deriveNameFromImageReference(reference: string): string {
    const trimmed: string = reference.trim();
    let segment: string;
    const slashIndex: number = trimmed.lastIndexOf('/');
    if (slashIndex === -1) {
        segment = trimmed;
    } else {
        segment = trimmed.slice(slashIndex + 1);
    }
    const atIndex: number = segment.indexOf('@');
    if (atIndex !== -1) {
        segment = segment.slice(0, atIndex);
    }
    const colonIndex: number = segment.indexOf(':');
    if (colonIndex !== -1) {
        segment = segment.slice(0, colonIndex);
    }
    return segment;
}
