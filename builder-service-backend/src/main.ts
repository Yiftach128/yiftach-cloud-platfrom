/**
 * Builder service entry point — a pure polling worker, no HTTP server. It
 * claims queued image builds from the platform, clones the repository into a
 * scratch workspace, streams a tar build context to the Docker daemon (the
 * daemon never runs git), has the platform create the container from the
 * built image, and always deletes the workspace afterwards.
 */

import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './config.ts';
import { ImageBuilderService } from './services/docker/image-builder-service.ts';
import { GitCloneService } from './services/git/git-clone-service.ts';
import { PlatformApiClient } from './services/platform/platform-api-client.ts';
import { BuildWorker } from './services/worker/build-worker.ts';
import { PortResolver } from './services/worker/port-resolver.ts';

// Load builder-service-backend/.env (sits next to package.json) if present.
const envFile: string = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

const config = loadConfig();
await mkdir(config.workspaceDir, { recursive: true });

const platform = new PlatformApiClient(config.platformApiUrl);
const git = new GitCloneService();
const images = new ImageBuilderService({
    host: config.dockerHostName,
    port: config.dockerHostPort,
});
const portResolver = new PortResolver(platform);
const worker = new BuildWorker(platform, git, images, portResolver, {
    pollIntervalMs: config.pollIntervalMs,
    workspaceDir: config.workspaceDir,
    gitCloneTimeoutMs: config.gitCloneTimeoutMs,
});

let stopSignals = 0;
const requestStop = (): void => {
    stopSignals = stopSignals + 1;
    if (stopSignals > 1) {
        console.log('forced exit');
        process.exit(130);
    }
    console.log('finishing the current task, then stopping (press again to force)...');
    worker.requestStop();
};
process.on('SIGINT', requestStop);
process.on('SIGTERM', requestStop);

await worker.run();
console.log('builder stopped');
