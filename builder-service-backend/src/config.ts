/**
 * Env-driven startup configuration. This file is the one place the `||`
 * defaulting pattern is used (the config.ts exception in the code conventions);
 * everywhere else values resolve through explicit if/else.
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Config } from './interfaces.ts';

export function loadConfig(): Config {
    const dockerHost: string = process.env['DOCKER_HOST'] || 'tcp://127.0.0.1:2375';
    const endpoint: URL = parseDockerHost(dockerHost);

    const config: Config = {
        platformApiUrl: process.env['PLATFORM_API_URL'] || 'http://127.0.0.1:3000/api/v1',
        dockerHost: dockerHost,
        dockerHostName: endpoint.hostname,
        dockerHostPort: Number(endpoint.port || '2375'),
        pollIntervalMs: Number(process.env['POLL_INTERVAL_MS'] || 2000),
        workspaceDir: process.env['WORKSPACE_DIR'] || join(tmpdir(), 'cloudplatform-builder'),
        gitCloneTimeoutMs: Number(process.env['GIT_CLONE_TIMEOUT_MS'] || 120_000),
    };
    console.log('config:', config);
    return config;
}

/** The daemon speaks HTTP on the TCP port, so tcp:// parses as an http URL. */
function parseDockerHost(dockerHost: string): URL {
    const normalized: string = dockerHost.replace(/^tcp:\/\//, 'http://');
    try {
        return new URL(normalized);
    } catch {
        throw new Error(`DOCKER_HOST is not a valid endpoint: "${dockerHost}"`);
    }
}
