import type {
    AgentHeartbeatReport,
    BuildAgent,
    BuildAgentRecord,
    BuildAgentStatus,
} from './interfaces.ts';

/** How long an agent may go silent before the list serves it as 'offline' (~3 missed 10s beats). */
const OFFLINE_THRESHOLD_MS = 30_000;
/** How long an offline agent stays listed before it is forgotten. */
const OFFLINE_RETENTION_MS = 30 * 60_000;

/**
 * In-memory store of build agents, keyed by agent name — heartbeats upsert,
 * so two builders sharing a name collapse into one row and a restarted
 * builder revives its row with a fresh start time. Offline is derived at list
 * time from the last heartbeat's age, and records past the retention window
 * are pruned lazily in {@link listAgents} — no sweeper timer, so the registry
 * needs no start/stop lifecycle.
 */
export class BuildAgentRegistry {
    private readonly records = new Map<string, BuildAgentRecord>();

    /** Upserts the agent's record; the heartbeat receipt time is the liveness stamp. */
    recordHeartbeat(heartbeat: AgentHeartbeatReport): void {
        const record: BuildAgentRecord = {
            name: heartbeat.name,
            activity: heartbeat.status,
            startedAt: heartbeat.startedAt,
            lastSeenAt: Date.now(),
        };
        if (heartbeat.currentJobId !== undefined) {
            record.currentJobId = heartbeat.currentJobId;
        }
        this.records.set(heartbeat.name, record);
    }

    /** Serves GET /build-agents, sorted by name; prunes records silent past the retention window. */
    listAgents(): BuildAgent[] {
        const now: number = Date.now();
        const agents: BuildAgent[] = [];
        for (const record of this.records.values()) {
            const silentForMs: number = now - record.lastSeenAt;
            if (silentForMs > OFFLINE_RETENTION_MS) {
                this.records.delete(record.name);
                continue;
            }

            let status: BuildAgentStatus;
            if (silentForMs > OFFLINE_THRESHOLD_MS) {
                status = 'offline';
            } else {
                status = record.activity;
            }

            const agent: BuildAgent = {
                name: record.name,
                status: status,
                startedAt: record.startedAt,
                lastSeenAt: new Date(record.lastSeenAt),
            };
            // A dead process's "building job X" claim is stale noise — the job
            // id is only served while the agent is actually reporting it.
            if (status !== 'offline' && record.currentJobId !== undefined) {
                agent.currentJobId = record.currentJobId;
            }
            agents.push(agent);
        }
        agents.sort((a: BuildAgent, b: BuildAgent) => a.name.localeCompare(b.name));
        return agents;
    }
}
