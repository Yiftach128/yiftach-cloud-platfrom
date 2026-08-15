/**
 * Composition helper: builds the WSL daemon lifecycle for a Docker endpoint and kicks
 * off a background warm-up, so the composition root stays a one-liner. Function file,
 * not a class — the class lives in wsl-docker-daemon.ts.
 */

import { WslDockerDaemon } from './wsl-docker-daemon.ts';

/**
 * @param baseUrl Daemon base URL, e.g. "http://127.0.0.1:2375".
 * @param keepalive Hold the distro open while the server runs (false disables it).
 */
export function bootstrapWslDocker(baseUrl: string, keepalive: boolean): WslDockerDaemon {
    const daemon = new WslDockerDaemon({
        pingUrl: `${baseUrl}/_ping`,
        keepalive: keepalive,
    });

    // Warm in the background so the first request doesn't pay the WSL boot;
    // callers are not blocked and failures surface per-request as 503s.
    void daemon
        .ensureRunning()
        .then(() => console.log('docker daemon ready'))
        .catch((error: unknown) => {
            let message: string;
            if (error instanceof Error) {
                message = error.message;
            } else {
                message = String(error);
            }
            console.warn(`docker daemon not ready yet: ${message}`);
        });

    return daemon;
}
