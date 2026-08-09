import type { Container, PortBinding } from '../fetchers/interfaces.ts';
import type { PortRowValue } from './interfaces.ts';

export const MIN_PORT = 1;
export const MAX_PORT = 65535;

/**
 * Every host port the given containers publish. The list endpoint only reports
 * published ports for running containers, so a stopped container's reserved
 * bindings are not represented — conflict checks built on this set are
 * best-effort by design.
 */
export function collectTakenHostPorts(containers: Container[]): Set<number> {
    const taken = new Set<number>();
    for (const container of containers) {
        for (const binding of container.ports) {
            const portBinding: PortBinding = binding;
            if (portBinding.publicPort !== undefined) {
                taken.add(portBinding.publicPort);
            }
        }
    }
    return taken;
}

/**
 * The first free host port at or above `desired`, walking upward and skipping
 * taken ports. If every port through {@link MAX_PORT} is taken (pathological),
 * returns `desired` and lets the form's conflict validator flag it.
 */
export function nextFreeHostPort(desired: number, taken: Set<number>): number {
    for (let candidate = desired; candidate <= MAX_PORT; candidate++) {
        if (!taken.has(candidate)) {
            return candidate;
        }
    }
    return desired;
}

/**
 * Locked ports rows for container ports known from trusted image metadata
 * (preset catalog values or the image's EXPOSEs). Each row's host port
 * defaults to the next free port at or above the container port; assigned
 * ports are claimed as the rows build, so sibling rows never collide with
 * each other.
 */
export function buildLockedPortRows(containerPorts: number[], taken: Set<number>): PortRowValue[] {
    const working = new Set<number>(taken);
    const rows: PortRowValue[] = [];
    for (const containerPort of containerPorts) {
        const hostPort: number = nextFreeHostPort(containerPort, working);
        working.add(hostPort);
        rows.push({ hostPort: hostPort, containerPort: containerPort, locked: true });
    }
    return rows;
}
