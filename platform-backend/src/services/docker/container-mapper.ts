/**
 * Maps the Docker daemon's raw container wire shapes onto the platform's `Container`
 * and `ContainerDetails` types. The raw shapes live here, next to the mapping, so
 * `interfaces.ts` never depends on dockerode and the rest of the platform only ever
 * sees the public types.
 */

import type {
    Container,
    ContainerConfigDetails,
    ContainerDetails,
    ContainerHealth,
    ContainerHealthProbe,
    ContainerHealthStatus,
    ContainerHostConfigDetails,
    ContainerLogConfig,
    ContainerMount,
    ContainerRestartPolicy,
    ContainerState,
    ContainerStateDetails,
    NetworkAttachment,
    PortBinding,
} from './interfaces.ts';

/** Networks Docker creates itself; not meaningful as platform topology. */
const BUILT_IN_NETWORKS = new Set(['bridge', 'host', 'none']);

/**
 * Explicit defaulting for optional wire fields — the readable stand-in for `??`,
 * like Java's `Objects.requireNonNullElse`.
 */
function orDefault<T>(value: T | null | undefined, fallback: T): T {
    if (value === undefined || value === null) {
        return fallback;
    }
    return value;
}

/** Missing or null wire arrays map to empty ones. */
function orEmpty<T>(values: T[] | null | undefined): T[] {
    if (values === undefined || values === null) {
        return [];
    }
    return values;
}

/** The daemon types several list fields loosely; keep only the string entries. */
function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((entry): entry is string => typeof entry === 'string');
}

/** Loosely typed string-map wire fields (e.g. log driver options), read defensively. */
function toStringRecord(value: unknown): Record<string, string> {
    if (typeof value !== 'object' || value === null) {
        return {};
    }
    const record = value as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const key of Object.keys(record)) {
        const entry = record[key];
        if (typeof entry === 'string') {
            result[key] = entry;
        }
    }
    return result;
}

/** The daemon uses a year-1 timestamp ("0001-01-01...") to mean "never". */
function parseDaemonDate(value: string | undefined): Date | undefined {
    if (value === undefined || value === '' || value.startsWith('0001-01-01')) {
        return undefined;
    }
    return new Date(value);
}

/*
 * ------------------------------------------------------------------------------
 * List endpoint (GET /containers/json)
 * ------------------------------------------------------------------------------
 */

/**
 * `Dockerode.Port` declares `IP` and `PublicPort` as required, but the daemon omits
 * both for ports that are exposed and not published — so they are typed optional here.
 * Stays here rather than in interfaces.ts because it is a dockerode wire detail.
 */
export interface RawPort {
    PrivatePort: number;
    Type: string;
    PublicPort?: number;
    IP?: string;
}

/**
 * Defensive view of `Dockerode.ContainerInfo`: dockerode declares the collection
 * fields as always present, but this module reads them through this type so a field
 * the daemon omits maps to an empty result instead of a crash at runtime.
 */
export interface RawContainerInfo {
    Id: string;
    Image: string;
    ImageID: string;
    Command: string;
    Created: number;
    State: string;
    Status: string;
    Names?: string[];
    Ports?: RawPort[];
    Labels?: Record<string, string>;
    NetworkSettings?: {
        Networks?: Record<string, unknown>;
    };
}

export function toContainer(info: RawContainerInfo): Container {
    const names = orEmpty(info.Names).map((name) => name.replace(/^\//, ''));

    let name: string;
    const firstName = names[0];
    if (firstName === undefined) {
        name = info.Id.slice(0, 12);
    } else {
        name = firstName;
    }

    const ports = orEmpty(info.Ports).map(toPortBinding);
    const labels = orDefault(info.Labels, {});

    let networks: string[];
    if (info.NetworkSettings === undefined || info.NetworkSettings.Networks === undefined) {
        networks = [];
    } else {
        networks = Object.keys(info.NetworkSettings.Networks).filter(
            (network) => !BUILT_IN_NETWORKS.has(network),
        );
    }

    return {
        id: info.Id,
        name: name,
        names: names,
        image: info.Image,
        imageId: info.ImageID,
        command: info.Command,
        createdAt: new Date(info.Created * 1000),
        state: info.State as ContainerState,
        status: info.Status,
        ports: ports,
        labels: labels,
        networks: networks,
    };
}

function toPortBinding(port: RawPort): PortBinding {
    return {
        privatePort: port.PrivatePort,
        publicPort: port.PublicPort,
        type: port.Type as PortBinding['type'],
        ip: port.IP,
    };
}

/*
 * ------------------------------------------------------------------------------
 * Inspect endpoint (GET /containers/{id}/json)
 * ------------------------------------------------------------------------------
 */

interface RawHealthProbe {
    Start?: string;
    End?: string;
    ExitCode?: number;
    Output?: string;
}

interface RawHealth {
    Status?: string;
    FailingStreak?: number;
    Log?: RawHealthProbe[] | null;
}

interface RawInspectState {
    Status?: string;
    Running?: boolean;
    Paused?: boolean;
    Restarting?: boolean;
    OOMKilled?: boolean;
    Dead?: boolean;
    Pid?: number;
    ExitCode?: number;
    Error?: string;
    StartedAt?: string;
    FinishedAt?: string;
    Health?: RawHealth;
}

interface RawInspectConfig {
    Hostname?: string;
    Domainname?: string;
    User?: string;
    Env?: string[] | null;
    Cmd?: string[] | null;
    Image?: string;
    WorkingDir?: string;
    Entrypoint?: string | string[] | null;
    ExposedPorts?: Record<string, unknown> | null;
    Tty?: boolean;
    Labels?: Record<string, string> | null;
}

interface RawRestartPolicy {
    Name?: string;
    MaximumRetryCount?: number;
}

interface RawLogConfig {
    Type?: string;
    Config?: unknown;
}

interface RawHostConfig {
    NetworkMode?: string;
    RestartPolicy?: RawRestartPolicy;
    AutoRemove?: boolean;
    Privileged?: boolean;
    ReadonlyRootfs?: boolean;
    PublishAllPorts?: boolean;
    Binds?: string[] | null;
    CapAdd?: unknown;
    CapDrop?: unknown;
    Dns?: unknown[] | null;
    ExtraHosts?: unknown;
    SecurityOpt?: unknown;
    LogConfig?: RawLogConfig;
    Memory?: number;
    MemorySwap?: number;
    MemoryReservation?: number;
    NanoCpus?: number;
    CpuShares?: number;
    CpuPeriod?: number;
    CpuQuota?: number;
    CpusetCpus?: string;
    ShmSize?: number;
    PidsLimit?: number | null;
}

interface RawInspectMount {
    Type?: string;
    Name?: string;
    Source?: string;
    Destination?: string;
    Driver?: string;
    Mode?: string;
    RW?: boolean;
    Propagation?: string;
}

interface RawPortMapping {
    HostIp?: string;
    HostPort?: string;
}

interface RawNetworkEndpoint {
    NetworkID?: string;
    EndpointID?: string;
    Gateway?: string;
    IPAddress?: string;
    IPPrefixLen?: number;
    IPv6Gateway?: string;
    GlobalIPv6Address?: string;
    MacAddress?: string;
    Aliases?: unknown;
}

interface RawInspectNetworkSettings {
    Ports?: Record<string, RawPortMapping[] | null> | null;
    Networks?: Record<string, RawNetworkEndpoint> | null;
}

/**
 * Defensive view of `Dockerode.ContainerInspectInfo`, same idea as
 * `RawContainerInfo`: scalar identity fields are trusted, everything nested is read
 * defensively because the daemon omits or nulls fields dockerode declares required.
 */
export interface RawContainerInspectInfo {
    Id: string;
    Created: string;
    Path: string;
    Name: string;
    Image: string;
    Args?: string[] | null;
    Platform?: string;
    Driver?: string;
    RestartCount?: number;
    LogPath?: string;
    ExecIDs?: string[] | null;
    State?: RawInspectState;
    Config?: RawInspectConfig;
    HostConfig?: RawHostConfig;
    Mounts?: RawInspectMount[] | null;
    NetworkSettings?: RawInspectNetworkSettings;
}

export function toContainerDetails(info: RawContainerInspectInfo): ContainerDetails {
    const name = info.Name.replace(/^\//, '');
    const args = orEmpty(info.Args);
    const platform = orDefault(info.Platform, '');
    const driver = orDefault(info.Driver, '');
    const restartCount = orDefault(info.RestartCount, 0);
    const logPath = orDefault(info.LogPath, '');
    const execIds = orEmpty(info.ExecIDs);
    const mounts = orEmpty(info.Mounts).map(toMount);

    let imageReference: string;
    if (info.Config === undefined || info.Config.Image === undefined) {
        imageReference = '';
    } else {
        imageReference = info.Config.Image;
    }

    const networkSettings = orDefault(info.NetworkSettings, {});
    const ports = toInspectPortBindings(networkSettings.Ports);
    const networks = toNetworkAttachments(networkSettings.Networks);

    return {
        id: info.Id,
        name: name,
        image: imageReference,
        imageId: info.Image,
        createdAt: new Date(info.Created),
        path: info.Path,
        args: args,
        platform: platform,
        driver: driver,
        restartCount: restartCount,
        logPath: logPath,
        execIds: execIds,
        state: toStateDetails(info.State),
        config: toConfigDetails(info.Config),
        hostConfig: toHostConfigDetails(info.HostConfig),
        mounts: mounts,
        ports: ports,
        networks: networks,
    };
}

function toStateDetails(state: RawInspectState | undefined): ContainerStateDetails {
    const raw = orDefault(state, {});

    const status = orDefault(raw.Status, 'dead') as ContainerState;
    const running = orDefault(raw.Running, false);
    const paused = orDefault(raw.Paused, false);
    const restarting = orDefault(raw.Restarting, false);
    const oomKilled = orDefault(raw.OOMKilled, false);
    const dead = orDefault(raw.Dead, false);
    const pid = orDefault(raw.Pid, 0);
    const exitCode = orDefault(raw.ExitCode, 0);
    const error = orDefault(raw.Error, '');
    const startedAt = parseDaemonDate(raw.StartedAt);
    const finishedAt = parseDaemonDate(raw.FinishedAt);

    let health: ContainerHealth | undefined;
    if (raw.Health === undefined) {
        health = undefined;
    } else {
        health = toHealth(raw.Health);
    }

    return {
        status: status,
        running: running,
        paused: paused,
        restarting: restarting,
        oomKilled: oomKilled,
        dead: dead,
        pid: pid,
        exitCode: exitCode,
        error: error,
        startedAt: startedAt,
        finishedAt: finishedAt,
        health: health,
    };
}

function toHealth(health: RawHealth): ContainerHealth {
    const status = orDefault(health.Status, 'none') as ContainerHealthStatus;
    const failingStreak = orDefault(health.FailingStreak, 0);

    const log: ContainerHealthProbe[] = [];
    for (const probe of orEmpty(health.Log)) {
        const startedAt = parseDaemonDate(probe.Start);
        const finishedAt = parseDaemonDate(probe.End);
        if (startedAt === undefined || finishedAt === undefined) {
            continue;
        }
        const exitCode = orDefault(probe.ExitCode, 0);
        const output = orDefault(probe.Output, '');
        log.push({
            startedAt: startedAt,
            finishedAt: finishedAt,
            exitCode: exitCode,
            output: output,
        });
    }

    return { status: status, failingStreak: failingStreak, log: log };
}

function toConfigDetails(config: RawInspectConfig | undefined): ContainerConfigDetails {
    const raw = orDefault(config, {});

    const hostname = orDefault(raw.Hostname, '');
    const domainname = orDefault(raw.Domainname, '');
    const user = orDefault(raw.User, '');
    const env = orEmpty(raw.Env);
    const cmd = orEmpty(raw.Cmd);
    const workingDir = orDefault(raw.WorkingDir, '');
    const tty = orDefault(raw.Tty, false);
    const labels = orDefault(raw.Labels, {});

    let entrypoint: string[];
    const rawEntrypoint = raw.Entrypoint;
    if (rawEntrypoint === undefined || rawEntrypoint === null) {
        entrypoint = [];
    } else if (typeof rawEntrypoint === 'string') {
        entrypoint = [rawEntrypoint];
    } else {
        entrypoint = rawEntrypoint;
    }

    let exposedPorts: string[];
    if (raw.ExposedPorts === undefined || raw.ExposedPorts === null) {
        exposedPorts = [];
    } else {
        exposedPorts = Object.keys(raw.ExposedPorts);
    }

    return {
        hostname: hostname,
        domainname: domainname,
        user: user,
        env: env,
        cmd: cmd,
        entrypoint: entrypoint,
        workingDir: workingDir,
        exposedPorts: exposedPorts,
        tty: tty,
        labels: labels,
    };
}

function toHostConfigDetails(hostConfig: RawHostConfig | undefined): ContainerHostConfigDetails {
    const raw = orDefault(hostConfig, {});

    let restartPolicy: ContainerRestartPolicy;
    if (raw.RestartPolicy === undefined) {
        restartPolicy = { name: '', maximumRetryCount: 0 };
    } else {
        const policyName = orDefault(raw.RestartPolicy.Name, '');
        const maximumRetryCount = orDefault(raw.RestartPolicy.MaximumRetryCount, 0);
        restartPolicy = { name: policyName, maximumRetryCount: maximumRetryCount };
    }

    let logConfig: ContainerLogConfig;
    if (raw.LogConfig === undefined) {
        logConfig = { type: '', driverOptions: {} };
    } else {
        const logType = orDefault(raw.LogConfig.Type, '');
        logConfig = { type: logType, driverOptions: toStringRecord(raw.LogConfig.Config) };
    }

    const networkMode = orDefault(raw.NetworkMode, '');
    const autoRemove = orDefault(raw.AutoRemove, false);
    const privileged = orDefault(raw.Privileged, false);
    const readonlyRootfs = orDefault(raw.ReadonlyRootfs, false);
    const publishAllPorts = orDefault(raw.PublishAllPorts, false);
    const binds = orEmpty(raw.Binds);
    const capAdd = toStringArray(raw.CapAdd);
    const capDrop = toStringArray(raw.CapDrop);
    const dns = toStringArray(raw.Dns);
    const extraHosts = toStringArray(raw.ExtraHosts);
    const securityOpt = toStringArray(raw.SecurityOpt);
    const memory = orDefault(raw.Memory, 0);
    const memorySwap = orDefault(raw.MemorySwap, 0);
    const memoryReservation = orDefault(raw.MemoryReservation, 0);
    const nanoCpus = orDefault(raw.NanoCpus, 0);
    const cpuShares = orDefault(raw.CpuShares, 0);
    const cpuPeriod = orDefault(raw.CpuPeriod, 0);
    const cpuQuota = orDefault(raw.CpuQuota, 0);
    const cpusetCpus = orDefault(raw.CpusetCpus, '');
    const shmSize = orDefault(raw.ShmSize, 0);
    const pidsLimit = orDefault(raw.PidsLimit, 0);

    return {
        networkMode: networkMode,
        restartPolicy: restartPolicy,
        autoRemove: autoRemove,
        privileged: privileged,
        readonlyRootfs: readonlyRootfs,
        publishAllPorts: publishAllPorts,
        binds: binds,
        capAdd: capAdd,
        capDrop: capDrop,
        dns: dns,
        extraHosts: extraHosts,
        securityOpt: securityOpt,
        logConfig: logConfig,
        memory: memory,
        memorySwap: memorySwap,
        memoryReservation: memoryReservation,
        nanoCpus: nanoCpus,
        cpuShares: cpuShares,
        cpuPeriod: cpuPeriod,
        cpuQuota: cpuQuota,
        cpusetCpus: cpusetCpus,
        shmSize: shmSize,
        pidsLimit: pidsLimit,
    };
}

function toMount(mount: RawInspectMount): ContainerMount {
    const type = orDefault(mount.Type, '');
    const source = orDefault(mount.Source, '');
    const destination = orDefault(mount.Destination, '');
    const mode = orDefault(mount.Mode, '');
    const readWrite = orDefault(mount.RW, false);
    const propagation = orDefault(mount.Propagation, '');

    return {
        type: type,
        name: mount.Name,
        source: source,
        destination: destination,
        driver: mount.Driver,
        mode: mode,
        readWrite: readWrite,
        propagation: propagation,
    };
}

/** Inspect reports ports as a map of "80/tcp" to host bindings (null when unpublished). */
function toInspectPortBindings(
    ports: Record<string, RawPortMapping[] | null> | null | undefined,
): PortBinding[] {
    const bindings: PortBinding[] = [];
    if (ports === undefined || ports === null) {
        return bindings;
    }

    for (const portAndProtocol of Object.keys(ports)) {
        const privatePort = parsePrivatePort(portAndProtocol);
        const type = parsePortType(portAndProtocol);

        const mappings = ports[portAndProtocol];
        if (mappings === undefined || mappings === null || mappings.length === 0) {
            bindings.push({ privatePort: privatePort, type: type });
            continue;
        }

        for (const mapping of mappings) {
            let publicPort: number | undefined;
            if (mapping.HostPort === undefined || mapping.HostPort === '') {
                publicPort = undefined;
            } else {
                publicPort = Number(mapping.HostPort);
            }
            bindings.push({
                privatePort: privatePort,
                publicPort: publicPort,
                type: type,
                ip: mapping.HostIp,
            });
        }
    }
    return bindings;
}

function parsePrivatePort(portAndProtocol: string): number {
    const slashIndex = portAndProtocol.indexOf('/');
    if (slashIndex === -1) {
        return Number(portAndProtocol);
    }
    return Number(portAndProtocol.slice(0, slashIndex));
}

function parsePortType(portAndProtocol: string): PortBinding['type'] {
    const slashIndex = portAndProtocol.indexOf('/');
    if (slashIndex === -1) {
        return 'tcp';
    }
    return portAndProtocol.slice(slashIndex + 1) as PortBinding['type'];
}

function toNetworkAttachments(
    networks: Record<string, RawNetworkEndpoint> | null | undefined,
): NetworkAttachment[] {
    const attachments: NetworkAttachment[] = [];
    if (networks === undefined || networks === null) {
        return attachments;
    }

    for (const name of Object.keys(networks)) {
        const endpoint = networks[name];
        if (endpoint === undefined) {
            continue;
        }
        const networkId = orDefault(endpoint.NetworkID, '');
        const endpointId = orDefault(endpoint.EndpointID, '');
        const macAddress = orDefault(endpoint.MacAddress, '');
        const ipAddress = orDefault(endpoint.IPAddress, '');
        const ipPrefixLength = orDefault(endpoint.IPPrefixLen, 0);
        const gateway = orDefault(endpoint.Gateway, '');
        const ipv6Address = orDefault(endpoint.GlobalIPv6Address, '');
        const ipv6Gateway = orDefault(endpoint.IPv6Gateway, '');
        const aliases = toStringArray(endpoint.Aliases);

        attachments.push({
            name: name,
            networkId: networkId,
            endpointId: endpointId,
            macAddress: macAddress,
            ipAddress: ipAddress,
            ipPrefixLength: ipPrefixLength,
            gateway: gateway,
            ipv6Address: ipv6Address,
            ipv6Gateway: ipv6Gateway,
            aliases: aliases,
        });
    }
    return attachments;
}
