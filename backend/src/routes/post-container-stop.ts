import { Router } from 'express';

import type { DockerManagerService } from '../services/docker/docker-manager-service.ts';

/**
 * POST /containers/:id/stop — stops a container; 204 even when already stopped.
 * `?timeout=<seconds>` overrides the daemon's 10s grace period before the kill.
 * Invalid values are ignored.
 */
export function postContainerStopRoute(docker: DockerManagerService): Router {
    return Router().post('/containers/:id/stop', async (req, res) => {
        let timeoutSeconds: number | undefined = undefined;
        const timeoutRaw = req.query['timeout'];
        if (typeof timeoutRaw === 'string') {
            const parsed: number = Number(timeoutRaw);
            if (Number.isInteger(parsed) && parsed >= 0) {
                timeoutSeconds = parsed;
            }
        }

        await docker.stopContainer(req.params.id, { timeoutSeconds: timeoutSeconds });
        res.status(204).end();
    });
}
