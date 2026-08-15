/**
 * Public types for the build-agent registry.
 *
 * A build agent is one builder-service process. Agents report themselves via
 * POST /build-agents/heartbeat on a fixed cadence (plus an immediate beat on
 * every idle/building transition), and the UI lists them via
 * GET /build-agents. Presence lives in memory only, like the build queue: an
 * agent silent past the offline threshold is served as 'offline', one silent
 * past the retention window is forgotten, and a platform restart forgets all
 * agents until their next heartbeat.
 */

/** What a live builder reports about itself. */
export type AgentActivityStatus = 'idle' | 'building';

/** What GET /build-agents serves — the platform adds 'offline' for silent agents. */
export type BuildAgentStatus = 'idle' | 'building' | 'offline';

/** Validated body of POST /build-agents/heartbeat. */
export interface AgentHeartbeatReport {
    /** Agent identity; heartbeats upsert by this name. */
    name: string;
    status: AgentActivityStatus;
    /** Job the agent is working on; present only while status is 'building'. */
    currentJobId?: string;
    /** When the builder process started; the UI derives uptime from it. */
    startedAt: Date;
}

/** One GET /build-agents row. */
export interface BuildAgent {
    name: string;
    status: BuildAgentStatus;
    /** When the builder process started; the UI derives uptime from it. */
    startedAt: Date;
    /** When the agent's most recent heartbeat arrived. */
    lastSeenAt: Date;
    /** Job the agent is working on; omitted for idle and offline agents. */
    currentJobId?: string;
}

/**
 * The registry's internal record: the reported activity stays as-is and the
 * offline derivation happens at list time, so a record never has to be
 * revisited when its agent goes silent.
 */
export interface BuildAgentRecord {
    name: string;
    activity: AgentActivityStatus;
    currentJobId?: string;
    startedAt: Date;
    /** Epoch ms of the last heartbeat; drives offline derivation and pruning. */
    lastSeenAt: number;
}
