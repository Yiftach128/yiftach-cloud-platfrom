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

/** Health states the daemon reports for a container with a configured healthcheck. */
export type ContainerHealthStatus = 'starting' | 'healthy' | 'unhealthy' | 'none';

/** One healthcheck probe run, from the container's health log. */
export interface ContainerHealthProbe {
    startedAt: Date;
    finishedAt: Date;
    exitCode: number;
    output: string;
}

export interface ContainerHealth {
    status: ContainerHealthStatus;
    /** Consecutive failed probes so far. */
    failingStreak: number;
    /** Recent probe runs, oldest first. */
    log: ContainerHealthProbe[];
}

/** Runtime state of a container, from the inspect endpoint. */
export interface ContainerStateDetails {
    status: ContainerState;
    running: boolean;
    paused: boolean;
    restarting: boolean;
    /** True when the kernel's OOM killer terminated the container. */
    oomKilled: boolean;
    dead: boolean;
    /** Host PID of the container's main process; 0 when not running. */
    pid: number;
    /** Exit code of the last run; 0 while running or never started. */
    exitCode: number;
    /** Daemon-reported error from the last start attempt; empty when none. */
    error: string;
    /** Unset when the container has never been started. */
    startedAt?: Date;
    /** Unset when the container has never finished a run. */
    finishedAt?: Date;
    /** Present only when the container defines a healthcheck. */
    health?: ContainerHealth;
}

/** The container's creation-time configuration. */
export interface ContainerConfigDetails {
    hostname: string;
    domainname: string;
    /** User the container process runs as; empty means the image default. */
    user: string;
    /** Environment as raw "KEY=value" entries. */
    env: string[];
    cmd: string[];
    entrypoint: string[];
    workingDir: string;
    /** Exposed ports as "80/tcp" strings, whether published or not. */
    exposedPorts: string[];
    tty: boolean;
    labels: Record<string, string>;
}

export interface ContainerRestartPolicy {
    /** "no", "always", "unless-stopped" or "on-failure"; empty when unset. */
    name: string;
    /** Retry budget when name is "on-failure"; 0 otherwise. */
    maximumRetryCount: number;
}

export interface ContainerLogConfig {
    /** Logging driver, e.g. "json-file". */
    type: string;
    driverOptions: Record<string, string>;
}

/**
 * Host-side settings the container was created with. Resource limits of 0 mean
 * "unlimited".
 */
export interface ContainerHostConfigDetails {
    /** e.g. "bridge", "host", or "container:<id>". */
    networkMode: string;
    restartPolicy: ContainerRestartPolicy;
    autoRemove: boolean;
    privileged: boolean;
    readonlyRootfs: boolean;
    publishAllPorts: boolean;
    /** Volume bindings as raw "host:container[:mode]" entries. */
    binds: string[];
    capAdd: string[];
    capDrop: string[];
    dns: string[];
    /** Extra /etc/hosts entries as "host:ip". */
    extraHosts: string[];
    securityOpt: string[];
    logConfig: ContainerLogConfig;
    /** Memory limit in bytes. */
    memory: number;
    /** Memory + swap limit in bytes; -1 means unlimited swap. */
    memorySwap: number;
    /** Soft memory limit in bytes. */
    memoryReservation: number;
    /** CPU limit in billionths of a CPU. */
    nanoCpus: number;
    cpuShares: number;
    cpuPeriod: number;
    cpuQuota: number;
    /** CPUs the container is pinned to, e.g. "0-2"; empty when unpinned. */
    cpusetCpus: string;
    /** /dev/shm size in bytes. */
    shmSize: number;
    /** Maximum number of processes; 0 when unlimited. */
    pidsLimit: number;
}

export interface ContainerMount {
    /** "bind", "volume", "tmpfs", ... */
    type: string;
    /** Volume name, for volume mounts. */
    name?: string;
    source: string;
    destination: string;
    /** Volume driver, for volume mounts. */
    driver?: string;
    mode: string;
    readWrite: boolean;
    propagation: string;
}

/** One network the container is attached to, with its endpoint addressing. */
export interface NetworkAttachment {
    name: string;
    networkId: string;
    endpointId: string;
    macAddress: string;
    ipAddress: string;
    ipPrefixLength: number;
    gateway: string;
    ipv6Address: string;
    ipv6Gateway: string;
    aliases: string[];
}

/**
 * Everything the daemon's inspect endpoint reports about one container, in the
 * platform's shape. Unlike `Container.networks`, the `networks` here include
 * Docker's built-in networks — the detail view hides nothing.
 */
export interface ContainerDetails {
    id: string;
    /** Primary name, without the leading slash Docker adds. */
    name: string;
    /** Image reference the container was created from, e.g. "nginx:latest". */
    image: string;
    /** Image ID (sha256). */
    imageId: string;
    createdAt: Date;
    /** Binary the container runs, with its arguments. */
    path: string;
    args: string[];
    platform: string;
    /** Storage driver, e.g. "overlay2". */
    driver: string;
    /** Times the daemon restarted the container under its restart policy. */
    restartCount: number;
    /** Host path of the container's log file. */
    logPath: string;
    /** Exec sessions currently running inside the container. */
    execIds: string[];
    state: ContainerStateDetails;
    config: ContainerConfigDetails;
    hostConfig: ContainerHostConfigDetails;
    mounts: ContainerMount[];
    /** Exposed and published ports, same shape as in `Container`. */
    ports: PortBinding[];
    networks: NetworkAttachment[];
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
