import { CloudOutlined, DesktopOutlined } from '@ant-design/icons';
import { Alert, Flex, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableColumnType, TableProps } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect, useState } from 'react';
import type { MouseEvent, ReactElement } from 'react';
import { useNavigate } from 'react-router';
import type { NavigateFunction } from 'react-router';

dayjs.extend(relativeTime);

import { DockerFetcherError } from '../fetchers/docker-fetcher-error.ts';
import type { DockerFetcherService } from '../fetchers/docker-fetcher-service.ts';
import type { Container, ContainerState, ContainerStatsMap, PortBinding } from '../fetchers/interfaces.ts';
import { useFetchedData } from '../hooks/use-fetched-data.ts';
import type { FetchedData } from '../hooks/interfaces.ts';
import { dedupePortBindings, formatCpuPercent, formatPorts, formatTimestamp, stateTagColor } from './container-format.ts';
import ContainerRowActions from './container-row-actions.tsx';
import { formatSizeBytes, shortImageId } from './image-format.ts';
import type { ContainerListProps } from './interfaces.ts';

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
/** Delay between successful stats polls. */
const STATS_POLL_INTERVAL_MS: number = 3000;
/** Delay before retrying after a failed stats poll. */
const STATS_POLL_ERROR_BACKOFF_MS: number = 10000;
/** Cell text for containers without a live sample — stopped, or not sampled yet. */
const NO_STATS_TEXT: string = '—';

function formatCreatedAt(createdAt: string): string {
    return dayjs(createdAt).fromNow();
}

/** True when the container carries the platform's managed label. */
function isManaged(container: Container): boolean {
    return container.labels[MANAGED_LABEL] === 'true';
}

/** "Origin" cell: containers created through the platform get the cloud badge, the rest the device badge. */
function renderOrigin(container: Container): ReactElement {
    if (isManaged(container)) {
        return (
            <Space size={4}>
                <CloudOutlined />
                YCP
            </Space>
        );
    }
    return (
        <Space size={4}>
            <DesktopOutlined />
            device
        </Space>
    );
}

/**
 * "Image" cell: for containers whose image was platform-built (see
 * BUILD_JOB_ID_LABEL), a link opening the image details page; plain text
 * otherwise. Stopping the click keeps the whole-row navigation to container
 * details from also firing.
 */
function renderImage(container: Container, navigate: NavigateFunction): ReactElement {
    if (container.labels[BUILD_JOB_ID_LABEL] === undefined) {
        return <>{container.image}</>;
    }

    function handleClick(event: MouseEvent<HTMLElement>): void {
        event.stopPropagation();
        /* The short id keeps the URL and breadcrumb readable; the daemon
           resolves it like any id prefix. */
        navigate(`/images/${encodeURIComponent(shortImageId(container.imageId))}`);
    }

    return <Typography.Link onClick={handleClick}>{container.image}</Typography.Link>;
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

/* Width-less columns (Name, and Image in buildColumns) share the table's
   remaining space under the fixed layout; the bounded columns hold their pixel
   widths. Image lives in buildColumns because its cell navigates, CPU and
   Memory in statsColumns because their cells read the live samples. */
const nameColumn: TableColumnType<Container> = { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true };

const stateColumns: NonNullable<TableProps<Container>['columns']> = [
    {
        title: 'Origin',
        key: 'origin',
        width: 100,
        render: (_value: unknown, record: Container) => renderOrigin(record),
    },
    {
        title: 'State',
        dataIndex: 'state',
        key: 'state',
        width: 110,
        render: (state: ContainerState) => <Tag color={stateTagColor(state)}>{state}</Tag>,
    },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 180 },
];

const trailingColumns: NonNullable<TableProps<Container>['columns']> = [
    {
        title: 'Ports',
        dataIndex: 'ports',
        key: 'ports',
        width: 150,
        render: (ports: PortBinding[]) => formatPorts(dedupePortBindings(ports)),
    },
    {
        title: 'Created',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 130,
        render: (createdAt: string) => (
            <Tooltip title={formatTimestamp(createdAt)}>{formatCreatedAt(createdAt)}</Tooltip>
        ),
    },
];

function statsColumns(stats: ContainerStatsMap): TableColumnType<Container>[] {
    return [
        {
            title: 'CPU',
            key: 'cpu',
            width: 80,
            render: (_value: unknown, record: Container) => renderCpu(record, stats),
        },
        {
            title: 'Memory',
            key: 'memory',
            width: 100,
            render: (_value: unknown, record: Container) => renderMemory(record, stats),
        },
    ];
}

function buildColumns(
    fetcher: DockerFetcherService,
    navigate: NavigateFunction,
    onMutated: () => void,
    stats: ContainerStatsMap,
): NonNullable<TableProps<Container>['columns']> {
    const imageColumn: TableColumnType<Container> = {
        title: 'Image',
        key: 'image',
        ellipsis: true,
        render: (_value: unknown, record: Container) => renderImage(record, navigate),
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
    return [nameColumn, imageColumn]
        .concat(stateColumns)
        .concat(statsColumns(stats))
        .concat(trailingColumns)
        .concat([actionsColumn]);
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

    /* The CPU/Memory cells are telemetry with their own lifecycle, so like the
       log panel they poll in a mount-scoped session instead of going through
       useFetchedData. A failed poll keeps the last samples on screen and just
       retries later — the dashes/values are decoration, never worth an alert. */
    const [stats, setStats] = useState<ContainerStatsMap>({});
    useEffect(() => {
        let disposed: boolean = false;
        let timer: number | undefined = undefined;

        async function poll(): Promise<void> {
            if (disposed) {
                return;
            }
            let delay: number = STATS_POLL_INTERVAL_MS;
            try {
                const fresh: ContainerStatsMap = await props.fetcher.getContainersStats();
                if (disposed) {
                    return;
                }
                setStats(fresh);
            } catch {
                delay = STATS_POLL_ERROR_BACKOFF_MS;
            }
            if (disposed) {
                return;
            }
            timer = window.setTimeout(poll, delay);
        }

        poll();

        return () => {
            disposed = true;
            if (timer !== undefined) {
                clearTimeout(timer);
            }
        };
    }, [props.fetcher]);

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
