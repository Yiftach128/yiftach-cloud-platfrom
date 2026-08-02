import { Alert, Table, Tag, Tooltip } from 'antd';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';

dayjs.extend(relativeTime);

import { DockerFetcherError } from '../fetchers/docker-fetcher-error.ts';
import type { Container, ContainerState, PortBinding } from '../fetchers/interfaces.ts';
import { formatPorts, formatTimestamp, stateTagColor } from './container-format.ts';
import type { ContainerListProps } from './interfaces.ts';

function formatCreatedAt(createdAt: string): string {
    return dayjs(createdAt).fromNow();
}

const columns: TableProps<Container>['columns'] = [
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

function ContainerList(props: ContainerListProps): ReactElement {
    const navigate = useNavigate();
    const [containers, setContainers] = useState<Container[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    useEffect(() => {
        let disposed: boolean = false;

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
    }, [props.fetcher]);

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
    return (
        <Table<Container>
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
