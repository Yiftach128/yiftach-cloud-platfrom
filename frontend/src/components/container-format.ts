import dayjs from 'dayjs';

import type { ContainerState, PortBinding } from '../fetchers/interfaces.ts';

/** Formatting helpers shared by the container list and the container details view. */

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
