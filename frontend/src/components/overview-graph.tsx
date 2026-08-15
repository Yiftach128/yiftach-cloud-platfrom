import { Background, BackgroundVariant, Controls, ReactFlow } from '@xyflow/react';
import type { Edge, FitViewOptions, NodeTypes, ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Alert, Empty, Flex, Skeleton, Switch, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import type { Container, ContainerStatsMap, ImageSummary } from '../fetchers/interfaces.ts';
import type { FetchedData } from '../hooks/interfaces.ts';
import { useContainerStats } from '../hooks/use-container-stats.ts';
import { useFetchedData } from '../hooks/use-fetched-data.ts';
import { toErrorText } from './container-format.ts';
import type { OverviewGraphProps } from './interfaces.ts';
import OverviewContainerNode from './overview-container-node.tsx';
import { applyStats, buildOverviewGraph, isManagedContainer } from './overview-graph-builder.ts';
import type { OverviewFlowNode, OverviewGraphModel } from './overview-graph-builder.ts';
import OverviewImageNode from './overview-image-node.tsx';
import OverviewRepoNode from './overview-repo-node.tsx';

/**
 * Delay between silent re-fetches of the containers and images lists
 * (matches the services table's cadence).
 */
const LIST_POLL_INTERVAL_MS: number = 15000;

/** Registered once at module scope — a new identity every render would remount every node. */
const nodeTypes: NodeTypes = {
    repo: OverviewRepoNode,
    image: OverviewImageNode,
    container: OverviewContainerNode,
};

/** Shared by the initial fitView prop and the explicit re-frame on filter toggles. */
const FIT_VIEW_OPTIONS: FitViewOptions<OverviewFlowNode> = {
    padding: 0.15,
    maxZoom: 1,
};

function OverviewGraph(props: OverviewGraphProps): ReactElement {
    const [showAll, setShowAll] = useState<boolean>(false);

    const fetchedContainers: FetchedData<Container[]> = useFetchedData<Container[]>({
        fetch: () => props.fetcher.getContainers(),
        describeError: toErrorText,
        requestKey: 'overview-containers',
        resetOnKeyChange: true,
        pollIntervalMs: LIST_POLL_INTERVAL_MS,
    });

    const fetchedImages: FetchedData<ImageSummary[]> = useFetchedData<ImageSummary[]>({
        fetch: () => props.fetcher.getImages(),
        describeError: toErrorText,
        requestKey: 'overview-images',
        resetOnKeyChange: true,
        pollIntervalMs: LIST_POLL_INTERVAL_MS,
    });

    /* The CPU/memory lines read the live samples — see the hook for the
       polling/backoff contract. */
    const stats: ContainerStatsMap = useContainerStats(props.fetcher);

    const visibleContainers: Container[] = useMemo(() => {
        if (fetchedContainers.data === null) {
            return [];
        }
        if (showAll) {
            return fetchedContainers.data;
        }
        return fetchedContainers.data.filter((container: Container) => isManagedContainer(container));
    }, [fetchedContainers.data, showAll]);

    const images: ImageSummary[] = useMemo(() => {
        if (fetchedImages.data === null) {
            return [];
        }
        return fetchedImages.data;
    }, [fetchedImages.data]);

    /* Structure (ids, positions, edges) changes only with the 15s lists; the
       3s stats overlay swaps container-node data without touching positions,
       so nothing ever jumps and the pan/zoom viewport is never reset. */
    const structure: OverviewGraphModel = useMemo(
        () => buildOverviewGraph(visibleContainers, images),
        [visibleContainers, images],
    );
    const model: OverviewGraphModel = useMemo(() => applyStats(structure, stats), [structure, stats]);

    /* The fitView prop only frames the first render; toggling the filter
       changes the node set enough to warrant an explicit re-frame. */
    const flowInstanceRef = useRef<ReactFlowInstance<OverviewFlowNode, Edge> | null>(null);
    useEffect(() => {
        const instance: ReactFlowInstance<OverviewFlowNode, Edge> | null = flowInstanceRef.current;
        if (instance !== null) {
            instance.fitView(FIT_VIEW_OPTIONS);
        }
    }, [showAll]);

    let initialErrorText: string | null;
    if (fetchedContainers.data === null && fetchedContainers.errorMessage !== null) {
        initialErrorText = fetchedContainers.errorMessage;
    } else if (fetchedImages.data === null && fetchedImages.errorMessage !== null) {
        initialErrorText = fetchedImages.errorMessage;
    } else {
        initialErrorText = null;
    }
    if (initialErrorText !== null) {
        return (
            <Alert
                type="error"
                showIcon
                message="Failed to load the overview"
                description={initialErrorText}
            />
        );
    }

    if (fetchedContainers.data === null || fetchedImages.data === null) {
        return <Skeleton active />;
    }

    /* Both lists are loaded past this point, so any remaining errorMessage is
       a failed silent re-fetch — surfaced inline above the kept canvas. */
    let refreshErrorText: string | null;
    if (fetchedContainers.errorMessage !== null) {
        refreshErrorText = fetchedContainers.errorMessage;
    } else if (fetchedImages.errorMessage !== null) {
        refreshErrorText = fetchedImages.errorMessage;
    } else {
        refreshErrorText = null;
    }
    let refreshAlert: ReactElement | null;
    if (refreshErrorText !== null) {
        refreshAlert = (
            <Alert
                type="error"
                showIcon
                message="Failed to refresh the overview"
                description={refreshErrorText}
            />
        );
    } else {
        refreshAlert = null;
    }

    let canvas: ReactElement;
    if (model.nodes.length === 0) {
        /* When the managed-only filter is what emptied the graph, say so
           instead of the stock "No data" — an all-unmanaged daemon is not an
           error. */
        let emptyDescription: string;
        if (!showAll && fetchedContainers.data.length > 0) {
            emptyDescription =
                'No platform-managed containers. Turn on "Show all containers on this device" to see everything on the daemon.';
        } else {
            emptyDescription = 'Nothing to show yet — create a service from the New Service page.';
        }
        canvas = (
            <Flex align="center" justify="center" style={{ height: '100%' }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyDescription} />
            </Flex>
        );
    } else {
        canvas = (
            <ReactFlow<OverviewFlowNode>
                nodes={model.nodes}
                edges={model.edges}
                nodeTypes={nodeTypes}
                nodesDraggable={false}
                nodesConnectable={false}
                nodesFocusable={false}
                edgesFocusable={false}
                elementsSelectable={false}
                minZoom={0.4}
                maxZoom={1.5}
                fitView
                fitViewOptions={FIT_VIEW_OPTIONS}
                /* Attribution may be hidden for personal/non-commercial use per xyflow's policy. */
                proOptions={{ hideAttribution: true }}
                onInit={(instance: ReactFlowInstance<OverviewFlowNode, Edge>) => {
                    flowInstanceRef.current = instance;
                }}
                /* Navigation lives in the node cards' own anchors, but xyflow
                   strips pointer events from nodes with no interaction props
                   (not selectable, not draggable, no node handlers) — the
                   no-op handler keeps the nodes clickable at all. */
                onNodeClick={() => {}}
            >
                {/* One grey step darker than on-white dots would be — #d9d9d9 vanishes on the #f5f5f5 surface. */}
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#bfbfbf" />
                <Controls showInteractive={false} />
            </ReactFlow>
        );
    }

    return (
        <Flex vertical gap={12}>
            {refreshAlert}
            <Flex justify="flex-start" align="center" gap={8}>
                <Typography.Text>Show all containers on this device</Typography.Text>
                <Switch
                    checked={showAll}
                    onChange={(checked: boolean) => setShowAll(checked)}
                />
            </Flex>
            {/* ReactFlow needs an explicit-height parent. Budget: 100vh − 56
               header − 1 divider − 24+24 content padding − 22 toolbar row −
               12 flex gap = 139px (a transient refresh alert is not budgeted,
               like on the container details page). */}
            <div style={{ height: 'calc(100vh - 139px)', background: '#f5f5f5', border: '1px solid #d9d9d9' }}>
                {canvas}
            </div>
        </Flex>
    );
}

export default OverviewGraph;
