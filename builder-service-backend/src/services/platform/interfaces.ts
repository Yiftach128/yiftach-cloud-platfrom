/**
 * Builder-side mirrors of the platform's wire types (see
 * platform-backend/src/services/builds/interfaces.ts and
 * platform-backend/src/services/docker/interfaces.ts). The two packages share
 * no code, so these are maintained by hand, like the frontend's fetcher types.
 */

/** One host-to-container TCP port publication. */
export interface PortMapping {
    hostPort: number;
    containerPort: number;
}

/** The container the user asked for at build submission, created after the build. */
export interface BuildContainerConfig {
    name: string;
    ports: PortMapping[];
    env: Record<string, string>;
}

/** One claimed unit of work, as handed out by POST /builds-queue/claim. */
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

/** Body of the platform's POST /containers (mirrors CreateContainerOptions). */
export interface CreateContainerRequest {
    name: string;
    image: string;
    ports: PortMapping[];
    env: Record<string, string>;
}
