/**
 * Builder service entry point — a pure polling worker, no HTTP server. It
 * claims queued image builds from the platform, clones the repository into a
 * scratch workspace, streams a tar build context to the Docker daemon (the
 * daemon never runs git), has the platform create the container from the
 * built image, and always deletes the workspace afterwards.
 */

import { mkdir } from 'node:fs/promises';

import { config } from './config/config.ts';
import { ImageBuilderService } from './services/docker/image-builder-service.ts';
import { GitCloneService } from './services/git/git-clone-service.ts';
import { PlatformApiClient } from './services/platform/platform-api-client.ts';
import { BuildWorker } from './services/worker/build-worker.ts';
import { HeartbeatReporter } from './services/worker/heartbeat-reporter.ts';
import { PortResolver } from './services/worker/port-resolver.ts';

await mkdir(config.WORKSPACE_DIR, { recursive: true });

const platform = new PlatformApiClient(config.PLATFORM_API_URL);
const git = new GitCloneService();
const images = new ImageBuilderService({
    host: config.DOCKER_HOST_NAME,
    port: config.DOCKER_HOST_PORT,
});
const portResolver = new PortResolver(platform);
const heartbeats = new HeartbeatReporter(platform, {
    agentName: config.AGENT_NAME,
    heartbeatIntervalMs: config.HEARTBEAT_INTERVAL_MS,
});
const worker = new BuildWorker(platform, git, images, portResolver, heartbeats, {
    pollIntervalMs: config.POLL_INTERVAL_MS,
    workspaceDir: config.WORKSPACE_DIR,
    gitCloneTimeoutMs: config.GIT_CLONE_TIMEOUT_MS,
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

heartbeats.start();
await worker.run();
heartbeats.stop();
console.log('builder stopped');
