import { Router } from 'express';

import type { DockerImageService } from '../services/docker/docker-image-service.ts';

/**
 * GET /images/:id — inspects one platform-built image by id (or URL-encoded
 * reference): tags, size, exposed ports, and the build-provenance labels.
 * Only images labeled cloudplatform.managed=true are served (409 otherwise);
 * unknown ids answer 404. Mounted after GET /images/presets, which would
 * otherwise be captured as an id.
 */
export function getImageRoute(images: DockerImageService): Router {
    return Router().get('/images/:id', async (req, res) => {
        res.json(await images.getManagedImageDetails(req.params.id));
    });
}
