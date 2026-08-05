import { Router } from 'express';

import type { DockerManagerService } from '../services/docker/docker-manager-service.ts';
import type { ContainerDetails, CreateContainerOptions } from '../services/docker/interfaces.ts';
import { parseCreateContainerRequest } from '../services/validation/parse-create-container-request.ts';

/**
 * POST /containers — creates and starts a container from `{name, image, ports,
 * env}`. Synchronous: a missing image is pulled first, so the response can take
 * minutes the first time an image is used. Answers 201 with the new container's
 * details.
 */
export function postContainerRoute(docker: DockerManagerService): Router {
    return Router().post('/containers', async (req, res) => {
        const options: CreateContainerOptions = parseCreateContainerRequest(req.body);
        const details: ContainerDetails = await docker.createContainer(options);
        res.status(201).json(details);
    });
}
