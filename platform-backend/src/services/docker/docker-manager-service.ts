/**
 * Docker manager — a typed facade over the Docker Engine API, backed by dockerode.
 *
 * The daemon runs inside WSL2 Ubuntu and is reached over TCP. It must be bound to an
 * IPv4 address: WSL2's localhost relay only forwards listeners it sees in /proc/net/tcp,
 * so a `tcp://0.0.0.0` bind (which Docker turns into a dual-stack `[::]` socket) is
 * reachable from inside WSL but not from Windows.
 *
 * dockerode's raw shapes stay inside this folder's implementation files (the wire
 * mapping in `container-mapper.ts`, failure classification in
 * `classify-dockerode-error.ts`) — callers get the types in `./interfaces.ts`, so
 * swapping transport or library again doesn't ripple outwards.
 */

import Docker from 'dockerode';

import { toContainer, toContainerDetails } from './container-mapper.ts';
import { DaemonRequestRunner } from './daemon-request-runner.ts';
import { DockerApiError } from './docker-api-error.ts';
import type {
    Container,
    ContainerDetails,
    ContainerLogs,
    CreateContainerOptions,
    DeleteContainerOptions,
    DockerHostFiles,
    DockerImageProvider,
    DockerManagerOptions,
    GetContainerLogsOptions,
    GetContainersOptions,
    RestartContainerOptions,
    StopContainerOptions,
} from './interfaces.ts';
import { LogsNotClearableError } from './logs-not-clearable-error.ts';
import { parseContainerLogs } from './parse-container-logs.ts';
import { resolveDockerEndpoint } from './resolve-docker-endpoint.ts';
import { toDaemonTimestamp } from './to-daemon-timestamp.ts';

export * from './docker-api-error.ts';
export * from './docker-connection-error.ts';
export * from './interfaces.ts';
export * from './logs-not-clearable-error.ts';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_LOG_TAIL = 500;

export class DockerManagerService {
    /** Endpoint this instance talks to, e.g. "http://127.0.0.1:2375". For logging and errors. */
    readonly baseUrl: string;
    private readonly docker: Docker;
    private readonly requests: DaemonRequestRunner;
    private readonly hostFiles: DockerHostFiles | undefined;
    private readonly images: DockerImageProvider | undefined;

    constructor(options: DockerManagerOptions = {}) {
        const endpoint = resolveDockerEndpoint(options);

        this.baseUrl = endpoint.baseUrl;
        this.requests = new DaemonRequestRunner(options.daemon, endpoint.baseUrl);
        this.hostFiles = options.hostFiles;
        this.images = options.images;

        let timeout: number;
        if (options.requestTimeoutMs === undefined) {
            timeout = DEFAULT_TIMEOUT_MS;
        } else {
            timeout = options.requestTimeoutMs;
        }

        const dockerOptions: Docker.DockerOptions = {
            host: endpoint.host,
            port: endpoint.port,
            protocol: endpoint.protocol,
            timeout: timeout,
        };
        if (options.apiVersion !== undefined) {
            dockerOptions.version = options.apiVersion;
        }
        if (options.ca !== undefined) {
            dockerOptions.ca = options.ca;
        }
        if (options.cert !== undefined) {
            dockerOptions.cert = options.cert;
        }
        if (options.key !== undefined) {
            dockerOptions.key = options.key;
        }

        this.docker = new Docker(dockerOptions);
    }

    /** Lists containers. Includes stopped containers unless `all` is false. */
    async getContainers(options: GetContainersOptions = {}): Promise<Container[]> {
        let all: boolean;
        if (options.all === undefined) {
            all = true;
        } else {
            all = options.all;
        }

        const listOptions: Docker.ContainerListOptions = { all: all };
        if (options.filters !== undefined) {
            listOptions.filters = options.filters;
        }

        const infos = await this.requests.run('GET /containers/json', () =>
            this.docker.listContainers(listOptions),
        );
        return infos.map(toContainer);
    }

    /**
     * Everything the daemon's inspect endpoint reports about one container. `id` may
     * be a full or short container ID, or a container name — whatever the daemon
     * accepts. Throws {@link DockerApiError} with status 404 when nothing matches.
     */
    async getContainerById(id: string): Promise<ContainerDetails> {
        const info = await this.requests.run(`GET /containers/${id}/json`, () =>
            this.docker.getContainer(id).inspect(),
        );
        return toContainerDetails(info);
    }

    /**
     * Creates and starts a container. Pulls `options.image` first when it is not
     * available locally (needs the image provider; without one a missing image
     * surfaces as the engine's 404). Throws {@link DockerApiError} with status
     * 409 when a container with that name already exists. When the created
     * container fails to start (typically a host port already taken), it is
     * removed again before the start error is rethrown, so a retry under the
     * same name is not blocked by a half-created leftover.
     */
    async createContainer(options: CreateContainerOptions): Promise<ContainerDetails> {
        if (this.images !== undefined) {
            await this.images.ensureImageExists(options.image);
        }

        const env: string[] = [];
        for (const [name, value] of Object.entries(options.env)) {
            env.push(`${name}=${value}`);
        }

        // The engine wants ports keyed "<port>/tcp"; several host ports may bind
        // the same container port, so bindings are grouped under one key.
        const exposedPorts: Record<string, object> = {};
        const portBindings: Record<string, { HostPort: string }[]> = {};
        for (const mapping of options.ports) {
            const portKey = `${mapping.containerPort}/tcp`;
            exposedPorts[portKey] = {};

            let bindings = portBindings[portKey];
            if (bindings === undefined) {
                bindings = [];
                portBindings[portKey] = bindings;
            }
            bindings.push({ HostPort: String(mapping.hostPort) });
        }

        const createOptions: Docker.ContainerCreateOptions = {
            name: options.name,
            Image: options.image,
            Env: env,
            Labels: { 'cloudplatform.managed': 'true' },
            ExposedPorts: exposedPorts,
            HostConfig: {
                PortBindings: portBindings,
                // Containers resume with the daemon (the WSL distro stops with the
                // backend); stopped stays stopped.
                RestartPolicy: { Name: 'unless-stopped' },
            },
        };

        const created = await this.requests.run('POST /containers/create', () =>
            this.docker.createContainer(createOptions),
        );

        try {
            await this.startContainer(created.id);
        } catch (startError) {
            try {
                await this.deleteContainer(created.id, { force: true });
            } catch {
                // Best effort — the start failure is the error worth reporting.
            }
            throw startError;
        }

        return this.getContainerById(created.id);
    }

    /**
     * Removes a container. `id` may be a full or short container ID, or a container
     * name — whatever the daemon accepts. Throws {@link DockerApiError} with status
     * 409 if the container is still running and `force` was not set, and 404 if it
     * no longer exists.
     */
    async deleteContainer(id: string, options: DeleteContainerOptions = {}): Promise<void> {
        let force: boolean;
        if (options.force === undefined) {
            force = false;
        } else {
            force = options.force;
        }

        let removeVolumes: boolean;
        if (options.removeVolumes === undefined) {
            removeVolumes = false;
        } else {
            removeVolumes = options.removeVolumes;
        }

        // Built explicitly: dockerode's promise overload of remove() is typed `{}`,
        // so a typo in this object would otherwise go unnoticed.
        const removeOptions: Docker.ContainerRemoveOptions = {
            force: force,
            v: removeVolumes,
        };

        await this.requests.run(`DELETE /containers/${id}`, () =>
            this.docker.getContainer(id).remove(removeOptions),
        );
    }

    /**
     * Starts a container. Idempotent: starting an already-running container is a
     * no-op (the engine's 304 is treated as success). Throws {@link DockerApiError}
     * with status 404 when the container does not exist.
     */
    async startContainer(id: string): Promise<void> {
        await this.withDaemonIdempotent(`POST /containers/${id}/start`, () =>
            this.docker.getContainer(id).start(),
        );
    }

    /**
     * Stops a container. Idempotent: stopping an already-stopped container is a
     * no-op (the engine's 304 is treated as success). Throws {@link DockerApiError}
     * with status 404 when the container does not exist.
     */
    async stopContainer(id: string, options: StopContainerOptions = {}): Promise<void> {
        const stopOptions: Docker.ContainerStopOptions = {};
        if (options.timeoutSeconds !== undefined) {
            stopOptions.t = options.timeoutSeconds;
        }

        await this.withDaemonIdempotent(`POST /containers/${id}/stop`, () =>
            this.docker.getContainer(id).stop(stopOptions),
        );
    }

    /**
     * Restarts a container: stops it first when running, then starts it. Unlike
     * start and stop, the engine never answers 304 here. Throws
     * {@link DockerApiError} with status 404 when the container does not exist.
     */
    async restartContainer(id: string, options: RestartContainerOptions = {}): Promise<void> {
        // Built explicitly: dockerode's promise overload of restart() is typed `{}`
        // (like remove()), so a typo in this object would otherwise go unnoticed.
        const restartOptions: { t?: number } = {};
        if (options.timeoutSeconds !== undefined) {
            restartOptions.t = options.timeoutSeconds;
        }

        await this.requests.run(`POST /containers/${id}/restart`, () =>
            this.docker.getContainer(id).restart(restartOptions),
        );
    }

    /**
     * A snapshot of a container's log (no follow), each line carrying its
     * timestamp. Inspects the container first: TTY containers emit a raw byte
     * stream while non-TTY containers emit Docker's multiplexed framing, and only
     * the inspect result says which. Throws {@link DockerApiError} with status 404
     * when the container does not exist.
     */
    async getContainerLogs(id: string, options: GetContainerLogsOptions = {}): Promise<ContainerLogs> {
        const details: ContainerDetails = await this.getContainerById(id);
        const tty: boolean = details.config.tty;

        let tail: number | 'all';
        if (options.tail === undefined) {
            tail = DEFAULT_LOG_TAIL;
        } else {
            tail = options.tail;
        }

        // The `follow: false` literal in the type is what selects dockerode's
        // Promise<Buffer> overload (the `follow: true` overload returns a stream).
        // Timestamps are always requested; the parser turns each line's prefix
        // into the structured `timestamp` field.
        const logsOptions: Docker.ContainerLogsOptions & { follow: false } = {
            follow: false,
            stdout: true,
            stderr: true,
            timestamps: true,
        };
        if (tail !== 'all') {
            logsOptions.tail = tail;
        }
        if (options.since !== undefined) {
            logsOptions.since = toDaemonTimestamp(options.since);
        }

        const payload = await this.requests.run(`GET /containers/${id}/logs`, () =>
            this.docker.getContainer(id).logs(logsOptions),
        );
        return { tty: tty, lines: parseContainerLogs(payload, tty) };
    }

    /**
     * Empties a container's log by truncating the log file on the daemon host —
     * the Engine API has no endpoint for this. Works while the container runs
     * (the json-file driver appends, so writes continue cleanly). Throws
     * {@link LogsNotClearableError} when the container's log driver keeps no
     * truncatable file, and {@link DockerApiError} with status 404 when the
     * container does not exist.
     */
    async clearContainerLogs(id: string): Promise<void> {
        if (this.hostFiles === undefined) {
            throw new Error('clearing logs needs daemon-host file access, which this deployment did not configure');
        }

        const details: ContainerDetails = await this.getContainerById(id);

        const driver: string = details.hostConfig.logConfig.type;
        if (driver !== 'json-file') {
            throw new LogsNotClearableError(details.name, `log driver "${driver}" does not keep logs in a truncatable file`);
        }
        if (details.logPath === '') {
            throw new LogsNotClearableError(details.name, 'the daemon reports no log file for it');
        }

        await this.hostFiles.truncateFile(details.logPath);
    }

    /**
     * Like the request runner, for lifecycle endpoints where the engine answers
     * 304 Not Modified when the container is already in the requested state —
     * treated as success so start/stop are idempotent.
     */
    private async withDaemonIdempotent(endpoint: string, fn: () => Promise<unknown>): Promise<void> {
        try {
            await this.requests.run(endpoint, fn);
        } catch (error) {
            if (error instanceof DockerApiError && error.status === 304) {
                return;
            }
            throw error;
        }
    }
}
