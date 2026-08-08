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
    private readonly pingUrl: string;
    private readonly baseUrl: string;
    private readonly distro: string;
    private readonly bootTimeoutMs: number;
    private readonly pollIntervalMs: number;
    private readonly keepaliveEnabled: boolean;

    private ensuring: Promise<void> | null = null;
    private keepalive: ChildProcess | null = null;
    private stopped: boolean = false;

    constructor(options: WslDockerDaemonOptions) {
        this.pingUrl = options.pingUrl;
        this.baseUrl = options.pingUrl.replace(/\/_ping$/, '');

        if (options.distro === undefined) {
            this.distro = DEFAULT_DISTRO;
        } else {
            this.distro = options.distro;
        }

        if (options.bootTimeoutMs === undefined) {
            this.bootTimeoutMs = DEFAULT_BOOT_TIMEOUT_MS;
        } else {
            this.bootTimeoutMs = options.bootTimeoutMs;
        }

        if (options.pollIntervalMs === undefined) {
            this.pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
        } else {
            this.pollIntervalMs = options.pollIntervalMs;
        }

        if (options.keepalive === undefined) {
            this.keepaliveEnabled = true;
        } else {
            this.keepaliveEnabled = options.keepalive;
        }
    }

    /**
     * Resolves once the daemon answers; boots the WSL distro if it doesn't.
     * Single-flight: concurrent callers share one in-flight attempt.
     */
    ensureRunning(): Promise<void> {
        if (this.ensuring === null) {
            this.ensuring = this.ensure().finally(() => {
                this.ensuring = null;
            });
        }
        return this.ensuring;
    }

    /** Stops respawning and releases the keepalive; the distro may idle out afterwards. */
    stop(): void {
        this.stopped = true;
        if (this.keepalive !== null) {
            this.keepalive.kill();
        }
        this.keepalive = null;
    }

    private async ensure(): Promise<void> {
        if (await this.ping()) {
            this.startKeepalive();
            return;
        }
        if (process.platform !== 'win32') {
            throw new DockerConnectionError(
                this.baseUrl,
                new Error('daemon is down and this is not Windows — no WSL distro to boot'),
            );
        }

        await this.bootDistro();

        const deadline = Date.now() + this.bootTimeoutMs;
        while (Date.now() < deadline) {
            if (await this.ping()) {
                this.startKeepalive();
                return;
            }
            await delay(this.pollIntervalMs);
        }
        throw new DockerConnectionError(
            this.baseUrl,
            new Error(`daemon not ready within ${this.bootTimeoutMs}ms of booting WSL distro "${this.distro}"`),
        );
    }

    private async ping(): Promise<boolean> {
        try {
            const response = await fetch(this.pingUrl, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
            return response.ok;
        } catch {
            return false;
        }
    }

    /** Boots the distro; a fast no-op when it is already running. */
    private bootDistro(): Promise<void> {
        return new Promise((resolve) => {
            // windowsHide: keeps this child off the backend's console (see
            // startKeepalive) — detached would do that too, but a console-less
            // wsl.exe allocates its own visible console window.
            const boot = spawn('wsl.exe', ['-d', this.distro, '-e', 'true'], {
                stdio: 'ignore',
                windowsHide: true,
            });
            boot.on('error', () => resolve()); // wsl.exe missing — the poll loop will time out
            boot.on('exit', () => resolve());
        });
    }

    private startKeepalive(): void {
        if (!this.keepaliveEnabled || this.stopped || this.keepalive !== null) {
            return;
        }
        if (process.platform !== 'win32') {
            return;
        }

        // windowsHide gives this long-lived child its own hidden console
        // instead of the backend terminal's: a wsl.exe sharing that console
        // can flip its input modes and interfere with Ctrl+C handling.
        // (detached would isolate it too, but a console-less wsl.exe allocates
        // its own VISIBLE console window.) stop() still kills it by PID.
        const child = spawn('wsl.exe', ['-d', this.distro, '--exec', 'sleep', 'infinity'], {
            stdio: 'ignore',
            windowsHide: true,
        });
        child.unref(); // never holds Node's event loop open
        child.on('error', () => {
            this.keepalive = null;
        });
        child.on('exit', () => {
            this.keepalive = null;
            if (this.stopped) {
                return;
            }
            // WSL was shut down externally; bring it back and hold it open again.
            void delay(KEEPALIVE_RESPAWN_DELAY_MS).then(() => {
                if (!this.stopped) {
                    void this.ensureRunning().catch(() => {});
                }
            });
        });
        this.keepalive = child;
    }
}
