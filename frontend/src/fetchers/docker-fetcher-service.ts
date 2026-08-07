import axios from 'axios';
import type { AxiosInstance, AxiosResponse } from 'axios';

import { DockerFetcherError } from './docker-fetcher-error.ts';
import type {
    BuildJob,
    Container,
    ContainerDetails,
    ContainerLogs,
    CreateContainerRequest,
    GetContainerLogsOptions,
    ImagePreset,
    ImageSummary,
    StartBuildRequest,
} from './interfaces.ts';

/** Body the backend error handler sends (see platform-backend/src/middleware/error-handler.ts). */
interface ApiErrorBody {
    message: string;
}

export class DockerFetcherService {
    private readonly http: AxiosInstance;

    constructor(baseUrl: string) {
        this.http = axios.create({ baseURL: baseUrl });
    }

    public async getContainers(): Promise<Container[]> {
        try {
            const response: AxiosResponse<Container[]> = await this.http.get('/containers');
            return response.data;
        } catch (error) {
            throw this.toFetcherError(error);
        }
    }

    public async getImagePresets(): Promise<ImagePreset[]> {
        try {
            const response: AxiosResponse<ImagePreset[]> = await this.http.get('/images/presets');
            return response.data;
        } catch (error) {
            throw this.toFetcherError(error);
        }
    }

    /** The platform-built images (labeled cloudplatform.managed=true); registry pulls never appear. */
    public async getImages(): Promise<ImageSummary[]> {
        try {
            const response: AxiosResponse<ImageSummary[]> = await this.http.get('/images');
            return response.data;
        } catch (error) {
            throw this.toFetcherError(error);
        }
    }

    /** Removes a platform-built image; the backend answers 409 when it is unmanaged or still used by a container. */
    public async deleteImage(id: string): Promise<void> {
        try {
            const encodedId: string = encodeURIComponent(id);
            await this.http.delete(`/images/${encodedId}`);
        } catch (error) {
            throw this.toFetcherError(error);
        }
    }

    /**
     * Creates and starts a container. Synchronous on the backend: a missing image
     * is pulled first, so this can take minutes on a first-time image (axios has
     * no default timeout, so the call simply waits).
     */
    public async createContainer(request: CreateContainerRequest): Promise<ContainerDetails> {
        try {
            const response: AxiosResponse<ContainerDetails> = await this.http.post('/containers', request);
            return response.data;
        } catch (error) {
            throw this.toFetcherError(error);
        }
    }

    /**
     * Enqueues a build of a public GitHub repository together with the
     * container to create from it. Answers immediately with the 'queued' job;
     * poll {@link getBuildJob} while the builder service works the queue. The
     * backend answers 429 when the queue is full.
     */
    public async startBuild(request: StartBuildRequest): Promise<BuildJob> {
        try {
            const response: AxiosResponse<BuildJob> = await this.http.post('/builds', request);
            return response.data;
        } catch (error) {
            throw this.toFetcherError(error);
        }
    }

    /** One build job's snapshot; 404 when the id is unknown, expired, or lost to a restart. */
    public async getBuildJob(id: string): Promise<BuildJob> {
        try {
            const encodedId: string = encodeURIComponent(id);
            const response: AxiosResponse<BuildJob> = await this.http.get(`/builds/${encodedId}`);
            return response.data;
        } catch (error) {
            throw this.toFetcherError(error);
        }
    }

    public async getContainer(nameOrId: string): Promise<ContainerDetails> {
        try {
            const encodedNameOrId: string = encodeURIComponent(nameOrId);
            const response: AxiosResponse<ContainerDetails> = await this.http.get(`/containers/${encodedNameOrId}`);
            return response.data;
        } catch (error) {
            throw this.toFetcherError(error);
        }
    }

    public async startContainer(nameOrId: string): Promise<void> {
        try {
            const encodedNameOrId: string = encodeURIComponent(nameOrId);
            await this.http.post(`/containers/${encodedNameOrId}/start`);
        } catch (error) {
            throw this.toFetcherError(error);
        }
    }

    public async stopContainer(nameOrId: string): Promise<void> {
        try {
            const encodedNameOrId: string = encodeURIComponent(nameOrId);
            await this.http.post(`/containers/${encodedNameOrId}/stop`);
        } catch (error) {
            throw this.toFetcherError(error);
        }
    }

    public async restartContainer(nameOrId: string): Promise<void> {
        try {
            const encodedNameOrId: string = encodeURIComponent(nameOrId);
            await this.http.post(`/containers/${encodedNameOrId}/restart`);
        } catch (error) {
            throw this.toFetcherError(error);
        }
    }

    /** Removes the container even while it runs (force); its volumes are kept. */
    public async deleteContainer(nameOrId: string): Promise<void> {
        try {
            const encodedNameOrId: string = encodeURIComponent(nameOrId);
            await this.http.delete(`/containers/${encodedNameOrId}`, { params: { force: 'true' } });
        } catch (error) {
            throw this.toFetcherError(error);
        }
    }

    public async getContainerLogs(nameOrId: string, options: GetContainerLogsOptions): Promise<ContainerLogs> {
        try {
            const encodedNameOrId: string = encodeURIComponent(nameOrId);
            const params: Record<string, string> = {};
            if (options.tail !== undefined) {
                params['tail'] = String(options.tail);
            }
            if (options.since !== undefined) {
                params['since'] = options.since;
            }
            const response: AxiosResponse<ContainerLogs> = await this.http.get(
                `/containers/${encodedNameOrId}/logs`,
                { params: params },
            );
            return response.data;
        } catch (error) {
            throw this.toFetcherError(error);
        }
    }

    /** Empties the container's log; the backend answers 409 when the log driver keeps no truncatable file. */
    public async clearContainerLogs(nameOrId: string): Promise<void> {
        try {
            const encodedNameOrId: string = encodeURIComponent(nameOrId);
            await this.http.delete(`/containers/${encodedNameOrId}/logs`);
        } catch (error) {
            throw this.toFetcherError(error);
        }
    }

    private toFetcherError(error: unknown): DockerFetcherError {
        if (axios.isAxiosError<ApiErrorBody>(error)) {
            const response = error.response;
            if (response !== undefined) {
                const body: ApiErrorBody | undefined = response.data;
                let message: string;
                if (body !== undefined && typeof body.message === 'string') {
                    message = body.message;
                } else {
                    message = `Backend request failed with status ${response.status}`;
                }
                return new DockerFetcherError(message, response.status);
            }
            return new DockerFetcherError(`Backend is unreachable: ${error.message}`, null);
        }
        if (error instanceof Error) {
            return new DockerFetcherError(error.message, null);
        }
        return new DockerFetcherError('Unknown error while calling the backend', null);
    }
}
