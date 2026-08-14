import { Router } from 'express';

import type { DockerManagerService } from '../services/docker/docker-manager-service.ts';

/** GET /containers/stats — one live resource-usage sample per running container, keyed by container id. */
export function getContainersStatsRoute(docker: DockerManagerService): Router {
    return Router().get('/containers/stats', async (_req, res) => {
        res.json(await docker.getContainersStats());
    });
}
