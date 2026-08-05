/**
 * Public types for the image build job service.
 *
 * A build job wraps one daemon-side git build. Jobs live in memory only: the
 * registry is the single source of truth while the server runs, and a restart
 * forgets finished and running jobs alike (the client polling a lost job gets
 * a 404 and reports the build as no longer trackable).
 */

export type BuildJobStatus = 'running' | 'succeeded' | 'failed';

export interface BuildJob {
    /** Random UUID assigned at start. */
    id: string;
    status: BuildJobStatus;
    /** Repository URL as the user submitted it. */
    gitUrl: string;
    /** Tag the built image gets on success; what a follow-up create uses. */
    imageTag: string;
    createdAt: Date;
    /** Set when the job reaches a terminal status. */
    finishedAt?: Date;
    /** Most recent progress lines, oldest first, capped at the registry's limit. */
    logLines: string[];
    /** The daemon's failure message; present only when status is 'failed'. */
    errorMessage?: string;
}

export interface StartBuildOptions {
    /** URL as the user submitted it, e.g. "https://github.com/owner/repo#branch". */
    gitUrl: string;
    /** Repository owner, parsed from the URL by request validation. */
    owner: string;
    /** Repository name without any ".git" suffix, parsed by request validation. */
    repo: string;
    /** Branch or tag from the URL's "#fragment", when one was given. */
    gitRef?: string;
}
