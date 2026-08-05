import { isConnectionError, isEngineError } from './classify-dockerode-error.ts';
import { DockerApiError } from './docker-api-error.ts';
import { DockerConnectionError } from './docker-connection-error.ts';
import type { DockerDaemonLifecycle } from './interfaces.ts';

/**
 * Runs dockerode requests with the daemon self-healing behaviour every service in
 * this folder shares: when a request fails because the daemon was unreachable, ask
 * the lifecycle to bring it up (booting WSL if needed) and retry once. Extracted
 * from the manager so services holding their own dockerode client (the image
 * service) do not duplicate the retry and error mapping.
 */
export class DaemonRequestRunner {
    private readonly daemon: DockerDaemonLifecycle | undefined;
    private readonly baseUrl: string;

    constructor(daemon: DockerDaemonLifecycle | undefined, baseUrl: string) {
        this.daemon = daemon;
        this.baseUrl = baseUrl;
    }

    /**
     * Runs a daemon request; when it fails because the daemon was unreachable, asks
     * the lifecycle to bring the daemon up and retries once. Engine errors (404,
     * 409, ...) pass through untouched, mapped to {@link DockerApiError}.
     *
     * Only safe for calls whose promise settles before any response stream is
     * consumed (plain requests, or stream *initiation*): retrying a callback whose
     * stream was already partially read would replay consumed data.
     */
    async run<T>(endpoint: string, fn: () => Promise<T>): Promise<T> {
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
