import type { Edge, Node } from '@xyflow/react';

import type { Container, ContainerStats, ContainerStatsMap, ImageSummary } from '../fetchers/interfaces.ts';
import { dedupePortBindings, formatCpuPercent, formatPorts } from './container-format.ts';
import { normalizeGitHubUrl } from './git-url.ts';
import { formatSizeBytes, shortImageId } from './image-format.ts';
import type {
    GitHubUrlParts,
    OverviewContainerNodeData,
    OverviewImageNodeData,
    OverviewRepoNodeData,
} from './interfaces.ts';

/**
 * Assembles the overview topology (repo → image → container) out of the list
 * endpoints' data, positions included. Pure functions, no React: the component
 * memoizes the calls. Everything shaped by @xyflow/react lives here rather
 * than in interfaces.ts, per the house rule that third-party wire shapes stay
 * next to the implementation.
 */

export type OverviewRepoFlowNode = Node<OverviewRepoNodeData, 'repo'>;
export type OverviewImageFlowNode = Node<OverviewImageNodeData, 'image'>;
export type OverviewContainerFlowNode = Node<OverviewContainerNodeData, 'container'>;
export type OverviewFlowNode = OverviewRepoFlowNode | OverviewImageFlowNode | OverviewContainerFlowNode;

export interface OverviewGraphModel {
    nodes: OverviewFlowNode[];
    edges: Edge[];
}

/** Label stamped on every container the platform creates; the default view filters on it. */
const MANAGED_LABEL: string = 'cloudplatform.managed';

/**
 * Provenance label the builder service stamps on the images it builds
 * (mirrors builder-service-backend's build-worker.ts). Containers inherit
 * their image's labels, but the graph reads it off the image row directly.
 */
const REPO_URL_LABEL: string = 'cloudplatform.repo-url';

/*
 * Layout: three fixed columns (repo, image, container), positions computed by
 * stacking fixed-size blocks. Deterministic by construction — the same node
 * set always produces the same positions, so the 15s list re-poll and the 3s
 * stats overlay never move anything on screen.
 */
export const NODE_WIDTH_REPO: number = 240;
export const NODE_HEIGHT_REPO: number = 60;
export const NODE_WIDTH_IMAGE: number = 260;
export const NODE_HEIGHT_IMAGE: number = 60;
export const NODE_WIDTH_CONTAINER: number = 300;
export const NODE_HEIGHT_CONTAINER: number = 110;

const COLUMN_X_REPO: number = 0;
const COLUMN_X_IMAGE: number = COLUMN_X_REPO + NODE_WIDTH_REPO + 90;
const COLUMN_X_CONTAINER: number = COLUMN_X_IMAGE + NODE_WIDTH_IMAGE + 90;

/** Vertical space between stacked nodes/blocks. */
const ROW_GAP: number = 24;
/** Extra vertical space separating one repo's pipeline from the next. */
const GROUP_GAP: number = 40;

/** One image-column entry: the image node's payload plus its container rows. */
interface ImageEntry {
    imageId: string;
    data: OverviewImageNodeData;
    /** cloudplatform.repo-url of a platform-built image; null otherwise. */
    repoUrl: string | null;
    containers: Container[];
}

/** All images built from one repository, sharing a single repo node. */
interface RepoGroup {
    repoUrl: string;
    displayName: string;
    entries: ImageEntry[];
}

/** True when the container carries the platform's managed label. */
export function isManagedContainer(container: Container): boolean {
    return container.labels[MANAGED_LABEL] === 'true';
}

function repoNodeId(repoUrl: string): string {
    return `repo:${repoUrl}`;
}

function imageNodeId(imageId: string): string {
    return `image:${imageId}`;
}

function containerNodeId(containerId: string): string {
    return `container:${containerId}`;
}

/** Square-cornered grey step edge; ids are stable because each target has exactly one source. */
function makeEdge(sourceId: string, targetId: string): Edge {
    return {
        id: `e:${sourceId}->${targetId}`,
        source: sourceId,
        target: targetId,
        type: 'step',
        style: { stroke: '#bfbfbf', strokeWidth: 1.5 },
    };
}

function toManagedEntry(image: ImageSummary): ImageEntry {
    let reference: string;
    const firstTag: string | undefined = image.tags[0];
    if (firstTag !== undefined) {
        reference = firstTag;
    } else {
        reference = shortImageId(image.id);
    }
    let repoUrl: string | null;
    const repoLabel: string | undefined = image.labels[REPO_URL_LABEL];
    if (repoLabel !== undefined) {
        repoUrl = repoLabel;
    } else {
        repoUrl = null;
    }
    return {
        imageId: image.id,
        data: {
            imageId: image.id,
            reference: reference,
            sizeText: formatSizeBytes(image.sizeBytes),
            managed: true,
        },
        repoUrl: repoUrl,
        containers: [],
    };
}

/**
 * Image node for a container whose image is not in the managed list (a preset
 * or a free-typed registry reference) — synthesized from the container row,
 * so there is no size and no provenance.
 */
function toSynthesizedEntry(container: Container): ImageEntry {
    return {
        imageId: container.imageId,
        data: {
            imageId: container.imageId,
            reference: container.image,
            sizeText: null,
            managed: false,
        },
        repoUrl: null,
        containers: [],
    };
}

function repoDisplayName(repoUrl: string): string {
    const parts: GitHubUrlParts | null = normalizeGitHubUrl(repoUrl);
    if (parts === null) {
        return repoUrl;
    }
    return `${parts.owner}/${parts.repo}`;
}

function byReference(a: ImageEntry, b: ImageEntry): number {
    return a.data.reference.localeCompare(b.data.reference);
}

function toContainerNode(container: Container, y: number): OverviewContainerFlowNode {
    return {
        id: containerNodeId(container.id),
        type: 'container',
        position: { x: COLUMN_X_CONTAINER, y: y },
        width: NODE_WIDTH_CONTAINER,
        height: NODE_HEIGHT_CONTAINER,
        data: {
            containerId: container.id,
            containerName: container.name,
            state: container.state,
            managed: isManagedContainer(container),
            portsText: formatPorts(dedupePortBindings(container.ports)),
            cpuText: null,
            memoryText: null,
        },
    };
}

/**
 * Emits one image block — the image node vertically centered beside its
 * container stack — starting at startY, and returns the block's height.
 */
function layoutImageBlock(entry: ImageEntry, startY: number, nodes: OverviewFlowNode[], edges: Edge[]): number {
    const containerCount: number = entry.containers.length;
    let stackHeight: number = 0;
    if (containerCount > 0) {
        stackHeight = containerCount * NODE_HEIGHT_CONTAINER + (containerCount - 1) * ROW_GAP;
    }
    const blockHeight: number = Math.max(NODE_HEIGHT_IMAGE, stackHeight);

    nodes.push({
        id: imageNodeId(entry.imageId),
        type: 'image',
        position: { x: COLUMN_X_IMAGE, y: startY + (blockHeight - NODE_HEIGHT_IMAGE) / 2 },
        width: NODE_WIDTH_IMAGE,
        height: NODE_HEIGHT_IMAGE,
        data: entry.data,
    });

    let containerY: number = startY + (blockHeight - stackHeight) / 2;
    for (const container of entry.containers) {
        nodes.push(toContainerNode(container, containerY));
        edges.push(makeEdge(imageNodeId(entry.imageId), containerNodeId(container.id)));
        containerY = containerY + NODE_HEIGHT_CONTAINER + ROW_GAP;
    }

    return blockHeight;
}

/**
 * Emits one repository pipeline — the repo node vertically centered beside
 * its stacked image blocks — starting at startY, and returns the group's height.
 */
function layoutRepoGroup(group: RepoGroup, startY: number, nodes: OverviewFlowNode[], edges: Edge[]): number {
    let blockY: number = startY;
    for (const entry of group.entries) {
        const blockHeight: number = layoutImageBlock(entry, blockY, nodes, edges);
        edges.push(makeEdge(repoNodeId(group.repoUrl), imageNodeId(entry.imageId)));
        blockY = blockY + blockHeight + ROW_GAP;
    }
    const groupHeight: number = blockY - ROW_GAP - startY;

    nodes.push({
        id: repoNodeId(group.repoUrl),
        type: 'repo',
        position: { x: COLUMN_X_REPO, y: startY + (groupHeight - NODE_HEIGHT_REPO) / 2 },
        width: NODE_WIDTH_REPO,
        height: NODE_HEIGHT_REPO,
        data: { repoUrl: group.repoUrl, displayName: group.displayName },
    });

    return groupHeight;
}

/**
 * Builds the stats-less graph: node ids, payloads (cpuText/memoryText null),
 * positions, and edges. Node ids depend only on stable identifiers and the
 * ordering only on names, so re-polls reproduce identical output for an
 * unchanged daemon. Managed images are always shown, containers or not; the
 * caller pre-filters the container list for the managed-only view.
 */
export function buildOverviewGraph(containers: Container[], images: ImageSummary[]): OverviewGraphModel {
    const entriesByImageId: Map<string, ImageEntry> = new Map();
    for (const image of images) {
        entriesByImageId.set(image.id, toManagedEntry(image));
    }
    for (const container of containers) {
        let entry: ImageEntry | undefined = entriesByImageId.get(container.imageId);
        if (entry === undefined) {
            entry = toSynthesizedEntry(container);
            entriesByImageId.set(container.imageId, entry);
        }
        entry.containers.push(container);
    }

    const groupsByUrl: Map<string, RepoGroup> = new Map();
    const orphanEntries: ImageEntry[] = [];
    const synthesizedEntries: ImageEntry[] = [];
    for (const entry of entriesByImageId.values()) {
        entry.containers.sort((a: Container, b: Container) => a.name.localeCompare(b.name));
        if (entry.repoUrl !== null) {
            let group: RepoGroup | undefined = groupsByUrl.get(entry.repoUrl);
            if (group === undefined) {
                group = {
                    repoUrl: entry.repoUrl,
                    displayName: repoDisplayName(entry.repoUrl),
                    entries: [],
                };
                groupsByUrl.set(entry.repoUrl, group);
            }
            group.entries.push(entry);
        } else if (entry.data.managed) {
            orphanEntries.push(entry);
        } else {
            synthesizedEntries.push(entry);
        }
    }

    const groups: RepoGroup[] = Array.from(groupsByUrl.values());
    groups.sort((a: RepoGroup, b: RepoGroup) => a.displayName.localeCompare(b.displayName));
    for (const group of groups) {
        group.entries.sort(byReference);
    }
    orphanEntries.sort(byReference);
    synthesizedEntries.sort(byReference);

    const nodes: OverviewFlowNode[] = [];
    const edges: Edge[] = [];
    let yCursor: number = 0;
    for (const group of groups) {
        const groupHeight: number = layoutRepoGroup(group, yCursor, nodes, edges);
        yCursor = yCursor + groupHeight + GROUP_GAP;
    }
    for (const entry of orphanEntries.concat(synthesizedEntries)) {
        const blockHeight: number = layoutImageBlock(entry, yCursor, nodes, edges);
        yCursor = yCursor + blockHeight + ROW_GAP;
    }

    return { nodes: nodes, edges: edges };
}

/**
 * Overlays live samples onto the container nodes' payloads. Repo/image nodes,
 * the edges array, and untouched container nodes pass through by reference,
 * so the memoized node components skip re-rendering on every stats tick.
 * Positions are never touched.
 */
export function applyStats(model: OverviewGraphModel, stats: ContainerStatsMap): OverviewGraphModel {
    const nodes: OverviewFlowNode[] = model.nodes.map((node: OverviewFlowNode): OverviewFlowNode => {
        if (node.type !== 'container') {
            return node;
        }
        const sample: ContainerStats | undefined = stats[node.data.containerId];
        let cpuText: string | null;
        let memoryText: string | null;
        if (sample === undefined) {
            cpuText = null;
            memoryText = null;
        } else {
            cpuText = formatCpuPercent(sample.cpuPercent);
            memoryText = formatSizeBytes(sample.memoryUsedBytes);
        }
        if (cpuText === node.data.cpuText && memoryText === node.data.memoryText) {
            return node;
        }
        return {
            ...node,
            data: {
                ...node.data,
                cpuText: cpuText,
                memoryText: memoryText,
            },
        };
    });
    return { nodes: nodes, edges: model.edges };
}
