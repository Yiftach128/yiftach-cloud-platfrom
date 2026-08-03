/**
 * Backend entry point — composition root. Wires services, routes, and middleware
 * together; no logic lives here.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { errorHandler } from './middleware/error-handler.ts';
import { deleteContainerLogsRoute } from './routes/delete-container-logs.ts';
import { deleteContainerRoute } from './routes/delete-container.ts';
import { getContainerLogsRoute } from './routes/get-container-logs.ts';
import { getContainerRoute } from './routes/get-container.ts';
import { getContainersRoute } from './routes/get-containers.ts';
import { getHealthRoute } from './routes/get-health.ts';
import { getImagePresetsRoute } from './routes/get-image-presets.ts';
import { postContainerRestartRoute } from './routes/post-container-restart.ts';
import { postContainerStartRoute } from './routes/post-container-start.ts';
import { postContainerStopRoute } from './routes/post-container-stop.ts';
import { DockerManagerService } from './services/docker/docker-manager-service.ts';
import { resolveDockerEndpoint } from './services/docker/resolve-docker-endpoint.ts';
import { ImagePresetService } from './services/images/image-preset-service.ts';
import { bootstrapWslDocker } from './services/wsl/bootstrap-wsl-docker.ts';
import { WslDockerHostFiles } from './services/wsl/wsl-docker-host-files.ts';

// Load backend/.env (sits next to package.json, one level above src/ and dist/ alike),
// regardless of the launch directory. Real environment variables take precedence over
// file values; a missing .env just means defaults.
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

let port: number = 3000;
const portEnv = process.env['PORT'];
if (portEnv !== undefined) {
    port = Number(portEnv);
}

let host: string = '127.0.0.1';
const hostEnv = process.env['HOST'];
if (hostEnv !== undefined) {
    host = hostEnv;
}

const endpoint = resolveDockerEndpoint();
const daemon = bootstrapWslDocker(endpoint.baseUrl);
const docker = new DockerManagerService({ daemon, hostFiles: new WslDockerHostFiles() });
const imagePresets = new ImagePresetService();

const app = express();
app.use(getHealthRoute(docker)); // liveness probe stays unversioned
app.use('/api/v1', getContainersRoute(docker));
app.use('/api/v1', getContainerRoute(docker));
app.use('/api/v1', deleteContainerRoute(docker));
app.use('/api/v1', deleteContainerLogsRoute(docker));
app.use('/api/v1', getContainerLogsRoute(docker));
app.use('/api/v1', postContainerStartRoute(docker));
app.use('/api/v1', postContainerStopRoute(docker));
app.use('/api/v1', postContainerRestartRoute(docker));
app.use('/api/v1', getImagePresetsRoute(imagePresets));
app.use(errorHandler);

const server = app.listen(port, host, () => {
    console.log(`backend listening on http://${host}:${port} -> docker at ${docker.baseUrl}`);
});

const shutdownSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
for (const signal of shutdownSignals) {
    process.on(signal, () => {
        daemon.stop();
        server.close(() => process.exit(0));
        // Fallback if connections linger past close.
        setTimeout(() => process.exit(0), 3_000).unref();
    });
}
