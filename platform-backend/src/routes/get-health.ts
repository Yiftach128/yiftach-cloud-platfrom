import { Router } from 'express';

import type { DockerManagerService } from '../services/docker/docker-manager-service.ts';

/** GET /health — liveness probe; reports which Docker endpoint the backend targets. */
export function getHealthRoute(docker: DockerManagerService): Router {
    return Router().get('/health', (_req, res) => {
        res.json({ status: 'ok', docker: docker.baseUrl });
    });
}
