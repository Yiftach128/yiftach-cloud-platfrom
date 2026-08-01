import { Router } from 'express';

import type { DockerManagerService } from '../services/docker/docker-manager-service.ts';

/** GET /containers/:id — full inspect-level detail for one container. */
export function getContainerRoute(docker: DockerManagerService): Router {
    return Router().get('/containers/:id', async (req, res) => {
        res.json(await docker.getContainerById(req.params.id));
    });
}
