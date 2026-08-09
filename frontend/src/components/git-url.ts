import type { GitHubUrlParts } from './interfaces.ts';

/** Mirror of the backend's git-ref rule (services/validation/parse-start-build-request.ts). */
export const GIT_REF_PATTERN = /^[A-Za-z0-9_./-]+$/;

/** Charset the backend accepts for the owner and repository path segments. */
const GITHUB_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9_.-]+$/;

/**
 * Decomposes a pasted GitHub URL into its repository root and, when present,
 * a branch/tag: "https://github.com/o/r/tree/feature/x?tab=readme" becomes
 * the canonical "https://github.com/o/r" plus ref "feature/x". Everything
 * after "/tree/" is taken as the ref — right for the address-bar URL of a
 * branch root, ambiguous when a subpath is appended. Other path extras
 * ("/blob/...", "/issues") mix branch and file path, so no guess is made and
 * they are simply stripped to the repo root. A "#fragment" also carries a
 * ref; a ref failing {@link GIT_REF_PATTERN} is dropped while the URL still
 * normalizes. Query strings, "www.", a trailing ".git" and trailing slashes
 * all normalize away. Returns null for anything that is not an https GitHub
 * repository URL.
 */
export function normalizeGitHubUrl(raw: string): GitHubUrlParts | null {
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        return null;
    }
    if (url.protocol !== 'https:') {
        return null;
    }
    if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
        return null;
    }
    if (url.username !== '' || url.password !== '') {
        return null;
    }

    const segments: string[] = url.pathname.split('/').filter((segment: string) => segment !== '');
    const owner: string | undefined = segments[0];
    const repoSegment: string | undefined = segments[1];
    if (owner === undefined || repoSegment === undefined) {
        return null;
    }
    let repo: string = repoSegment;
    if (repo.endsWith('.git')) {
        repo = repo.slice(0, repo.length - 4);
    }
    if (!GITHUB_PATH_SEGMENT_PATTERN.test(owner) || !GITHUB_PATH_SEGMENT_PATTERN.test(repo)) {
        return null;
    }

    let ref: string | undefined;
    if (segments.length > 3 && segments[2] === 'tree') {
        ref = segments.slice(3).join('/');
    } else if (url.hash !== '') {
        ref = url.hash.slice(1);
    }
    if (ref !== undefined && !GIT_REF_PATTERN.test(ref)) {
        ref = undefined;
    }

    const parts: GitHubUrlParts = {
        gitUrl: `https://github.com/${owner}/${repo}`,
        owner: owner,
        repo: repo,
    };
    if (ref !== undefined) {
        parts.gitRef = ref;
    }
    return parts;
}
