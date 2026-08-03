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
