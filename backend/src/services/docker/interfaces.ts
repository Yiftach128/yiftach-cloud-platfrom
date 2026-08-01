/**
 * Public types for the Docker manager service.
 *
 * dockerode's raw wire shapes never appear here — callers only ever see these types,
 * so the transport library can change without rippling outwards.
 */

/** Lifecycle states reported by the Engine API. */
export type ContainerState =
    | 'created'
    | 'restarting'
    | 'running'
    | 'removing'
    | 'paused'
    | 'exited'
    | 'dead';

export interface PortBinding {
    /** Port inside the container. */
    privatePort: number;
    /** Host port, when the port is published. */
    publicPort?: number;
    type: 'tcp' | 'udp' | 'sctp';
    /** Host interface the port is published on. */
    ip?: string;
}

export interface Container {
    id: string;
    /** Primary name, without the leading slash Docker adds. */
    name: string;
    /** All names, including network aliases. */
    names: string[];
    image: string;
    imageId: string;
    command: string;
    createdAt: Date;
    state: ContainerState;
    /** Human-readable status, e.g. "Exited (0) 4 minutes ago". */
    status: string;
    ports: PortBinding[];
    labels: Record<string, string>;
    /** User-defined networks this container is attached to. */
    networks: string[];
}

/** A fully resolved daemon endpoint (see resolve-docker-endpoint.ts). */
export interface DockerEndpoint {
    host: string;
    port: number;
    protocol: 'http' | 'https';
    /** e.g. "http://127.0.0.1:2375" */
    baseUrl: string;
}

/**
 * The slice of a daemon lifecycle the manager depends on — kept as an interface so
 * the manager never imports a concrete (platform-specific) implementation. The WSL
 * implementation lives in `src/services/wsl-bootstrap/`.
 */
export interface DockerDaemonLifecycle {
    /** Resolves once the daemon answers; rejects if it cannot be brought up. */
    ensureRunning(): Promise<void>;
}

export interface DockerManagerOptions {
    /** Defaults to DOCKER_HOST, else 127.0.0.1. */
    host?: string;
    /** Defaults to DOCKER_HOST, else 2375. */
    port?: number;
    /** Defaults to https when TLS material is supplied, otherwise http. */
    protocol?: 'http' | 'https';
    /** Pinned Engine API version, e.g. "v1.55". Omit to use the daemon's default. */
    apiVersion?: string;
    /** Socket timeout in ms. Defaults to 10s. */
    requestTimeoutMs?: number;
    /**
     * mTLS material for a `--tlsverify` daemon on 2376. Supplying any of these
     * switches the default protocol to https.
     */
    ca?: string | Buffer;
    cert?: string | Buffer;
    key?: string | Buffer;
    /**
     * Lifecycle hook used when a request finds the daemon dead: the manager calls
     * `ensureRunning()` and retries the request once.
     */
    daemon?: DockerDaemonLifecycle;
}

export interface GetContainersOptions {
    /** Include stopped containers. Defaults to true. */
    all?: boolean;
    /**
     * Engine-side filters, e.g. `{ label: ['cloudplatform.managed=true'] }`.
     * Applied by the daemon, so this is cheaper than filtering the result.
     */
    filters?: Record<string, string[]>;
}

export interface DeleteContainerOptions {
    /** Kill the container if it is running. Without this, deleting a running container fails. */
    force?: boolean;
    /** Also remove anonymous volumes attached to the container. Named volumes are never removed. */
    removeVolumes?: boolean;
}
