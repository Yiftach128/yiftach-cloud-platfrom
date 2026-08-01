/**
 * Wire types for the backend Docker API (/api/v1), mirroring
 * backend/src/services/docker/interfaces.ts.
 *
 * Kept as a hand-maintained copy on purpose: the two packages share no build,
 * and the shapes differ where JSON serialization flattens them (the backend's
 * `createdAt: Date` arrives here as an ISO 8601 string).
 */

/** Lifecycle states reported by the Engine API. */
export type ContainerState =
    | 'created'
    | 'restarting'
    | 'running'
    | 'removing'
    | 'paused'
    | 'exited'
    | 'dead';

export interface PortBinding {
    /** Port inside the container. */
    privatePort: number;
    /** Host port, when the port is published. */
    publicPort?: number;
    type: 'tcp' | 'udp' | 'sctp';
    /** Host interface the port is published on. */
    ip?: string;
}

export interface Container {
    id: string;
    /** Primary name, without the leading slash Docker adds. */
    name: string;
    /** All names, including network aliases. */
    names: string[];
    image: string;
    imageId: string;
    command: string;
    /** ISO 8601 timestamp (a Date on the backend, serialized by JSON). */
    createdAt: string;
    state: ContainerState;
    /** Human-readable status, e.g. "Exited (0) 4 minutes ago". */
    status: string;
    ports: PortBinding[];
    labels: Record<string, string>;
    /** User-defined networks this container is attached to. */
    networks: string[];
}
