/**
 * Public types for the WSL bootstrap service.
 */

export interface WslDockerDaemonOptions {
    /** Full readiness URL, e.g. "http://127.0.0.1:2375/_ping". */
    pingUrl: string;
    /** WSL distro that hosts dockerd. Defaults to "Ubuntu". */
    distro?: string;
    /**
     * Give up ensuring after this long. Defaults to 60s — budget for distro boot plus
     * Docker 29's deliberately slowed TLS-less startup (~7-20s).
     */
    bootTimeoutMs?: number;
    /** Delay between readiness probes. Defaults to 1s. */
    pollIntervalMs?: number;
    /** Hold the distro open after a successful ensure, preventing WSL's idle teardown. Defaults to true. */
    keepalive?: boolean;
}

export interface WslDockerHostFilesOptions {
    /** WSL distro that hosts dockerd. Defaults to "Ubuntu". */
    distro?: string;
}
