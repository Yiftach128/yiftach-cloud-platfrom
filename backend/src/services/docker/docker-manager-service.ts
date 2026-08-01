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

import { isConnectionError, isEngineError } from './classify-dockerode-error.ts';
import { toContainer, toContainerDetails } from './container-mapper.ts';
import { DockerApiError } from './docker-api-error.ts';
import { DockerConnectionError } from './docker-connection-error.ts';
import type {
    Container,
    ContainerDetails,
    DeleteContainerOptions,
    DockerDaemonLifecycle,
    DockerManagerOptions,
    GetContainersOptions,
} from './interfaces.ts';
import { resolveDockerEndpoint } from './resolve-docker-endpoint.ts';

export * from './docker-api-error.ts';
export * from './docker-connection-error.ts';
export * from './interfaces.ts';

const DEFAULT_TIMEOUT_MS = 10_000;

export class DockerManagerService {
    /** Endpoint this instance talks to, e.g. "http://127.0.0.1:2375". For logging and errors. */
    readonly baseUrl: string;
    private readonly docker: Docker;
    private readonly daemon: DockerDaemonLifecycle | undefined;

    constructor(options: DockerManagerOptions = {}) {
        const endpoint = resolveDockerEndpoint(options);

        this.baseUrl = endpoint.baseUrl;
        this.daemon = options.daemon;

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

        const infos = await this.withDaemon('GET /containers/json', () =>
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
        const info = await this.withDaemon(`GET /containers/${id}/json`, () =>
            this.docker.getContainer(id).inspect(),
        );
        return toContainerDetails(info);
    }

    /**
     * Removes a container. Throws {@link DockerApiError} with status 409 if it is
     * still running and `force` was not set, and 404 if it no longer exists.
     */
    async deleteContainer(
        container: Container,
        options: DeleteContainerOptions = {},
    ): Promise<void> {
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

        await this.withDaemon(`DELETE /containers/${container.id}`, () =>
            this.docker.getContainer(container.id).remove(removeOptions),
        );
    }

    /**
     * Runs a daemon request; when it fails because the daemon was unreachable, asks
     * the lifecycle to bring the daemon up (booting WSL if needed) and retries once.
     * Engine errors (404, 409, ...) pass through untouched.
     */
    private async withDaemon<T>(endpoint: string, fn: () => Promise<T>): Promise<T> {
        try {
            return await fn();
        } catch (error) {
            if (this.daemon === undefined || !isConnectionError(error)) {
                throw this.translate(error, endpoint);
            }
            await this.daemon.ensureRunning(); // throws DockerConnectionError if boot fails
            try {
                return await fn();
            } catch (retryError) {
                throw this.translate(retryError, endpoint);
            }
        }
    }

    /** Maps a dockerode failure onto this module's error types. */
    private translate(error: unknown, endpoint: string): Error {
        if (isEngineError(error)) {
            return new DockerApiError(error.message, error.statusCode, endpoint);
        }
        if (isConnectionError(error)) {
            return new DockerConnectionError(this.baseUrl, error);
        }
        if (error instanceof Error) {
            return error;
        }
        return new Error(String(error));
    }
}
