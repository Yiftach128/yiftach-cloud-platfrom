import { Router } from 'express';

import type { ImageBuildService } from '../services/builds/image-build-service.ts';
import type { BuildJob, StartBuildOptions } from '../services/builds/interfaces.ts';
import { parseStartBuildRequest } from '../services/validation/parse-start-build-request.ts';

/**
 * POST /builds — starts a daemon-side build of a public GitHub repository from
 * `{gitUrl}`. Answers 202 with the new job immediately; the client polls
 * GET /builds/:id for progress. 409 while another build is running.
 */
export function postBuildRoute(builds: ImageBuildService): Router {
    return Router().post('/builds', (req, res) => {
        const options: StartBuildOptions = parseStartBuildRequest(req.body);
        const job: BuildJob = builds.startBuild(options);
        res.status(202).json(job);
    });
}
