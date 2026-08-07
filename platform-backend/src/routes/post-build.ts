import { Router } from 'express';

import type { BuildQueueService } from '../services/builds/build-queue-service.ts';
import type { BuildJob, StartBuildOptions } from '../services/builds/interfaces.ts';
import { parseStartBuildRequest } from '../services/validation/parse-start-build-request.ts';

/**
 * POST /builds — enqueues a build of a public GitHub repository together with
 * the container to create from it (`{gitUrl, name, ports, env}`). Answers 202
 * with the 'queued' job immediately; the client polls GET /builds/:id while
 * the builder service works the queue. 429 when the queue is full.
 */
export function postBuildRoute(builds: BuildQueueService): Router {
    return Router().post('/builds', (req, res) => {
        const options: StartBuildOptions = parseStartBuildRequest(req.body);
        const job: BuildJob = builds.enqueue(options);
        res.status(202).json(job);
    });
}
