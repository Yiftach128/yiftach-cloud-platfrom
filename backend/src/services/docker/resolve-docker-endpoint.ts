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
function readDockerHostEnv(): { host: string | undefined; port: number | undefined } {
    const raw = process.env['DOCKER_HOST'];
    if (raw === undefined || raw === '') {
        return { host: undefined, port: undefined };
    }
    try {
        const url = new URL(raw.replace(/^tcp:\/\//, 'http://'));

        let host: string | undefined;
        if (url.hostname === '') {
            host = undefined;
        } else {
            host = url.hostname;
        }

        let port: number | undefined;
        if (url.port === '') {
            port = undefined;
        } else {
            port = Number(url.port);
        }

        return { host: host, port: port };
    } catch {
        return { host: undefined, port: undefined };
    }
}

export function resolveDockerEndpoint(
    options: Pick<DockerManagerOptions, 'host' | 'port' | 'protocol' | 'ca' | 'cert' | 'key'> = {},
): DockerEndpoint {
    const env = readDockerHostEnv();

    let host: string;
    if (options.host !== undefined) {
        host = options.host;
    } else if (env.host !== undefined) {
        host = env.host;
    } else {
        host = DEFAULT_HOST;
    }

    let port: number;
    if (options.port !== undefined) {
        port = options.port;
    } else if (env.port !== undefined) {
        port = env.port;
    } else {
        port = DEFAULT_PORT;
    }

    const usesTls =
        options.ca !== undefined || options.cert !== undefined || options.key !== undefined;

    let protocol: 'http' | 'https';
    if (options.protocol !== undefined) {
        protocol = options.protocol;
    } else if (usesTls) {
        protocol = 'https';
    } else {
        protocol = 'http';
    }

    return { host: host, port: port, protocol: protocol, baseUrl: `${protocol}://${host}:${port}` };
}
