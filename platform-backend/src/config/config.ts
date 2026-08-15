/**
 * Env-driven startup configuration — the one module that reads process.env.
 * It loads `.env` itself, at the top, because ESM import hoisting evaluates
 * this module before any statement in server.ts runs. This file is the `||`
 * defaulting carve-out in the code conventions, and IConfig lives in-file as
 * a deliberate exception to the types-live-in-interfaces.ts rule.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Load platform-backend/.env (sits next to package.json, two levels above this
// file — the same ../../ holds from dist/config/ after a build), regardless of
// the launch directory. Real environment variables take precedence over file
// values; a missing .env just means defaults.
const envFile: string = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
}

export interface IConfig {
    /** Port the HTTP server binds. */
    PORT: number;
    /** Address the HTTP server binds. */
    HOST: string;
    /** Docker daemon endpoint as configured (docker CLI style, e.g. tcp://127.0.0.1:2375). */
    DOCKER_HOST: string;
    /** "0" disables holding the WSL distro open while the server runs. */
    DOCKER_WSL_KEEPALIVE: string;
    /**
     * How long a running build may go silent before the stale sweep fails it
     * (milliseconds). Overridable mainly so verification can exercise the
     * sweep quickly.
     */
    BUILD_STALE_TIMEOUT_MS: number;
}

export const config: IConfig = {
    PORT: Number(process.env.PORT || '3000'),
    HOST: process.env.HOST || '127.0.0.1',
    DOCKER_HOST: process.env.DOCKER_HOST || 'tcp://127.0.0.1:2375',
    DOCKER_WSL_KEEPALIVE: process.env.DOCKER_WSL_KEEPALIVE || '1',
    BUILD_STALE_TIMEOUT_MS: Number(process.env.BUILD_STALE_TIMEOUT_MS || '600000'),
};

console.log('config:', config);
