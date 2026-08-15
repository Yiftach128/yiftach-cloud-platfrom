/**
 * Env-driven startup configuration — the one module that reads process.env.
 * It loads `.env` itself, at the top, because ESM import hoisting evaluates
 * this module before any statement in main.ts runs. This file is the `||`
 * defaulting carve-out in the code conventions, and IConfig lives in-file as
 * a deliberate exception to the types-live-in-interfaces.ts rule.
 */

import { existsSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load builder-service-backend/.env (sits next to package.json, two levels
// above this file) if present. Real environment variables take precedence
// over file values; a missing .env just means defaults.
const envFile: string = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

export interface IConfig {
    /** Platform API base URL, including the version prefix. */
    PLATFORM_API_URL: string;
    /** Docker daemon endpoint as configured (docker CLI style, e.g. tcp://127.0.0.1:2375). */
    DOCKER_HOST: string;
    /** Host name parsed out of DOCKER_HOST. */
    DOCKER_HOST_NAME: string;
    /** Port parsed out of DOCKER_HOST. */
    DOCKER_HOST_PORT: number;
    /** How long to wait between claim polls when the queue is empty (milliseconds). */
    POLL_INTERVAL_MS: number;
    /** Name this builder reports itself as; defaults to the machine hostname. */
    AGENT_NAME: string;
    /** How often the builder heartbeats the platform (milliseconds). */
    HEARTBEAT_INTERVAL_MS: number;
    /** Directory that holds the per-build clone workspaces. */
    WORKSPACE_DIR: string;
    /** Hard cap on a single git clone (milliseconds). */
    GIT_CLONE_TIMEOUT_MS: number;
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

// DOCKER_HOST_NAME / DOCKER_HOST_PORT are derived, so the endpoint resolves
// into named locals first (fail-fast on a malformed value), then the literal.
const dockerHost: string = process.env.DOCKER_HOST || 'tcp://127.0.0.1:2375';
const dockerEndpoint: URL = parseDockerHost(dockerHost);

export const config: IConfig = {
    PLATFORM_API_URL: process.env.PLATFORM_API_URL || 'http://127.0.0.1:3000/api/v1',
    DOCKER_HOST: dockerHost,
    DOCKER_HOST_NAME: dockerEndpoint.hostname,
    DOCKER_HOST_PORT: Number(dockerEndpoint.port || '2375'),
    POLL_INTERVAL_MS: Number(process.env.POLL_INTERVAL_MS || '2000'),
    AGENT_NAME: process.env.AGENT_NAME || hostname(),
    HEARTBEAT_INTERVAL_MS: Number(process.env.HEARTBEAT_INTERVAL_MS || '10000'),
    WORKSPACE_DIR: process.env.WORKSPACE_DIR || join(tmpdir(), 'cloudplatform-builder'),
    GIT_CLONE_TIMEOUT_MS: Number(process.env.GIT_CLONE_TIMEOUT_MS || '120000'),
};

console.log('config:', config);
