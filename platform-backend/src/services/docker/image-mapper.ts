/**
 * Maps the Docker daemon's raw image wire shapes onto the platform's
 * `ImageSummary` type. The raw shapes live here, next to the mapping, so
 * `interfaces.ts` never depends on dockerode and the rest of the platform only
 * ever sees the public types.
 */

import type { ImageDetails, ImageExposedPort, ImageSummary } from './interfaces.ts';

/** The daemon reports dangling images with this placeholder tag. */
const UNTAGGED_PLACEHOLDER = '<none>:<none>';

/**
 * Defensive view of `Dockerode.ImageInfo`: dockerode declares most fields as
 * always present, but this module reads the collections through this type so a
 * field the daemon omits maps to an empty result instead of a crash at runtime.
 */
export interface RawImageInfo {
    Id: string;
    Created: number;
    Size: number;
    RepoTags?: string[] | null;
    Labels?: Record<string, string> | null;
    Containers?: number;
}

export function toImageSummary(info: RawImageInfo): ImageSummary {
    let tags: string[];
    if (info.RepoTags === undefined || info.RepoTags === null) {
        tags = [];
    } else {
        tags = info.RepoTags.filter((tag) => tag !== UNTAGGED_PLACEHOLDER);
    }

    let labels: Record<string, string>;
    if (info.Labels === undefined || info.Labels === null) {
        labels = {};
    } else {
        labels = info.Labels;
    }

    let containers: number;
    if (info.Containers === undefined) {
        containers = -1;
    } else {
        containers = info.Containers;
    }

    return {
        id: info.Id,
        tags: tags,
        createdAt: new Date(info.Created * 1000),
        sizeBytes: info.Size,
        labels: labels,
        containers: containers,
    };
}

/**
 * Defensive view of `Dockerode.ImageInspectInfo`: only the fields the platform
 * serves, all optional (except the id) so a field the daemon omits maps to an
 * empty result instead of a crash at runtime.
 */
export interface RawImageDetails {
    Id: string;
    RepoTags?: string[] | null;
    /** RFC 3339 timestamp. */
    Created?: string;
    Size?: number;
    Architecture?: string;
    Os?: string;
    Config?: {
        Labels?: Record<string, string> | null;
        /** Keys like "80/tcp"; the values are always empty objects. */
        ExposedPorts?: Record<string, unknown> | null;
    } | null;
}

/** Reads an inspected image's repository tags; a missing wire field and the dangling placeholder map to an empty list. */
export function readRepoTags(details: RawImageDetails): string[] {
    if (details.RepoTags === undefined || details.RepoTags === null) {
        return [];
    }
    return details.RepoTags.filter((tag) => tag !== UNTAGGED_PLACEHOLDER);
}

/** Reads an inspected image's labels; missing wire fields map to an empty record. */
export function readImageLabels(details: RawImageDetails): Record<string, string> {
    if (details.Config === undefined || details.Config === null) {
        return {};
    }
    if (details.Config.Labels === undefined || details.Config.Labels === null) {
        return {};
    }
    return details.Config.Labels;
}

export function toImageDetails(details: RawImageDetails): ImageDetails {
    let createdAt: Date;
    if (details.Created === undefined) {
        createdAt = new Date(0);
    } else {
        createdAt = new Date(details.Created);
    }

    let sizeBytes: number;
    if (details.Size === undefined) {
        sizeBytes = -1;
    } else {
        sizeBytes = details.Size;
    }

    let architecture: string;
    if (details.Architecture === undefined) {
        architecture = '';
    } else {
        architecture = details.Architecture;
    }

    let os: string;
    if (details.Os === undefined) {
        os = '';
    } else {
        os = details.Os;
    }

    return {
        id: details.Id,
        tags: readRepoTags(details),
        createdAt: createdAt,
        sizeBytes: sizeBytes,
        labels: readImageLabels(details),
        exposedPorts: readExposedPorts(details),
        architecture: architecture,
        os: os,
    };
}

/** Parses `Config.ExposedPorts` keys ("80/tcp") into port/protocol pairs, ascending by port. */
function readExposedPorts(details: RawImageDetails): ImageExposedPort[] {
    if (details.Config === undefined || details.Config === null) {
        return [];
    }
    if (details.Config.ExposedPorts === undefined || details.Config.ExposedPorts === null) {
        return [];
    }

    const ports: ImageExposedPort[] = [];
    for (const key of Object.keys(details.Config.ExposedPorts)) {
        const separatorIndex: number = key.indexOf('/');
        let portText: string;
        let protocol: string;
        if (separatorIndex === -1) {
            portText = key;
            protocol = 'tcp';
        } else {
            portText = key.substring(0, separatorIndex);
            protocol = key.substring(separatorIndex + 1);
        }

        const port: number = Number(portText);
        if (Number.isInteger(port) && port > 0) {
            ports.push({ port: port, protocol: protocol });
        }
    }
    return ports.sort((a, b) => a.port - b.port);
}
