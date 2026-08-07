import { Router } from 'express';

import type { BuildQueueService } from '../services/builds/build-queue-service.ts';
import { parseAppendBuildLogsRequest } from '../services/validation/parse-append-build-logs-request.ts';

/**
 * POST /builds-queue/:id/logs — the builder service appends a batch of
 * progress lines to a running job (`{lines: string[]}`). 204 on success,
 * 404 when the job is unknown (the builder abandons on that signal).
 */
export function postBuildsQueueLogsRoute(builds: BuildQueueService): Router {
    return Router().post('/builds-queue/:id/logs', (req, res) => {
        const lines: string[] = parseAppendBuildLogsRequest(req.body);
        builds.appendLogs(req.params.id, lines);
        res.status(204).end();
    });
}
