import { Router } from 'express';

import type { DockerImageService } from '../services/docker/docker-image-service.ts';

/**
 * DELETE /images/:id — removes a platform-built image by id (or URL-encoded
 * reference). Only images labeled cloudplatform.managed=true are deletable
 * (409 otherwise); an image still used by a container is refused by the daemon
 * (409), and unknown ids answer 404.
 */
export function deleteImageRoute(images: DockerImageService): Router {
    return Router().delete('/images/:id', async (req, res) => {
        await images.deleteManagedImage(req.params.id);
        res.status(204).end();
    });
}
