/**
 * Composition helper: builds the WSL daemon lifecycle for a Docker endpoint and kicks
 * off a background warm-up, so the composition root stays a one-liner. Function file,
 * not a class — the class lives in wsl-docker-daemon.ts.
 */

import { WslDockerDaemon } from './wsl-docker-daemon.ts';

/**
 * @param baseUrl Daemon base URL, e.g. "http://127.0.0.1:2375".
 * Reads DOCKER_WSL_KEEPALIVE ("0" disables holding the distro open).
 */
export function bootstrapWslDocker(baseUrl: string): WslDockerDaemon {
    const daemon = new WslDockerDaemon({
        pingUrl: `${baseUrl}/_ping`,
        keepalive: process.env['DOCKER_WSL_KEEPALIVE'] !== '0',
    });

    // Warm in the background so the first request doesn't pay the WSL boot;
    // callers are not blocked and failures surface per-request as 503s.
    void daemon
        .ensureRunning()
        .then(() => console.log('docker daemon ready'))
        .catch((error: unknown) =>
            console.warn(`docker daemon not ready yet: ${error instanceof Error ? error.message : String(error)}`),
        );

    return daemon;
}
