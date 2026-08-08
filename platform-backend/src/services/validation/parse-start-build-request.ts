/**
 * Validates the POST /builds request body: the GitHub URL is parsed into the
 * parts the build queue needs, and the container config (name/ports/env — the
 * container the builder creates after the build) rides along, checked by the
 * same field rules as POST /containers. Public repository root URLs only:
 * "https://github.com/owner/repository", optionally with ".git" and/or a
 * "#branch-or-tag" fragment. Throws {@link ValidationError} (→ 400) otherwise.
 */

import type { StartBuildOptions } from '../builds/interfaces.ts';
import type { PortMapping } from '../docker/interfaces.ts';
import {
    parseContainerName,
    parseEnvVars,
    parsePortMappings,
} from './parse-container-fields.ts';
import { ValidationError } from './validation-error.ts';

const REPO_SEGMENT_PATTERN = /^[A-Za-z0-9_.-]+$/;
const GIT_REF_PATTERN = /^[A-Za-z0-9_./-]+$/;
const GIT_SUFFIX = '.git';
/**
 * Docker image reference, simplified: lowercase name parts (optionally
 * slash-separated), plus an optional ":tag". Stricter than the create-path's
 * image check on purpose — this name is *minted* here, not resolved by the
 * daemon against a registry.
 */
const IMAGE_NAME_PATTERN =
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[A-Za-z0-9_][A-Za-z0-9._-]{0,127})?$/;
const MAX_IMAGE_NAME_LENGTH = 200;

export function parseStartBuildRequest(body: unknown): StartBuildOptions {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new ValidationError('Request body must be a JSON object');
    }
    const record = body as Record<string, unknown>;

    const raw = record['gitUrl'];
    if (typeof raw !== 'string' || raw.trim() === '') {
        throw new ValidationError('"gitUrl" must be a non-empty string');
    }

    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        throw new ValidationError('"gitUrl" is not a valid URL');
    }

    if (url.protocol !== 'https:') {
        throw new ValidationError('"gitUrl" must use https');
    }
    if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
        throw new ValidationError('"gitUrl" must point at github.com');
    }
    if (url.username !== '' || url.password !== '') {
        throw new ValidationError('"gitUrl" must not contain credentials');
    }
    if (url.search !== '') {
        throw new ValidationError('"gitUrl" must not have a query string');
    }

    const segments: string[] = url.pathname.split('/').filter((segment) => segment !== '');
    const owner = segments[0];
    const repoSegment = segments[1];
    if (segments.length !== 2 || owner === undefined || repoSegment === undefined) {
        throw new ValidationError(
            '"gitUrl" must be a repository root URL like https://github.com/owner/repository'
                + ' (not a /tree/... or file page)',
        );
    }

    let repo: string = repoSegment;
    if (repo.endsWith(GIT_SUFFIX)) {
        repo = repo.slice(0, repo.length - GIT_SUFFIX.length);
    }
    if (!REPO_SEGMENT_PATTERN.test(owner) || repo === '' || !REPO_SEGMENT_PATTERN.test(repo)) {
        throw new ValidationError('"gitUrl" has an invalid owner or repository name');
    }

    let gitRef: string | undefined;
    if (url.hash !== '') {
        const fragment: string = url.hash.slice(1);
        if (!GIT_REF_PATTERN.test(fragment)) {
            throw new ValidationError('"gitUrl" has an invalid #branch-or-tag fragment');
        }
        gitRef = fragment;
    }

    const name: string = parseContainerName(record['name']);
    const ports: PortMapping[] = parsePortMappings(record['ports']);
    const env: Record<string, string> = parseEnvVars(record['env']);
    const imageName: string | undefined = parseImageName(record['imageName']);

    const options: StartBuildOptions = {
        gitUrl: raw.trim(),
        owner: owner,
        repo: repo,
        container: { name: name, ports: ports, env: env },
    };
    if (gitRef !== undefined) {
        options.gitRef = gitRef;
    }
    if (imageName !== undefined) {
        options.imageName = imageName;
    }
    return options;
}

/** Optional field; an empty or whitespace-only value counts as absent. */
function parseImageName(value: unknown): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string') {
        throw new ValidationError('"imageName" must be a string when present');
    }
    const imageName: string = value.trim();
    if (imageName === '') {
        return undefined;
    }
    if (imageName.length > MAX_IMAGE_NAME_LENGTH) {
        throw new ValidationError(`"imageName" must be at most ${MAX_IMAGE_NAME_LENGTH} characters`);
    }
    if (!IMAGE_NAME_PATTERN.test(imageName)) {
        throw new ValidationError(
            '"imageName" must look like "name" or "name:tag" — lowercase name of letters, digits,'
                + ' ".", "_", "-" (optionally slash-separated), e.g. my-app or team/my-app:v2',
        );
    }
    return imageName;
}
