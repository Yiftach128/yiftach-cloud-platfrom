import { Router } from 'express';

import type { BuildQueueService } from '../services/builds/build-queue-service.ts';
import type { BuildResultReport } from '../services/builds/interfaces.ts';
import { parseBuildResultRequest } from '../services/validation/parse-build-result-request.ts';

/**
 * POST /builds-queue/:id/result — the builder service reports a job's
 * terminal status (`{status, errorMessage?}`). 204 on success (also when the
 * job already finished — the first terminal status wins), 404 when the job is
 * unknown (the builder abandons on that signal).
 */
export function postBuildsQueueResultRoute(builds: BuildQueueService): Router {
    return Router().post('/builds-queue/:id/result', (req, res) => {
        const result: BuildResultReport = parseBuildResultRequest(req.body);
        builds.completeJob(req.params.id, result);
        res.status(204).end();
    });
}
