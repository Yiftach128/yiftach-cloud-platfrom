import type { ErrorRequestHandler } from 'express';

import { BuildJobNotFoundError } from '../services/builds/build-job-not-found-error.ts';
import { BuildQueueFullError } from '../services/builds/build-queue-full-error.ts';
import { DockerApiError } from '../services/docker/docker-api-error.ts';
import { DockerConnectionError } from '../services/docker/docker-connection-error.ts';
import { ImageNotManagedError } from '../services/docker/image-not-managed-error.ts';
import { ImagePullError } from '../services/docker/image-pull-error.ts';
import { LogsNotClearableError } from '../services/docker/logs-not-clearable-error.ts';
import { ValidationError } from '../services/validation/validation-error.ts';

/**
 * Maps service-layer failures onto HTTP responses, so route files stay thin.
 * Express 5 forwards rejected async handlers here automatically.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ValidationError) {
        res.status(400).json({ message: error.message });
        return;
    }
    // express.json() rejects malformed bodies with a SyntaxError carrying status 400.
    if (error instanceof SyntaxError && isBodyParseFailure(error)) {
        res.status(400).json({ message: 'Request body is not valid JSON' });
        return;
    }
    if (error instanceof ImagePullError) {
        res.status(404).json({ message: error.message });
        return;
    }
    if (error instanceof BuildQueueFullError) {
        res.status(429).json({ message: error.message });
        return;
    }
    if (error instanceof BuildJobNotFoundError) {
        res.status(404).json({ message: error.message });
        return;
    }
    if (error instanceof ImageNotManagedError) {
        res.status(409).json({ message: error.message });
        return;
    }
    if (error instanceof DockerApiError) {
        res.status(error.status).json({ message: error.message });
        return;
    }
    if (error instanceof DockerConnectionError) {
        res.status(503).json({ message: error.message });
        return;
    }
    if (error instanceof LogsNotClearableError) {
        res.status(409).json({ message: error.message });
        return;
    }
    let message: string;
    if (error instanceof Error) {
        message = error.message;
    } else {
        message = String(error);
    }
    res.status(500).json({ message: message });
};

/** body-parser marks its JSON parse failures with `status: 400` on the SyntaxError. */
function isBodyParseFailure(error: SyntaxError): boolean {
    const status = (error as { status?: unknown }).status;
    return status === 400;
}
