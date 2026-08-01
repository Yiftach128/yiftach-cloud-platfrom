import { Alert, Table, Tag, Tooltip } from 'antd';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

dayjs.extend(relativeTime);

import { DockerFetcherError } from '../fetchers/docker-fetcher-error.ts';
import type { Container, ContainerState, PortBinding } from '../fetchers/interfaces.ts';
import type { ContainerListProps } from './interfaces.ts';

function stateTagColor(state: ContainerState): string {
    switch (state) {
        case 'created':
            return 'blue';
        case 'restarting':
            return 'orange';
        case 'running':
            return 'green';
        case 'removing':
            return 'orange';
        case 'paused':
            return 'gold';
        case 'exited':
            return 'default';
        case 'dead':
            return 'red';
    }
}

function formatPorts(ports: PortBinding[]): string {
    return ports
        .map((port: PortBinding) => {
            if (port.publicPort !== undefined) {
                return `${port.publicPort}→${port.privatePort}/${port.type}`;
            }
            return `${port.privatePort}/${port.type}`;
        })
        .join(', ');
}

function formatCreatedAt(createdAt: string): string {
    return dayjs(createdAt).fromNow();
}

function formatExactCreatedAt(createdAt: string): string {
    return dayjs(createdAt).format('YYYY-MM-DD HH:mm:ss');
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
            <Tooltip title={formatExactCreatedAt(createdAt)}>{formatCreatedAt(createdAt)}</Tooltip>
        ),
    },
];

function ContainerList(props: ContainerListProps): ReactElement {
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
        />
    );
}

export default ContainerList;
