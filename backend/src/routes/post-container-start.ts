import { Router } from 'express';

import type { DockerManagerService } from '../services/docker/docker-manager-service.ts';

/** POST /containers/:id/start — starts a container; 204 even when already running. */
export function postContainerStartRoute(docker: DockerManagerService): Router {
    return Router().post('/containers/:id/start', async (req, res) => {
        await docker.startContainer(req.params.id);
        res.status(204).end();
    });
}
