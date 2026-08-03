import { Alert, Table, Tag, Tooltip } from 'antd';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';

dayjs.extend(relativeTime);

import { DockerFetcherError } from '../fetchers/docker-fetcher-error.ts';
import type { DockerFetcherService } from '../fetchers/docker-fetcher-service.ts';
import type { Container, ContainerState, PortBinding } from '../fetchers/interfaces.ts';
import { formatPorts, formatTimestamp, stateTagColor } from './container-format.ts';
import ContainerRowActions from './container-row-actions.tsx';
import type { ContainerListProps } from './interfaces.ts';

function formatCreatedAt(createdAt: string): string {
    return dayjs(createdAt).fromNow();
}

const staticColumns: NonNullable<TableProps<Container>['columns']> = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Image', dataIndex: 'image', key: 'image' },
    {
        title: 'State',
        dataIndex: 'state',
        key: 'state',
        render: (state: ContainerState) => <Tag color={stateTagColor(state)}>{state}</Tag>,
    },
    { title: 'Status', dataIndex: 'status', key: 'status' },
    {
        title: 'Ports',
        dataIndex: 'ports',
        key: 'ports',
        render: (ports: PortBinding[]) => formatPorts(ports),
    },
    {
        title: 'Created',
        dataIndex: 'createdAt',
        key: 'createdAt',
        render: (createdAt: string) => (
            <Tooltip title={formatTimestamp(createdAt)}>{formatCreatedAt(createdAt)}</Tooltip>
        ),
    },
];

function buildColumns(fetcher: DockerFetcherService, onMutated: () => void): NonNullable<TableProps<Container>['columns']> {
    return staticColumns.concat([
        {
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
        },
    ]);
}

function ContainerList(props: ContainerListProps): ReactElement {
    const navigate = useNavigate();
    const [containers, setContainers] = useState<Container[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [reloadCounter, setReloadCounter] = useState<number>(0);

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
    const columns: NonNullable<TableProps<Container>['columns']> = buildColumns(props.fetcher, handleMutated);
    return (
        <Table<Container>
            className="app-container-table"
            columns={columns}
            dataSource={containers}
            rowKey="id"
            loading={isLoading}
            pagination={false}
            onRow={(record: Container) => ({
                onClick: (): void => {
                    navigate(`/services/${encodeURIComponent(record.name)}`);
                },
                style: { cursor: 'pointer' },
            })}
        />
    );
}

export default ContainerList;
