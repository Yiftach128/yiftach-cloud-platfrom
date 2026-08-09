import { Router } from 'express';

import type { DockerImageService } from '../services/docker/docker-image-service.ts';

/**
 * GET /images/:id/exposed-ports — the ports a locally present image EXPOSEs,
 * by id or URL-encoded reference, managed or not (the wizard prefills port
 * rows from it for free-typed references). References the daemon does not
 * hold locally answer 404; the registry is never consulted.
 */
export function getImageExposedPortsRoute(images: DockerImageService): Router {
    return Router().get('/images/:id/exposed-ports', async (req, res) => {
        res.json(await images.getImageExposedPorts(req.params.id));
    });
}
