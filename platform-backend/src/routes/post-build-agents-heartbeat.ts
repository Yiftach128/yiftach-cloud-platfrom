import { Router } from 'express';

import type { BuildAgentRegistry } from '../services/build-agents/build-agent-registry.ts';
import type { AgentHeartbeatReport } from '../services/build-agents/interfaces.ts';
import { parseAgentHeartbeatRequest } from '../services/validation/parse-agent-heartbeat-request.ts';

/**
 * POST /build-agents/heartbeat — worker-facing, like the /builds-queue
 * routes: a builder-service agent reports itself alive
 * (`{name, status, currentJobId?, startedAt}`). Always 204 — a heartbeat
 * upserts, so there is no unknown-agent case.
 */
export function postBuildAgentsHeartbeatRoute(agents: BuildAgentRegistry): Router {
    return Router().post('/build-agents/heartbeat', (req, res) => {
        const heartbeat: AgentHeartbeatReport = parseAgentHeartbeatRequest(req.body);
        agents.recordHeartbeat(heartbeat);
        res.status(204).end();
    });
}
