/**
 * The builder's only door to the platform API (styled after the frontend's
 * DockerFetcherService): axios never leaks — every failure surfaces as
 * {@link PlatformApiError}, except a 404 on a job-scoped call, which becomes
 * {@link BuildJobLostError} (the abandon signal: the platform restarted and
 * its in-memory job registry is gone).
 */

import axios from 'axios';
import type { AxiosInstance, AxiosResponse } from 'axios';

import { BuildJobLostError } from './build-job-lost-error.ts';
import type {
    BuildResultReport,
    BuildTask,
    CreateContainerRequest,
} from './interfaces.ts';
import { PlatformApiError } from './platform-api-error.ts';

/** Body the platform error handler sends (see platform-backend/src/middleware/error-handler.ts). */
interface ApiErrorBody {
    message: string;
}

export class PlatformApiClient {
    private readonly http: AxiosInstance;

    constructor(baseUrl: string) {
        this.http = axios.create({ baseURL: baseUrl });
    }

    /** Claims the oldest queued build; null when the queue is empty (204). */
    public async claimBuildTask(): Promise<BuildTask | null> {
        try {
            const response: AxiosResponse<BuildTask> = await this.http.post('/builds-queue/claim');
            if (response.status === 204) {
                return null;
            }
            return response.data;
        } catch (error) {
            throw this.toApiError(error);
        }
    }

    /** Appends progress lines to the job's log. Throws {@link BuildJobLostError} on 404. */
    public async appendBuildLogs(jobId: string, lines: string[]): Promise<void> {
        try {
            const encodedJobId: string = encodeURIComponent(jobId);
            await this.http.post(`/builds-queue/${encodedJobId}/logs`, { lines: lines });
        } catch (error) {
            throw this.toJobError(jobId, error);
        }
    }

    /** Reports the job's terminal status. Throws {@link BuildJobLostError} on 404. */
    public async reportBuildResult(jobId: string, result: BuildResultReport): Promise<void> {
        try {
            const encodedJobId: string = encodeURIComponent(jobId);
            await this.http.post(`/builds-queue/${encodedJobId}/result`, result);
        } catch (error) {
            throw this.toJobError(jobId, error);
        }
    }

    /**
     * Creates and starts the container from the built image through the
     * platform's one validated creation path. Synchronous on the platform;
     * the image already exists locally, so no pull happens.
     */
    public async createContainer(request: CreateContainerRequest): Promise<void> {
        try {
            await this.http.post('/containers', request);
        } catch (error) {
            throw this.toApiError(error);
        }
    }

    private toJobError(jobId: string, error: unknown): Error {
        if (axios.isAxiosError(error)) {
            const response = error.response;
            if (response !== undefined && response.status === 404) {
                return new BuildJobLostError(jobId);
            }
        }
        return this.toApiError(error);
    }

    private toApiError(error: unknown): PlatformApiError {
        if (axios.isAxiosError<ApiErrorBody>(error)) {
            const response = error.response;
            if (response !== undefined) {
                const body: ApiErrorBody | undefined = response.data;
                let message: string;
                if (body !== undefined && typeof body.message === 'string') {
                    message = body.message;
                } else {
                    message = `Platform request failed with status ${response.status}`;
                }
                return new PlatformApiError(message, response.status);
            }
            return new PlatformApiError(`Platform is unreachable: ${error.message}`, null);
        }
        if (error instanceof Error) {
            return new PlatformApiError(error.message, null);
        }
        return new PlatformApiError('Unknown error while calling the platform', null);
    }
}
