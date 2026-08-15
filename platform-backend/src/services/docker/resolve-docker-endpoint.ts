/**
 * Resolves which Docker daemon endpoint to talk to, from explicit options — including
 * a docker CLI style `dockerHost` string (e.g. "tcp://127.0.0.1:2375") that the
 * composition root supplies from config. Extracted from the manager so the composition
 * root can derive the ping URL without duplicating this logic.
 */

import type { DockerEndpoint, ResolveDockerEndpointOptions } from './interfaces.ts';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 2375;

/**
 * Malformed dockerHost values are ignored rather than thrown, so a stray value
 * can't break startup.
 */
function parseDockerHost(
    dockerHost: string | undefined,
): { host: string | undefined; port: number | undefined } {
    if (dockerHost === undefined || dockerHost === '') {
        return { host: undefined, port: undefined };
    }
    try {
        const url = new URL(dockerHost.replace(/^tcp:\/\//, 'http://'));

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
    options: ResolveDockerEndpointOptions = {},
): DockerEndpoint {
    const parsed = parseDockerHost(options.dockerHost);

    let host: string;
    if (options.host !== undefined) {
        host = options.host;
    } else if (parsed.host !== undefined) {
        host = parsed.host;
    } else {
        host = DEFAULT_HOST;
    }

    let port: number;
    if (options.port !== undefined) {
        port = options.port;
    } else if (parsed.port !== undefined) {
        port = parsed.port;
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
