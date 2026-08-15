/**
 * Resolves the ports to publish for a build whose container config carried
 * none: every TCP port the built image EXPOSEs, host port = container port,
 * bumped to the next free host port when taken. An image with no TCP EXPOSE
 * publishes nothing. The allocation deliberately mirrors the frontend's
 * port-defaults.ts (nextFreeHostPort / buildLockedPortRows), including
 * in-batch claiming so a multi-EXPOSE image never collides with itself.
 * Duplicate container ports cannot occur — the daemon's ExposedPorts keys are
 * unique per port/protocol and only "tcp" survives the filter.
 */

import type { ContainerSummary, ImageExposedPort, PortMapping } from '../platform/interfaces.ts';
import { PlatformApiClient } from '../platform/platform-api-client.ts';

const MAX_PORT = 65535;

export class PortResolver {
    private readonly platform: PlatformApiClient;

    constructor(platform: PlatformApiClient) {
        this.platform = platform;
    }

    /**
     * Every resolution decision is reported through onLogLine so the build
     * panel shows what was published and why. Failures (image not local,
     * platform unreachable) propagate — the worker fails the job with them.
     */
    public async resolvePorts(
        imageTag: string,
        onLogLine: (line: string) => void,
    ): Promise<PortMapping[]> {
        const exposed: ImageExposedPort[] = await this.platform.getImageExposedPorts(imageTag);

        const tcpPorts: number[] = [];
        for (const exposedPort of exposed) {
            if (exposedPort.protocol === 'tcp') {
                tcpPorts.push(exposedPort.port);
            } else {
                onLogLine(`Ignoring exposed port ${exposedPort.port}/${exposedPort.protocol} — only TCP ports are published`);
            }
        }

        if (tcpPorts.length === 0) {
            onLogLine('The image exposes no TCP ports — the container starts with nothing published');
            return [];
        }

        const containers: ContainerSummary[] = await this.platform.getContainers();
        const taken: Set<number> = collectTakenHostPorts(containers);

        const mappings: PortMapping[] = [];
        for (const containerPort of tcpPorts) {
            const hostPort: number = nextFreeHostPort(containerPort, taken);
            taken.add(hostPort);
            if (hostPort === containerPort) {
                onLogLine(`Publishing container port ${containerPort}/tcp on host port ${hostPort}`);
            } else {
                onLogLine(`Publishing container port ${containerPort}/tcp on host port ${hostPort} (${containerPort} is taken)`);
            }
            mappings.push({ hostPort: hostPort, containerPort: containerPort });
        }
        return mappings;
    }
}

/**
 * Every host port the listed containers publish. The list endpoint only
 * reports bindings for running containers, so the set is best-effort — the
 * same policy as the frontend's conflict validation; a real bind conflict
 * still fails the container create with the daemon's message.
 */
function collectTakenHostPorts(containers: ContainerSummary[]): Set<number> {
    const taken = new Set<number>();
    for (const container of containers) {
        for (const binding of container.ports) {
            if (binding.publicPort !== undefined) {
                taken.add(binding.publicPort);
            }
        }
    }
    return taken;
}

/**
 * First free host port at or above the desired one (mirrors the frontend's
 * port-defaults.ts). Returns the desired port itself when everything through
 * MAX_PORT is taken — pathological; the daemon then rejects the bind.
 */
function nextFreeHostPort(desired: number, taken: Set<number>): number {
    for (let candidate = desired; candidate <= MAX_PORT; candidate++) {
        if (!taken.has(candidate)) {
            return candidate;
        }
    }
    return desired;
}
