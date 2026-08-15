import { Alert, Flex, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableColumnType, TableProps } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useState } from 'react';
import type { MouseEvent, ReactElement, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type { NavigateFunction } from 'react-router';

dayjs.extend(relativeTime);

import { DockerFetcherError } from '../fetchers/docker-fetcher-error.ts';
import type { DockerFetcherService } from '../fetchers/docker-fetcher-service.ts';
import type { Container, ContainerStatsMap } from '../fetchers/interfaces.ts';
import { useFetchedData } from '../hooks/use-fetched-data.ts';
import { useContainerStats } from '../hooks/use-container-stats.ts';
import type { FetchedData } from '../hooks/interfaces.ts';
import { NO_STATS_TEXT, dedupePortBindings, formatCpuPercent, formatPorts, formatTimestamp, stateTagColor } from './container-format.ts';
import ContainerRowActions from './container-row-actions.tsx';
import { formatSizeBytes, shortImageId } from './image-format.ts';
import type { ContainerListProps } from './interfaces.ts';
import { navigateOnPlainClick } from './link-click.ts';
import OriginBadge from './origin-badge.tsx';

/** Label stamped on every container the platform creates; the default view filters on it. */
const MANAGED_LABEL = 'cloudplatform.managed';

/**
 * Label the builder stamps on every image it builds. Containers inherit their
 * image's labels, so its presence marks the container's image as
 * platform-built — preset and registry images never carry it.
 */
const BUILD_JOB_ID_LABEL = 'cloudplatform.build-job-id';

/**
 * Delay between silent container-list re-fetches. Slow on purpose: actions
 * taken in the UI reload immediately via row actions, so this only catches
 * changes made outside the platform (docker CLI, a container exiting).
 */
const LIST_POLL_INTERVAL_MS: number = 15000;

function formatCreatedAt(createdAt: string): string {
    return dayjs(createdAt).fromNow();
}

/** True when the container carries the platform's managed label. */
function isManaged(container: Container): boolean {
    return container.labels[MANAGED_LABEL] === 'true';
}

/** "Origin" cell: containers created through the platform get the cloud badge, the rest the device badge. */
function renderOrigin(container: Container): ReactElement {
    return <OriginBadge managed={isManaged(container)} />;
}

/**
 * Wraps a cell's content in the row's anchor to the container details page,
 * stretched over the whole cell (.app-row-link swallows the cell padding), so
 * the entire row surface is one continuous link. Cells with their own
 * interactions (the platform-built image link, the action buttons) skip it.
 * Only the Name cell's link is tabbable, so keyboard users get one stop per
 * row instead of one per cell.
 */
function renderRowLinkCell(content: ReactNode, container: Container, tabbable: boolean): ReactElement {
    let tabIndex: number;
    if (tabbable) {
        tabIndex = 0;
    } else {
        tabIndex = -1;
    }

    /* Stopping propagation keeps a modified click (new tab) from also firing
       the whole-row onClick fallback in the current tab. */
    function handleClick(event: MouseEvent<HTMLElement>): void {
        event.stopPropagation();
    }

    return (
        <Link
            to={`/services/${encodeURIComponent(container.name)}`}
            className="app-row-link"
            tabIndex={tabIndex}
            draggable={false}
            onClick={handleClick}
        >
            {content}
        </Link>
    );
}

/**
 * "Image" cell: for containers whose image was platform-built (see
 * BUILD_JOB_ID_LABEL), a link opening the image details page; otherwise the
 * plain text joins the row link like any other cell. Stopping the click keeps
 * the whole-row navigation to container details from also firing.
 */
function renderImage(container: Container, navigate: NavigateFunction): ReactElement {
    if (container.labels[BUILD_JOB_ID_LABEL] === undefined) {
        return renderRowLinkCell(container.image, container, false);
    }

    /* The short id keeps the URL and breadcrumb readable; the daemon
       resolves it like any id prefix. */
    const path: string = `/images/${encodeURIComponent(shortImageId(container.imageId))}`;

    function handleClick(event: MouseEvent<HTMLElement>): void {
        event.stopPropagation();
        navigateOnPlainClick(event, navigate, path);
    }

    return <Typography.Link href={path} onClick={handleClick}>{container.image}</Typography.Link>;
}

/** "CPU" cell: live percentage where 100 is one full core; a dash without a sample. */
function renderCpu(container: Container, stats: ContainerStatsMap): string {
    const sample = stats[container.id];
    if (sample === undefined) {
        return NO_STATS_TEXT;
    }
    return formatCpuPercent(sample.cpuPercent);
}

/** "Memory" cell: live bytes in use, with the container's limit in the tooltip; a dash without a sample. */
function renderMemory(container: Container, stats: ContainerStatsMap): ReactElement {
    const sample = stats[container.id];
    if (sample === undefined) {
        return <>{NO_STATS_TEXT}</>;
    }
    const used: string = formatSizeBytes(sample.memoryUsedBytes);
    const limit: string = formatSizeBytes(sample.memoryLimitBytes);
    return <Tooltip title={`${used} of ${limit}`}>{used}</Tooltip>;
}

/* Width-less columns (Name, Image) share the table's remaining space under
   the fixed layout; the bounded columns hold their pixel widths. All data
   cells render through renderRowLinkCell, so the columns live here rather
   than at module level. */
function buildColumns(
    fetcher: DockerFetcherService,
    navigate: NavigateFunction,
    onMutated: () => void,
    stats: ContainerStatsMap,
): NonNullable<TableProps<Container>['columns']> {
    const nameColumn: TableColumnType<Container> = {
        title: 'Name',
        key: 'name',
        ellipsis: true,
        render: (_value: unknown, record: Container) => renderRowLinkCell(record.name, record, true),
    };
    const imageColumn: TableColumnType<Container> = {
        title: 'Image',
        key: 'image',
        ellipsis: true,
        render: (_value: unknown, record: Container) => renderImage(record, navigate),
    };
    const originColumn: TableColumnType<Container> = {
        title: 'Origin',
        key: 'origin',
        width: 100,
        render: (_value: unknown, record: Container) =>
            renderRowLinkCell(renderOrigin(record), record, false),
    };
    const stateColumn: TableColumnType<Container> = {
        title: 'State',
        key: 'state',
        width: 110,
        render: (_value: unknown, record: Container) =>
            renderRowLinkCell(<Tag color={stateTagColor(record.state)}>{record.state}</Tag>, record, false),
    };
    const statusColumn: TableColumnType<Container> = {
        title: 'Status',
        key: 'status',
        width: 180,
        render: (_value: unknown, record: Container) =>
            renderRowLinkCell(record.status, record, false),
    };
    const cpuColumn: TableColumnType<Container> = {
        title: 'CPU',
        key: 'cpu',
        width: 80,
        render: (_value: unknown, record: Container) =>
            renderRowLinkCell(renderCpu(record, stats), record, false),
    };
    const memoryColumn: TableColumnType<Container> = {
        title: 'Memory',
        key: 'memory',
        width: 100,
        render: (_value: unknown, record: Container) =>
            renderRowLinkCell(renderMemory(record, stats), record, false),
    };
    const portsColumn: TableColumnType<Container> = {
        title: 'Ports',
        key: 'ports',
        width: 150,
        render: (_value: unknown, record: Container) =>
            renderRowLinkCell(formatPorts(dedupePortBindings(record.ports)), record, false),
    };
    const createdColumn: TableColumnType<Container> = {
        title: 'Created',
        key: 'createdAt',
        width: 130,
        render: (_value: unknown, record: Container) =>
            renderRowLinkCell(
                <Tooltip title={formatTimestamp(record.createdAt)}>{formatCreatedAt(record.createdAt)}</Tooltip>,
                record,
                false,
            ),
    };
    const actionsColumn: TableColumnType<Container> = {
        title: '',
        key: 'actions',
        align: 'right',
        width: 120,
        render: (_value: unknown, record: Container) => (
            <ContainerRowActions
                fetcher={fetcher}
                containerName={record.name}
                state={record.state}
                onMutated={onMutated}
            />
        ),
    };
    return [
        nameColumn,
        imageColumn,
        originColumn,
        stateColumn,
        statusColumn,
        cpuColumn,
        memoryColumn,
        portsColumn,
        createdColumn,
        actionsColumn,
    ];
}

function describeLoadError(error: unknown): string {
    if (error instanceof DockerFetcherError) {
        return error.message;
    }
    return 'Unexpected error while loading containers';
}

function ContainerList(props: ContainerListProps): ReactElement {
    const navigate = useNavigate();
    const [showAll, setShowAll] = useState<boolean>(false);

    /* Re-fetches (reload after a row action, or the slow background poll) are
       silent per the hook contract — the existing rows stay rendered and the
       hovered row's toolbar does not flash away. */
    const fetched: FetchedData<Container[]> = useFetchedData<Container[]>({
        fetch: () => props.fetcher.getContainers(),
        describeError: describeLoadError,
        requestKey: 'containers',
        resetOnKeyChange: true,
        pollIntervalMs: LIST_POLL_INTERVAL_MS,
    });

    /* The CPU/Memory cells read the live samples — see the hook for the
       polling/backoff contract. */
    const stats: ContainerStatsMap = useContainerStats(props.fetcher);

    if (fetched.data === null && fetched.errorMessage !== null) {
        return (
            <Alert
                type="error"
                showIcon
                message="Failed to load containers"
                description={fetched.errorMessage}
            />
        );
    }

    let containers: Container[];
    if (fetched.data === null) {
        containers = [];
    } else {
        containers = fetched.data;
    }

    let refreshAlert: ReactElement | null;
    if (fetched.data !== null && fetched.errorMessage !== null) {
        refreshAlert = (
            <Alert
                type="error"
                showIcon
                message="Failed to refresh containers"
                description={fetched.errorMessage}
            />
        );
    } else {
        refreshAlert = null;
    }

    const columns: NonNullable<TableProps<Container>['columns']> = buildColumns(props.fetcher, navigate, fetched.reload, stats);

    let visibleContainers: Container[];
    if (showAll) {
        visibleContainers = containers;
    } else {
        visibleContainers = containers.filter(
            (container: Container) => isManaged(container),
        );
    }

    /* When the managed-only filter is what emptied the table, say so instead of
       showing the stock "No data" — an all-unmanaged daemon is not an error. */
    let tableLocale: TableProps<Container>['locale'];
    if (!showAll && containers.length > 0 && visibleContainers.length === 0) {
        tableLocale = {
            emptyText:
                'No platform-managed containers. Turn on "Show all containers on this device" to see everything on the daemon.',
        };
    } else {
        tableLocale = undefined;
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
            <Table<Container>
                className="app-hover-actions-table"
                tableLayout="fixed"
                columns={columns}
                dataSource={visibleContainers}
                rowKey="id"
                loading={fetched.isInitialLoading}
                pagination={false}
                locale={tableLocale}
                onRow={(record: Container) => ({
                    onClick: (): void => {
                        navigate(`/services/${encodeURIComponent(record.name)}`);
                    },
                    style: { cursor: 'pointer' },
                })}
            />
        </Flex>
    );
}

export default ContainerList;
