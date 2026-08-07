import { Router } from 'express';

import type { DockerImageService } from '../services/docker/docker-image-service.ts';

/** GET /images — the platform-built images (labeled cloudplatform.managed=true). */
export function getImagesRoute(images: DockerImageService): Router {
    return Router().get('/images', async (_req, res) => {
        res.json(await images.getManagedImages());
    });
}
