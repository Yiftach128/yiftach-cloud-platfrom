import axios from 'axios';
import type { AxiosInstance, AxiosResponse } from 'axios';

import { DockerFetcherError } from './docker-fetcher-error.ts';
import type { Container } from './interfaces.ts';

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
