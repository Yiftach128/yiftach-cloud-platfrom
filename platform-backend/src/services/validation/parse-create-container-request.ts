/**
 * Validates and shapes the POST /containers request body. Hand-rolled on purpose:
 * the backend carries no schema library, and these are the only rules. Throws
 * {@link ValidationError} (→ 400) with a message naming the offending field.
 *
 * The image reference deliberately gets only a light sanity check — the full
 * reference grammar (registry hosts with ports, digests, ...) is easy to get
 * wrong, and the daemon is authoritative: its "invalid reference format" (400)
 * and unknown-image (404) answers pass through to the client anyway.
 */

import type { CreateContainerOptions, PortMapping } from '../docker/interfaces.ts';
import { ValidationError } from './validation-error.ts';

/** Docker's container-name charset, capped at 63 characters (a DNS label). */
const CONTAINER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/;
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const WHITESPACE_PATTERN = /\s/;
const MAX_IMAGE_REF_LENGTH = 256;
const MAX_ENV_VARS = 100;
const MIN_PORT = 1;
const MAX_PORT = 65535;

export function parseCreateContainerRequest(body: unknown): CreateContainerOptions {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new ValidationError('Request body must be a JSON object');
    }
    const record = body as Record<string, unknown>;

    const name: string = parseName(record['name']);
    const image: string = parseImage(record['image']);
    const ports: PortMapping[] = parsePorts(record['ports']);
    const env: Record<string, string> = parseEnv(record['env']);

    return { name: name, image: image, ports: ports, env: env };
}

function parseName(value: unknown): string {
    if (typeof value !== 'string' || !CONTAINER_NAME_PATTERN.test(value)) {
        throw new ValidationError(
            '"name" must be 1-63 characters of letters, digits, "_", ".", or "-", starting with a letter or digit',
        );
    }
    return value;
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

/** True when the text contains an ASCII control character (below space, or DEL). */
function containsControlCharacters(text: string): boolean {
    for (const character of text) {
        const code = character.codePointAt(0);
        if (code !== undefined && (code < 32 || code === 127)) {
            return true;
        }
    }
    return false;
}

function parsePorts(value: unknown): PortMapping[] {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new ValidationError('"ports" must be an array of { hostPort, containerPort } objects');
    }

    const mappings: PortMapping[] = [];
    const seenHostPorts = new Set<number>();
    for (const entry of value) {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
            throw new ValidationError('each entry in "ports" must be a { hostPort, containerPort } object');
        }
        const record = entry as Record<string, unknown>;
        const hostPort: number = parsePortNumber(record['hostPort'], 'hostPort');
        const containerPort: number = parsePortNumber(record['containerPort'], 'containerPort');

        // The same container port may be published to several host ports, but one
        // host port cannot serve two mappings.
        if (seenHostPorts.has(hostPort)) {
            throw new ValidationError(`"ports" lists hostPort ${hostPort} more than once`);
        }
        seenHostPorts.add(hostPort);

        mappings.push({ hostPort: hostPort, containerPort: containerPort });
    }
    return mappings;
}

function parsePortNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_PORT || value > MAX_PORT) {
        throw new ValidationError(`"${field}" must be an integer between ${MIN_PORT} and ${MAX_PORT}`);
    }
    return value;
}

function parseEnv(value: unknown): Record<string, string> {
    if (value === undefined) {
        return {};
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new ValidationError('"env" must be an object mapping variable names to string values');
    }

    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_ENV_VARS) {
        throw new ValidationError(`"env" must have at most ${MAX_ENV_VARS} entries`);
    }

    const env: Record<string, string> = {};
    for (const [name, raw] of entries) {
        if (!ENV_NAME_PATTERN.test(name)) {
            throw new ValidationError(
                `"env" contains an invalid variable name "${name}" (letters, digits and "_", not starting with a digit)`,
            );
        }
        if (typeof raw !== 'string') {
            throw new ValidationError(`"env.${name}" must be a string`);
        }
        if (containsControlCharacters(raw)) {
            throw new ValidationError(`"env.${name}" must not contain control characters`);
        }
        env[name] = raw;
    }
    return env;
}
