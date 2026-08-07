import { Router } from 'express';

import type { BuildQueueService } from '../services/builds/build-queue-service.ts';
import type { BuildTask } from '../services/builds/interfaces.ts';

/**
 * POST /builds-queue/claim — the builder service's poll: claims the oldest
 * queued job (marking it running) and answers 200 with its task, or 204 when
 * the queue is empty. Worker-facing, like the other /builds-queue routes; the
 * browser client never calls these.
 */
export function postBuildsQueueClaimRoute(builds: BuildQueueService): Router {
    return Router().post('/builds-queue/claim', (_req, res) => {
        const task: BuildTask | undefined = builds.claimNextTask();
        if (task === undefined) {
            res.status(204).end();
        } else {
            res.json(task);
        }
    });
}
