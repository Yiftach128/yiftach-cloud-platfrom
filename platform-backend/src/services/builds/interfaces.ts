/**
 * Public types for the build queue service.
 *
 * A build job wraps one image build, worked off by the external builder
 * service (builder-service-backend): it claims the oldest queued job, clones
 * and builds on its side, streams progress lines back, creates the container
 * through POST /containers, and reports the terminal result. Jobs live in
 * memory only: the registry is the single source of truth while the server
 * runs, and a restart forgets queued, running, and finished jobs alike (the
 * client polling a lost job gets a 404; the builder abandons on the same 404).
 */

import type { PortMapping } from '../docker/interfaces.ts';

export type BuildJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface BuildJob {
    /** Random UUID assigned at enqueue. */
    id: string;
    status: BuildJobStatus;
    /** Repository URL as the user submitted it. */
    gitUrl: string;
    /** Tag the built image gets on success. */
    imageTag: string;
    /** Name of the container the builder creates after a successful build. */
    containerName: string;
    createdAt: Date;
    /** Set when the job reaches a terminal status. */
    finishedAt?: Date;
    /** Most recent progress lines, oldest first, capped at the registry's limit. */
    logLines: string[];
    /** The failure message; present only when status is 'failed'. */
    errorMessage?: string;
}

/** The container the user asked for at submission; created by the builder after the build. */
export interface BuildContainerConfig {
    name: string;
    ports: PortMapping[];
    env: Record<string, string>;
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
    /** Container to create once the image is built. */
    container: BuildContainerConfig;
}

/** One claimed unit of work, handed to the builder by POST /builds-queue/claim. */
export interface BuildTask {
    jobId: string;
    /** Canonical clone URL (https://github.com/owner/repo.git). */
    gitUrl: string;
    /** Branch or tag to check out; the default branch when absent. */
    gitRef?: string;
    /** Tag the built image must carry. */
    imageTag: string;
    container: BuildContainerConfig;
}

/** Body of POST /builds-queue/:id/result. */
export interface BuildResultReport {
    status: 'succeeded' | 'failed';
    errorMessage?: string;
}

/**
 * The registry's internal record: the claim payload and the activity stamp
 * stay off the GET /builds/:id wire, which serializes the inner job only.
 */
export interface BuildJobRecord {
    job: BuildJob;
    /** Canonical clone URL handed to the builder. */
    cloneUrl: string;
    gitRef?: string;
    container: BuildContainerConfig;
    /** Epoch ms of the last claim/log/result touch; drives the stale sweep. */
    lastActivityAt: number;
}
