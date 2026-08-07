import { Router } from 'express';

import type { BuildQueueService } from '../services/builds/build-queue-service.ts';
import type { BuildJob } from '../services/builds/interfaces.ts';

/**
 * GET /builds/:id — one build job's status, progress lines, and (on failure)
 * error message. 404 when the id is unknown, expired, or lost to a restart.
 */
export function getBuildRoute(builds: BuildQueueService): Router {
    return Router().get('/builds/:id', (req, res) => {
        const job: BuildJob = builds.getJob(req.params.id);
        res.json(job);
    });
}
