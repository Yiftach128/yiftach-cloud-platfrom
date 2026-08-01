/**
 * Resolves which Docker daemon endpoint to talk to, from explicit options and the
 * DOCKER_HOST env var (e.g. "tcp://127.0.0.1:2375"). Extracted from the manager so the
 * composition root can derive the ping URL without duplicating this logic.
 */

import type { DockerEndpoint, DockerManagerOptions } from './interfaces.ts';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 2375;

/**
 * Malformed DOCKER_HOST values are ignored rather than thrown, so a stray env var
 * can't break startup.
 */
function readDockerHostEnv(): { host?: string; port?: number } {
    const raw = process.env['DOCKER_HOST'];
    if (!raw) return {};
    try {
        const url = new URL(raw.replace(/^tcp:\/\//, 'http://'));
        return {
            host: url.hostname || undefined,
            port: url.port ? Number(url.port) : undefined,
        };
    } catch {
        return {};
    }
}

export function resolveDockerEndpoint(
    options: Pick<DockerManagerOptions, 'host' | 'port' | 'protocol' | 'ca' | 'cert' | 'key'> = {},
): DockerEndpoint {
    const env = readDockerHostEnv();
    const host = options.host ?? env.host ?? DEFAULT_HOST;
    const port = options.port ?? env.port ?? DEFAULT_PORT;
    const usesTls = Boolean(options.ca ?? options.cert ?? options.key);
    const protocol = options.protocol ?? (usesTls ? 'https' : 'http');

    return { host, port, protocol, baseUrl: `${protocol}://${host}:${port}` };
}
