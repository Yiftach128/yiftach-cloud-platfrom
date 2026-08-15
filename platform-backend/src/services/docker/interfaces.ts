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

/** Options for resolveDockerEndpoint. Explicit host/port win over the dockerHost string. */
export interface ResolveDockerEndpointOptions
    extends Pick<DockerManagerOptions, 'host' | 'port' | 'protocol' | 'ca' | 'cert' | 'key'> {
    /**
     * Docker CLI style endpoint (e.g. "tcp://127.0.0.1:2375"), consulted when
     * host/port are not given. Malformed values are ignored rather than thrown,
     * so a stray value can't break startup.
     */
    dockerHost?: string;
}

/**
 * The slice of a daemon lifecycle the manager depends on — kept as an interface so
 * the manager never imports a concrete (platform-specific) implementation. The WSL
 * implementation lives in `src/services/wsl/`.
 */
export interface DockerDaemonLifecycle {
    /** Resolves once the daemon answers; rejects if it cannot be brought up. */
    ensureRunning(): Promise<void>;
}

/**
 * Host-level file access on the machine where dockerd runs. The Engine API has no
 * endpoint for touching daemon-side files — clearing a container's log means
 * truncating the log driver's file on the daemon host — so each deployment
 * supplies this capability (here: running commands inside the WSL distro).
 */
export interface DockerHostFiles {
    /** Truncates a file on the daemon host to zero bytes. Rejects if the file cannot be touched. */
    truncateFile(absolutePath: string): Promise<void>;
}

/**
 * The slice of image acquisition the manager depends on — kept as an interface
 * (like {@link DockerDaemonLifecycle}) so the manager never imports the concrete
 * image service. Implemented by `DockerImageService` in this folder.
 */
export interface DockerImageProvider {
    /** Makes `reference` available locally, pulling it from its registry when missing. */
    ensureImageExists(reference: string): Promise<void>;
}

export interface DockerManagerOptions {
    /** Defaults to 127.0.0.1; the composition root passes the configured endpoint. */
    host?: string;
    /** Defaults to 2375; the composition root passes the configured endpoint. */
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
    /**
     * Daemon-host file access, required only by `clearContainerLogs`. Omitting it
     * makes that operation fail; everything else works without it.
     */
    hostFiles?: DockerHostFiles;
    /**
     * Image acquisition, used by `createContainer` to pull a missing image before
     * creating. Omitting it makes creating from a not-yet-pulled image surface the
     * engine's 404; everything else works without it.
     */
    images?: DockerImageProvider;
}

/**
 * Options for the image service. The endpoint fields mirror
 * {@link DockerManagerOptions} so both services resolve the same daemon; there is
 * deliberately no `requestTimeoutMs` — pulls and builds legitimately run for
 * minutes, so the image service's client has no socket timeout at all (hung
 * transfers are caught by the progress stream's idle watchdog instead).
 */
export interface DockerImageServiceOptions {
    /** Defaults to 127.0.0.1; the composition root passes the configured endpoint. */
    host?: string;
    /** Defaults to 2375; the composition root passes the configured endpoint. */
    port?: number;
    /** Defaults to https when TLS material is supplied, otherwise http. */
    protocol?: 'http' | 'https';
    /** Pinned Engine API version, e.g. "v1.55". Omit to use the daemon's default. */
    apiVersion?: string;
    /** mTLS material for a `--tlsverify` daemon on 2376 (see {@link DockerManagerOptions}). */
    ca?: string | Buffer;
    cert?: string | Buffer;
    key?: string | Buffer;
    /**
     * Lifecycle hook used when a request finds the daemon dead: the service calls
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

/** One host→container port publication. TCP only for now; the shape leaves room for a protocol field. */
export interface PortMapping {
    /** Port opened on the Windows host. */
    hostPort: number;
    /** Port the service listens on inside the container. */
    containerPort: number;
}

export interface CreateContainerOptions {
    /** Container name; also the DNS name on user-defined networks. */
    name: string;
    /** Image reference to create from, e.g. "redis:8". Pulled first when missing locally. */
    image: string;
    /** Ports to publish. Empty means the container runs with nothing published. */
    ports: PortMapping[];
    /** Environment variables by name; values are passed to the container verbatim. */
    env: Record<string, string>;
}

/** One image from the daemon's image list. */
export interface ImageSummary {
    id: string;
    /** Repository tags, e.g. "cloudplatform/build-owner-repo:a1b2c3d4"; empty for dangling images. */
    tags: string[];
    createdAt: Date;
    /** Image disk size in bytes, as reported by the daemon. */
    sizeBytes: number;
    labels: Record<string, string>;
    /** Containers created from this image; -1 when the daemon does not compute the count. */
    containers: number;
}

/** One container port an image's Dockerfile EXPOSEs. */
export interface ImageExposedPort {
    port: number;
    /** "tcp", "udp" or "sctp". */
    protocol: string;
}

/**
 * Detailed view of one platform-built image, from the daemon's inspect
 * endpoint (GET /images/:id). The build-provenance labels the builder stamps
 * (cloudplatform.repo-url, .git-ref, .commit, .build-job-id) arrive in
 * `labels`, untouched.
 */
export interface ImageDetails {
    id: string;
    /** Repository tags; empty for dangling images. */
    tags: string[];
    createdAt: Date;
    /**
     * On-disk size in bytes, taken from the daemon's *list* endpoint so it
     * always matches the images table (under the containerd image store,
     * inspect's own Size is the compressed content size instead); -1 when
     * unavailable.
     */
    sizeBytes: number;
    labels: Record<string, string>;
    /** Ports the image EXPOSEs, ascending; empty when the Dockerfile declares none. */
    exposedPorts: ImageExposedPort[];
    /** e.g. "amd64"; empty when the daemon omits it. */
    architecture: string;
    /** e.g. "linux"; empty when the daemon omits it. */
    os: string;
}

export interface DeleteContainerOptions {
    /** Kill the container if it is running. Without this, deleting a running container fails. */
    force?: boolean;
    /** Also remove anonymous volumes attached to the container. Named volumes are never removed. */
    removeVolumes?: boolean;
}

export interface StopContainerOptions {
    /** Seconds the daemon waits for a graceful stop before killing the container. Daemon default is 10. */
    timeoutSeconds?: number;
}

export interface RestartContainerOptions {
    /** Seconds the daemon waits for the stop phase before killing the container. Daemon default is 10. */
    timeoutSeconds?: number;
}

export interface GetContainerLogsOptions {
    /** Only the last N lines, or 'all' for the full log. Defaults to 500. */
    tail?: number | 'all';
    /**
     * Only lines logged at or after this time, as an RFC3339 timestamp. Kept a
     * string end to end so nanosecond precision survives (a JS Date cannot hold
     * it) — pass a previous line's `timestamp` to resume where a poll left off.
     * The filter is inclusive: the line carrying that exact timestamp repeats.
     */
    since?: string;
}

/** One log line, in the order the daemon reported it. */
export interface ContainerLogLine {
    /** Origin stream. TTY containers merge both streams at the source; their lines all report 'stdout'. */
    stream: 'stdout' | 'stderr';
    /**
     * When the line was logged, as the daemon's RFC3339Nano string (e.g.
     * "2026-08-02T18:46:42.037262344Z"). Deliberately a string, not a Date:
     * nanosecond precision must survive a round trip back into
     * {@link GetContainerLogsOptions.since}. Empty only if the daemon ever emits
     * a line without a parseable timestamp prefix.
     */
    timestamp: string;
    /** Line text without the trailing newline or the timestamp prefix. */
    text: string;
}

export interface ContainerLogs {
    /** True when the container runs a TTY, meaning the stdout/stderr distinction is lost. */
    tty: boolean;
    lines: ContainerLogLine[];
}

/** Point-in-time resource usage of one running container, from the daemon's stats endpoint. */
export interface ContainerStats {
    /**
     * CPU usage as `docker stats` reports it: 100 means one full core, so a
     * container busy on several cores can exceed 100.
     */
    cpuPercent: number;
    /** Bytes of memory in use, excluding the reclaimable page cache (matches `docker stats`). */
    memoryUsedBytes: number;
    /** The container's memory limit in bytes — the host's total memory when unlimited. */
    memoryLimitBytes: number;
}

/**
 * One stats sample per running container, keyed by full container id. Stopped
 * containers never appear; a running container can be absent when it vanished
 * while the samples were being taken.
 */
export type ContainerStatsMap = Record<string, ContainerStats>;
