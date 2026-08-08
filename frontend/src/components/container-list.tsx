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
import type { Container, ContainerState, PortBinding } from '../fetchers/interfaces.ts';
import { formatPorts, formatTimestamp, stateTagColor } from './container-format.ts';
import ContainerRowActions from './container-row-actions.tsx';
import { shortImageId } from './image-format.ts';
import type { ContainerListProps } from './interfaces.ts';

/** Label stamped on every container the platform creates; the default view filters on it. */
const MANAGED_LABEL = 'cloudplatform.managed';

/**
 * Label the builder stamps on every image it builds. Containers inherit their
 * image's labels, so its presence marks the container's image as
 * platform-built — preset and registry images never carry it.
 */
const BUILD_JOB_ID_LABEL = 'cloudplatform.build-job-id';

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

/* Width-less columns (Name, and Image in buildColumns) share the table's
   remaining space under the fixed layout; the bounded columns hold their pixel
   widths. Image lives in buildColumns because its cell navigates. */
const nameColumn: TableColumnType<Container> = { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true };

const staticColumns: NonNullable<TableProps<Container>['columns']> = [
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
    {
        title: 'Ports',
        dataIndex: 'ports',
        key: 'ports',
        width: 150,
        render: (ports: PortBinding[]) => formatPorts(ports),
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

function buildColumns(
    fetcher: DockerFetcherService,
    navigate: NavigateFunction,
    onMutated: () => void,
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
    return [nameColumn, imageColumn].concat(staticColumns).concat([actionsColumn]);
}

function ContainerList(props: ContainerListProps): ReactElement {
    const navigate = useNavigate();
    const [containers, setContainers] = useState<Container[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [reloadCounter, setReloadCounter] = useState<number>(0);
    const [showAll, setShowAll] = useState<boolean>(false);

    useEffect(() => {
        let disposed: boolean = false;

        /* Re-fetches (reloadCounter bumps after a row action) are deliberately
           silent — no loading/containers reset — so the existing rows stay
           rendered and the hovered row's toolbar does not flash away. */
        props.fetcher.getContainers()
            .then((result: Container[]) => {
                if (!disposed) {
                    setContainers(result);
                    setIsLoading(false);
                }
            })
            .catch((error: unknown) => {
                if (!disposed) {
                    if (error instanceof DockerFetcherError) {
                        setErrorMessage(error.message);
                    } else {
                        setErrorMessage('Unexpected error while loading containers');
                    }
                    setIsLoading(false);
                }
            });

        return () => {
            disposed = true;
        };
    }, [props.fetcher, reloadCounter]);

    function handleMutated(): void {
        setReloadCounter((value: number) => value + 1);
    }

    if (errorMessage !== null) {
        return (
            <Alert
                type="error"
                showIcon
                message="Failed to load containers"
                description={errorMessage}
            />
        );
    }
    const columns: NonNullable<TableProps<Container>['columns']> = buildColumns(props.fetcher, navigate, handleMutated);

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
                loading={isLoading}
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
