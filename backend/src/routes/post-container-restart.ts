import { Router } from 'express';

import type { DockerManagerService } from '../services/docker/docker-manager-service.ts';

/**
 * POST /containers/:id/restart — restarts a container (stops it first when running).
 * `?timeout=<seconds>` overrides the daemon's 10s grace period for the stop phase.
 * Invalid values are ignored.
 */
export function postContainerRestartRoute(docker: DockerManagerService): Router {
    return Router().post('/containers/:id/restart', async (req, res) => {
        let timeoutSeconds: number | undefined = undefined;
        const timeoutRaw = req.query['timeout'];
        if (typeof timeoutRaw === 'string') {
            const parsed: number = Number(timeoutRaw);
            if (Number.isInteger(parsed) && parsed >= 0) {
                timeoutSeconds = parsed;
            }
        }

        await docker.restartContainer(req.params.id, { timeoutSeconds: timeoutSeconds });
        res.status(204).end();
    });
}
