/**
 * Maps the Docker daemon's raw image wire shapes onto the platform's
 * `ImageSummary` type. The raw shapes live here, next to the mapping, so
 * `interfaces.ts` never depends on dockerode and the rest of the platform only
 * ever sees the public types.
 */

import type { ImageSummary } from './interfaces.ts';

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
 * Defensive view of the inspect endpoint's label location
 * (`Dockerode.ImageInspectInfo.Config.Labels`).
 */
export interface RawImageDetails {
    Config?: {
        Labels?: Record<string, string> | null;
    } | null;
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
