/**
 * Backend entry point — composition root. Wires services, routes, and middleware
 * together; no logic lives here.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { errorHandler } from './middleware/error-handler.ts';
import { getContainersRoute } from './routes/get-containers.ts';
import { getHealthRoute } from './routes/get-health.ts';
import { DockerManagerService } from './services/docker/docker-manager-service.ts';
import { resolveDockerEndpoint } from './services/docker/resolve-docker-endpoint.ts';
import { bootstrapWslDocker } from './services/wsl-bootstrap/bootstrap-wsl-docker.ts';

// Load backend/.env (sits next to package.json, one level above src/ and dist/ alike),
// regardless of the launch directory. Real environment variables take precedence over
// file values; a missing .env just means defaults.
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

const PORT = Number(process.env['PORT'] ?? 3000);
const HOST = process.env['HOST'] ?? '127.0.0.1';

const endpoint = resolveDockerEndpoint();
const daemon = bootstrapWslDocker(endpoint.baseUrl);
const docker = new DockerManagerService({ daemon });

const app = express();
app.use(getHealthRoute(docker)); // liveness probe stays unversioned
app.use('/api/v1', getContainersRoute(docker));
app.use(errorHandler);

const server = app.listen(PORT, HOST, () => {
    console.log(`backend listening on http://${HOST}:${PORT} -> docker at ${docker.baseUrl}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
        daemon.stop();
        server.close(() => process.exit(0));
        // Fallback if connections linger past close.
        setTimeout(() => process.exit(0), 3_000).unref();
    });
}
