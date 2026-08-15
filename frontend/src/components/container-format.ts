import dayjs from 'dayjs';

import { DockerFetcherError } from '../fetchers/docker-fetcher-error.ts';
import type { ContainerState, PortBinding } from '../fetchers/interfaces.ts';

/** Formatting and action-toolbar helpers shared by the container list and the container details view. */

export function stateTagColor(state: ContainerState): string {
    switch (state) {
        case 'created':
            return 'blue';
        case 'restarting':
            return 'orange';
        case 'running':
            return 'green';
        case 'removing':
            return 'orange';
        case 'paused':
            return 'gold';
        case 'exited':
            return 'default';
        case 'dead':
            return 'red';
    }
}

/**
 * Collapses bindings that differ only by host IP — Docker publishes a port on
 * both IPv4 (`0.0.0.0`) and IPv6 (`::`), and reports one entry per bind address.
 */
export function dedupePortBindings(ports: PortBinding[]): PortBinding[] {
    const seen = new Set<string>();
    const unique: PortBinding[] = [];
    for (const port of ports) {
        const key = `${port.publicPort}:${port.privatePort}/${port.type}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(port);
        }
    }
    return unique;
}

export function formatPorts(ports: PortBinding[]): string {
    return ports
        .map((port: PortBinding) => {
            if (port.publicPort !== undefined) {
                return `${port.publicPort}→${port.privatePort}/${port.type}`;
            }
            return `${port.privatePort}/${port.type}`;
        })
        .join(', ');
}

export function formatTimestamp(iso: string): string {
    return dayjs(iso).format('YYYY-MM-DD HH:mm:ss');
}

/** Stats text for containers without a live sample — stopped, or not sampled yet. */
export const NO_STATS_TEXT: string = '—';

/** "CPU" cell text, e.g. "3.4%" — the `docker stats` percentage, where 100 is one full core. */
export function formatCpuPercent(cpuPercent: number): string {
    return `${cpuPercent.toFixed(1)}%`;
}

/** True for states where Docker's inspect `State.Running` is true — where `stop` is the sensible toggle verb. */
export function isRunningLike(state: ContainerState): boolean {
    switch (state) {
        case 'running':
        case 'paused':
        case 'restarting':
            return true;
        case 'created':
        case 'removing':
        case 'exited':
        case 'dead':
            return false;
    }
}

export function toErrorText(error: unknown): string {
    if (error instanceof DockerFetcherError) {
        return error.message;
    }
    return 'Unexpected error while calling the backend';
}
