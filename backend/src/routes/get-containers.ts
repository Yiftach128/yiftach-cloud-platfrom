import { Router } from 'express';

import type { DockerManagerService } from '../services/docker/docker-manager-service.ts';

/** GET /containers — the live container list, straight from the Docker daemon. */
export function getContainersRoute(docker: DockerManagerService): Router {
    return Router().get('/containers', async (_req, res) => {
        res.json(await docker.getContainers());
    });
}
