/**
 * Validates and shapes the POST /containers request body. Hand-rolled on purpose:
 * the backend carries no schema library, and these are the only rules. Throws
 * {@link ValidationError} (→ 400) with a message naming the offending field.
 * The name/ports/env field rules live in parse-container-fields.ts, shared
 * with the start-build parser.
 *
 * The image reference deliberately gets only a light sanity check — the full
 * reference grammar (registry hosts with ports, digests, ...) is easy to get
 * wrong, and the daemon is authoritative: its "invalid reference format" (400)
 * and unknown-image (404) answers pass through to the client anyway.
 */

import type { CreateContainerOptions, PortMapping } from '../docker/interfaces.ts';
import {
    containsControlCharacters,
    parseContainerName,
    parseEnvVars,
    parsePortMappings,
} from './parse-container-fields.ts';
import { ValidationError } from './validation-error.ts';

const WHITESPACE_PATTERN = /\s/;
const MAX_IMAGE_REF_LENGTH = 256;

export function parseCreateContainerRequest(body: unknown): CreateContainerOptions {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new ValidationError('Request body must be a JSON object');
    }
    const record = body as Record<string, unknown>;

    const name: string = parseContainerName(record['name']);
    const image: string = parseImage(record['image']);
    const ports: PortMapping[] = parsePortMappings(record['ports']);
    const env: Record<string, string> = parseEnvVars(record['env']);

    return { name: name, image: image, ports: ports, env: env };
}

function parseImage(value: unknown): string {
    if (typeof value !== 'string') {
        throw new ValidationError('"image" must be a string');
    }
    const image = value.trim();
    if (image === '') {
        throw new ValidationError('"image" must not be empty');
    }
    if (image.length > MAX_IMAGE_REF_LENGTH) {
        throw new ValidationError(`"image" must be at most ${MAX_IMAGE_REF_LENGTH} characters`);
    }
    if (WHITESPACE_PATTERN.test(image) || containsControlCharacters(image)) {
        throw new ValidationError('"image" must not contain whitespace or control characters');
    }
    return image;
}
