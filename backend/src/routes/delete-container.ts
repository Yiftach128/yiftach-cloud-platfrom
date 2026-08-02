import { Router } from 'express';

import type { DockerManagerService } from '../services/docker/docker-manager-service.ts';

/**
 * DELETE /containers/:id — removes a container. `?force=true` kills a running
 * container first; `?volumes=true` also removes its anonymous volumes.
 */
export function deleteContainerRoute(docker: DockerManagerService): Router {
    return Router().delete('/containers/:id', async (req, res) => {
        const force: boolean = req.query['force'] === 'true';
        const removeVolumes: boolean = req.query['volumes'] === 'true';
        await docker.deleteContainer(req.params.id, {
            force: force,
            removeVolumes: removeVolumes,
        });
        res.status(204).end();
    });
}
