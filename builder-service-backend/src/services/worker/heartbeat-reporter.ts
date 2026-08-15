/**
 * Reports this builder's presence and status to the platform. Heartbeats are
 * a dedicated call rather than a side effect of the claim poll on purpose:
 * they must keep flowing during a long build, or the agent would look offline
 * exactly while it is working. Every idle/building transition beats
 * immediately so the UI flips without waiting an interval; the interval beat
 * covers steady state. Send failures are swallowed silently — a down platform
 * already fails the claim poll quietly, and a warning every beat during an
 * outage would be spam. Overlapping sends are harmless: the platform upserts
 * by name.
 */

import type { AgentHeartbeatRequest } from '../platform/interfaces.ts';
import { PlatformApiClient } from '../platform/platform-api-client.ts';
import type { HeartbeatReporterOptions } from './interfaces.ts';

export class HeartbeatReporter {
    private readonly platform: PlatformApiClient;
    private readonly options: HeartbeatReporterOptions;
    /** The reporter is built at process startup, so this is the process start for uptime purposes. */
    private readonly startedAt: Date = new Date();
    private status: 'idle' | 'building' = 'idle';
    private currentJobId: string | undefined = undefined;
    private timer: NodeJS.Timeout | undefined;

    constructor(platform: PlatformApiClient, options: HeartbeatReporterOptions) {
        this.platform = platform;
        this.options = options;
    }

    /** Sends the first beat immediately, then one every interval (unref'd — never holds the process open). */
    public start(): void {
        if (this.timer !== undefined) {
            return;
        }
        void this.sendHeartbeat();
        this.timer = setInterval(() => {
            void this.sendHeartbeat();
        }, this.options.heartbeatIntervalMs);
        this.timer.unref();
    }

    /** Marks the agent as building a job and beats immediately. */
    public setBuilding(jobId: string): void {
        this.status = 'building';
        this.currentJobId = jobId;
        void this.sendHeartbeat();
    }

    /** Marks the agent idle again and beats immediately. */
    public setIdle(): void {
        this.status = 'idle';
        this.currentJobId = undefined;
        void this.sendHeartbeat();
    }

    public stop(): void {
        if (this.timer !== undefined) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }

    private async sendHeartbeat(): Promise<void> {
        const heartbeat: AgentHeartbeatRequest = {
            name: this.options.agentName,
            status: this.status,
            startedAt: this.startedAt.toISOString(),
        };
        if (this.currentJobId !== undefined) {
            heartbeat.currentJobId = this.currentJobId;
        }
        try {
            await this.platform.sendAgentHeartbeat(heartbeat);
        } catch {
            // Presence is best-effort; the platform marks silent agents
            // offline on its own, so a lost beat needs no handling here.
        }
    }
}
