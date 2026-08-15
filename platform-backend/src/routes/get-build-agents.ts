import { Router } from 'express';

import type { BuildAgentRegistry } from '../services/build-agents/build-agent-registry.ts';

/** GET /build-agents — the known builder agents, recently-offline ones included. */
export function getBuildAgentsRoute(agents: BuildAgentRegistry): Router {
    return Router().get('/build-agents', (_req, res) => {
        res.json(agents.listAgents());
    });
}
