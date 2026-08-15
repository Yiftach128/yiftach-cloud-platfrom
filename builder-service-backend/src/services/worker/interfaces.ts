/** Loop tuning for the build worker. */
export interface BuildWorkerOptions {
    /** How long to wait between claim polls when the queue is empty (milliseconds). */
    pollIntervalMs: number;
    /** Directory the per-build clone workspaces are created under. */
    workspaceDir: string;
    /** Hard cap on a single git clone (milliseconds). */
    gitCloneTimeoutMs: number;
}

/** Identity and cadence for the heartbeat reporter. */
export interface HeartbeatReporterOptions {
    /** Name this builder reports itself as. */
    agentName: string;
    /** How often a heartbeat is sent (milliseconds). */
    heartbeatIntervalMs: number;
}
