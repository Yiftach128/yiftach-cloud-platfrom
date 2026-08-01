/**
 * Docker manager — a typed facade over the Docker Engine API, backed by dockerode.
 *
 * The daemon runs inside WSL2 Ubuntu and is reached over TCP. It must be bound to an
 * IPv4 address: WSL2's localhost relay only forwards listeners it sees in /proc/net/tcp,
 * so a `tcp://0.0.0.0` bind (which Docker turns into a dual-stack `[::]` socket) is
 * reachable from inside WSL but not from Windows.
 *
 * dockerode's raw shapes stay inside this file — callers get the types in
 * `./interfaces.ts`, so swapping transport or library again doesn't ripple outwards.
 */

import Docker from 'dockerode';

import { DockerApiError } from './docker-api-error.ts';
import { DockerConnectionError } from './docker-connection-error.ts';
import type {
    Container,
    ContainerState,
    DeleteContainerOptions,
    DockerDaemonLifecycle,
    DockerManagerOptions,
    GetContainersOptions,
    PortBinding,
} from './interfaces.ts';
import { resolveDockerEndpoint } from './resolve-docker-endpoint.ts';

export * from './docker-api-error.ts';
export * from './docker-connection-error.ts';
export * from './interfaces.ts';

const DEFAULT_TIMEOUT_MS = 10_000;

/** Networks Docker creates itself; not meaningful as platform topology. */
const BUILT_IN_NETWORKS = new Set(['bridge', 'host', 'none']);

/** Node system error codes that mean "never reached the daemon". */
const CONNECTION_ERROR_CODES = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ETIMEDOUT',
    'EPIPE',
    'ECONNABORTED',
]);

/** docker-modem attaches `statusCode` to errors the daemon actually answered. */
function isEngineError(error: unknown): error is Error & { statusCode: number } {
    return error instanceof Error && typeof (error as { statusCode?: unknown }).statusCode === 'number';
}

function isConnectionError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && CONNECTION_ERROR_CODES.has(code)) return true;

    // http.request surfaces its own timeout without a code.
    if (error.message.includes('socket hang up')) return true;

    const causeCode = (error.cause as { code?: unknown } | undefined)?.code;
    return typeof causeCode === 'string' && CONNECTION_ERROR_CODES.has(causeCode);
}

export class DockerManagerService {
    /** Endpoint this instance talks to, e.g. "http://127.0.0.1:2375". For logging and errors. */
    readonly baseUrl: string;
    readonly #docker: Docker;
    readonly #daemon: DockerDaemonLifecycle | undefined;

    constructor(options: DockerManagerOptions = {}) {
        const endpoint = resolveDockerEndpoint(options);

        this.baseUrl = endpoint.baseUrl;
        this.#daemon = options.daemon;

        const dockerOptions: Docker.DockerOptions = {
            host: endpoint.host,
            port: endpoint.port,
            protocol: endpoint.protocol,
            timeout: options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS,
        };
        if (options.apiVersion) dockerOptions.version = options.apiVersion;
        if (options.ca) dockerOptions.ca = options.ca;
        if (options.cert) dockerOptions.cert = options.cert;
        if (options.key) dockerOptions.key = options.key;

        this.#docker = new Docker(dockerOptions);
    }

    /** Lists containers. Includes stopped containers unless `all` is false. */
    async getContainers(options: GetContainersOptions = {}): Promise<Container[]> {
        const listOptions: Docker.ContainerListOptions = { all: options.all ?? true };
        if (options.filters) listOptions.filters = options.filters;

        const infos = await this.#withDaemon('GET /containers/json', () =>
            this.#docker.listContainers(listOptions),
        );
        return infos.map(toContainer);
    }

    /**
     * Removes a container. Throws {@link DockerApiError} with status 409 if it is
     * still running and `force` was not set, and 404 if it no longer exists.
     */
    async deleteContainer(
        container: Container,
        options: DeleteContainerOptions = {},
    ): Promise<void> {
        // Built explicitly: dockerode's promise overload of remove() is typed `{}`,
        // so a typo in this object would otherwise go unnoticed.
        const removeOptions: Docker.ContainerRemoveOptions = {
            force: options.force ?? false,
            v: options.removeVolumes ?? false,
        };

        await this.#withDaemon(`DELETE /containers/${container.id}`, () =>
            this.#docker.getContainer(container.id).remove(removeOptions),
        );
    }

    /**
     * Runs a daemon request; when it fails because the daemon was unreachable, asks
     * the lifecycle to bring the daemon up (booting WSL if needed) and retries once.
     * Engine errors (404, 409, ...) pass through untouched.
     */
    async #withDaemon<T>(endpoint: string, fn: () => Promise<T>): Promise<T> {
        try {
            return await fn();
        } catch (error) {
            if (!this.#daemon || !isConnectionError(error)) {
                throw this.#translate(error, endpoint);
            }
            await this.#daemon.ensureRunning(); // throws DockerConnectionError if boot fails
            try {
                return await fn();
            } catch (retryError) {
                throw this.#translate(retryError, endpoint);
            }
        }
    }

    /** Maps a dockerode failure onto this module's error types. */
    #translate(error: unknown, endpoint: string): Error {
        if (isEngineError(error)) {
            return new DockerApiError(error.message, error.statusCode, endpoint);
        }
        if (isConnectionError(error)) {
            return new DockerConnectionError(this.baseUrl, error);
        }
        return error instanceof Error ? error : new Error(String(error));
    }
}

/**
 * `Dockerode.Port` declares `IP` and `PublicPort` as required, but the daemon omits
 * both for ports that are exposed and not published — so they are read defensively.
 * Stays here rather than in interfaces.ts because it is a dockerode wire detail.
 */
type RawPort = Partial<Docker.Port> & Pick<Docker.Port, 'PrivatePort' | 'Type'>;

function toContainer(info: Docker.ContainerInfo): Container {
    const names = (info.Names ?? []).map((name) => name.replace(/^\//, ''));
    const ports = (info.Ports ?? []) as RawPort[];

    return {
        id: info.Id,
        name: names[0] ?? info.Id.slice(0, 12),
        names,
        image: info.Image,
        imageId: info.ImageID,
        command: info.Command,
        createdAt: new Date(info.Created * 1000),
        state: info.State as ContainerState,
        status: info.Status,
        ports: ports.map((port) => ({
            privatePort: port.PrivatePort,
            publicPort: port.PublicPort,
            type: port.Type as PortBinding['type'],
            ip: port.IP,
        })),
        labels: info.Labels ?? {},
        networks: Object.keys(info.NetworkSettings?.Networks ?? {}).filter(
            (network) => !BUILT_IN_NETWORKS.has(network),
        ),
    };
}
