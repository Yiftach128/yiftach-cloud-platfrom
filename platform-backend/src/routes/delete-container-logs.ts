import { Router } from 'express';

import type { DockerManagerService } from '../services/docker/docker-manager-service.ts';

/**
 * DELETE /containers/:id/logs — empties a container's log. 409 when the
 * container's log driver keeps no truncatable file.
 */
export function deleteContainerLogsRoute(docker: DockerManagerService): Router {
    return Router().delete('/containers/:id/logs', async (req, res) => {
        await docker.clearContainerLogs(req.params.id);
        res.status(204).end();
    });
}
