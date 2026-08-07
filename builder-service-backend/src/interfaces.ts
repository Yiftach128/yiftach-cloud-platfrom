/** Startup configuration, resolved once from the environment by `config.ts`. */
export interface Config {
    /** Platform API base URL, including the version prefix. */
    platformApiUrl: string;
    /** Docker daemon endpoint as configured (docker CLI style, e.g. tcp://127.0.0.1:2375). */
    dockerHost: string;
    /** Host name parsed out of {@link dockerHost}. */
    dockerHostName: string;
    /** Port parsed out of {@link dockerHost}. */
    dockerHostPort: number;
    /** How long to wait between claim polls when the queue is empty (milliseconds). */
    pollIntervalMs: number;
    /** Directory that holds the per-build clone workspaces. */
    workspaceDir: string;
    /** Hard cap on a single git clone (milliseconds). */
    gitCloneTimeoutMs: number;
}
