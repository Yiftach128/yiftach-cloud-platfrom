/**
 * Boots the WSL distro that hosts dockerd, and holds it open.
 *
 * WSL neither starts on Windows boot nor stays up — it tears the distro down after a
 * few minutes idle. `ensureRunning()` makes the daemon reachable on demand; the
 * keepalive (a `sleep infinity` inside the distro) prevents the idle teardown while
 * the backend runs. `stop()` releases it, after which WSL may idle out again.
 *
 * Implements the docker service's `DockerDaemonLifecycle` contract; failures are
 * reported as `DockerConnectionError` so the existing error mapping (503) applies.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { DockerConnectionError } from '../docker/docker-connection-error.ts';
import type { DockerDaemonLifecycle } from '../docker/interfaces.ts';
import type { WslDockerDaemonOptions } from './interfaces.ts';

export * from './interfaces.ts';

const DEFAULT_DISTRO = 'Ubuntu';
const DEFAULT_BOOT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const PING_TIMEOUT_MS = 1_500;
const KEEPALIVE_RESPAWN_DELAY_MS = 5_000;

export class WslDockerDaemon implements DockerDaemonLifecycle {
    readonly #pingUrl: string;
    readonly #baseUrl: string;
    readonly #distro: string;
    readonly #bootTimeoutMs: number;
    readonly #pollIntervalMs: number;
    readonly #keepaliveEnabled: boolean;

    #ensuring: Promise<void> | null = null;
    #keepalive: ChildProcess | null = null;
    #stopped = false;

    constructor(options: WslDockerDaemonOptions) {
        this.#pingUrl = options.pingUrl;
        this.#baseUrl = options.pingUrl.replace(/\/_ping$/, '');
        this.#distro = options.distro ?? DEFAULT_DISTRO;
        this.#bootTimeoutMs = options.bootTimeoutMs ?? DEFAULT_BOOT_TIMEOUT_MS;
        this.#pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
        this.#keepaliveEnabled = options.keepalive ?? true;
    }

    /**
     * Resolves once the daemon answers; boots the WSL distro if it doesn't.
     * Single-flight: concurrent callers share one in-flight attempt.
     */
    ensureRunning(): Promise<void> {
        this.#ensuring ??= this.#ensure().finally(() => {
            this.#ensuring = null;
        });
        return this.#ensuring;
    }

    /** Stops respawning and releases the keepalive; the distro may idle out afterwards. */
    stop(): void {
        this.#stopped = true;
        this.#keepalive?.kill();
        this.#keepalive = null;
    }

    async #ensure(): Promise<void> {
        if (await this.#ping()) {
            this.#startKeepalive();
            return;
        }
        if (process.platform !== 'win32') {
            throw new DockerConnectionError(
                this.#baseUrl,
                new Error('daemon is down and this is not Windows — no WSL distro to boot'),
            );
        }

        await this.#bootDistro();

        const deadline = Date.now() + this.#bootTimeoutMs;
        while (Date.now() < deadline) {
            if (await this.#ping()) {
                this.#startKeepalive();
                return;
            }
            await delay(this.#pollIntervalMs);
        }
        throw new DockerConnectionError(
            this.#baseUrl,
            new Error(`daemon not ready within ${this.#bootTimeoutMs}ms of booting WSL distro "${this.#distro}"`),
        );
    }

    async #ping(): Promise<boolean> {
        try {
            const response = await fetch(this.#pingUrl, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
            return response.ok;
        } catch {
            return false;
        }
    }

    /** Boots the distro; a fast no-op when it is already running. */
    #bootDistro(): Promise<void> {
        return new Promise((resolve) => {
            const boot = spawn('wsl.exe', ['-d', this.#distro, '-e', 'true'], { stdio: 'ignore' });
            boot.on('error', () => resolve()); // wsl.exe missing — the poll loop will time out
            boot.on('exit', () => resolve());
        });
    }

    #startKeepalive(): void {
        if (!this.#keepaliveEnabled || this.#stopped || this.#keepalive) return;
        if (process.platform !== 'win32') return;

        const child = spawn('wsl.exe', ['-d', this.#distro, '--exec', 'sleep', 'infinity'], {
            stdio: 'ignore',
        });
        child.unref(); // never holds Node's event loop open
        child.on('error', () => {
            this.#keepalive = null;
        });
        child.on('exit', () => {
            this.#keepalive = null;
            if (this.#stopped) return;
            // WSL was shut down externally; bring it back and hold it open again.
            void delay(KEEPALIVE_RESPAWN_DELAY_MS).then(() => {
                if (!this.#stopped) void this.ensureRunning().catch(() => {});
            });
        });
        this.#keepalive = child;
    }
}
