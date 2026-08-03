import type { ErrorRequestHandler } from 'express';

import { DockerApiError } from '../services/docker/docker-api-error.ts';
import { DockerConnectionError } from '../services/docker/docker-connection-error.ts';
import { LogsNotClearableError } from '../services/docker/logs-not-clearable-error.ts';

/**
 * Maps service-layer failures onto HTTP responses, so route files stay thin.
 * Express 5 forwards rejected async handlers here automatically.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
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
