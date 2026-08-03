import axios from 'axios';
import type { AxiosInstance, AxiosResponse } from 'axios';

import { DockerFetcherError } from './docker-fetcher-error.ts';
import type { Container, ContainerDetails, ContainerLogs, GetContainerLogsOptions } from './interfaces.ts';

/** Body the backend error handler sends (see backend/src/middleware/error-handler.ts). */
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
