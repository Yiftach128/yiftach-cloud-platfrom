/**
 * Wire types for the backend Docker API (/api/v1), mirroring
 * backend/src/services/docker/interfaces.ts.
 *
 * Kept as a hand-maintained copy on purpose: the two packages share no build,
 * and the shapes differ where JSON serialization flattens them (the backend's
 * `createdAt: Date` arrives here as an ISO 8601 string).
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
    /** ISO 8601 timestamp (a Date on the backend, serialized by JSON). */
    createdAt: string;
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
    /** ISO 8601 timestamp (a Date on the backend, serialized by JSON). */
    startedAt: string;
    /** ISO 8601 timestamp (a Date on the backend, serialized by JSON). */
    finishedAt: string;
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
    /** ISO 8601 timestamp; unset when the container has never been started. */
    startedAt?: string;
    /** ISO 8601 timestamp; unset when the container has never finished a run. */
    finishedAt?: string;
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
    /** ISO 8601 timestamp (a Date on the backend, serialized by JSON). */
    createdAt: string;
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
