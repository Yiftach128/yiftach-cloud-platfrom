import { Alert, Descriptions, Divider, Flex, Skeleton, Splitter, Table, Tag, Tooltip, Typography } from 'antd';
import type { DescriptionsProps, TableProps } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useState } from 'react';
import type { ReactElement } from 'react';

dayjs.extend(relativeTime);

import { DockerFetcherError } from '../fetchers/docker-fetcher-error.ts';
import type {
    ContainerConfigDetails,
    ContainerDetails as ContainerDetailsData,
    ContainerHealth,
    ContainerHealthProbe,
    ContainerHealthStatus,
    ContainerHostConfigDetails,
    ContainerMount,
    ContainerStateDetails,
    ContainerStats,
    ContainerStatsMap,
    NetworkAttachment,
    PortBinding,
} from '../fetchers/interfaces.ts';
import { useContainerStats } from '../hooks/use-container-stats.ts';
import { useFetchedData } from '../hooks/use-fetched-data.ts';
import type { FetchedData } from '../hooks/interfaces.ts';
import ContainerControls from './container-controls.tsx';
import ContainerLogsPanel from './container-logs-panel.tsx';
import { NO_STATS_TEXT, formatCpuPercent, formatTimestamp, stateTagColor } from './container-format.ts';
import { formatSizeBytes } from './image-format.ts';
import type { ContainerDetailsProps } from './interfaces.ts';

function formatRelative(iso: string): string {
    return dayjs(iso).fromNow();
}

function formatBoolean(value: boolean): string {
    if (value) {
        return 'Yes';
    }
    return 'No';
}

function healthTagColor(status: ContainerHealthStatus): string {
    switch (status) {
        case 'starting':
            return 'blue';
        case 'healthy':
            return 'green';
        case 'unhealthy':
            return 'red';
        case 'none':
            return 'default';
    }
}

function formatMemoryLimit(bytes: number): string {
    if (bytes === 0) {
        return 'unlimited';
    }
    const mebibytes: number = Math.round(bytes / (1024 * 1024));
    return `${mebibytes} MiB`;
}

function formatCpuLimit(nanoCpus: number): string {
    if (nanoCpus === 0) {
        return 'unlimited';
    }
    return `${nanoCpus / 1_000_000_000} CPUs`;
}

function multiline(lines: string[]): ReactElement {
    return <span style={{ whiteSpace: 'pre-line' }}>{lines.join('\n')}</span>;
}

function buildOverviewItems(details: ContainerDetailsData): NonNullable<DescriptionsProps['items']> {
    let command: string;
    if (details.args.length > 0) {
        command = `${details.path} ${details.args.join(' ')}`;
    } else {
        command = details.path;
    }
    return [
        { key: 'name', label: 'Name', children: details.name },
        { key: 'id', label: 'ID', children: details.id.substring(0, 12) },
        { key: 'image', label: 'Image', children: details.image },
        { key: 'imageId', label: 'Image ID', children: details.imageId },
        {
            key: 'createdAt',
            label: 'Created',
            children: <Tooltip title={formatRelative(details.createdAt)}>{formatTimestamp(details.createdAt)}</Tooltip>,
        },
        { key: 'platform', label: 'Platform', children: details.platform },
        { key: 'driver', label: 'Storage driver', children: details.driver },
        { key: 'restartCount', label: 'Restart count', children: String(details.restartCount) },
        { key: 'command', label: 'Command', children: command },
        { key: 'logPath', label: 'Log path', children: details.logPath },
    ];
}

function buildStateItems(state: ContainerStateDetails): NonNullable<DescriptionsProps['items']> {
    const items: NonNullable<DescriptionsProps['items']> = [
        { key: 'status', label: 'Status', children: <Tag color={stateTagColor(state.status)}>{state.status}</Tag> },
        { key: 'running', label: 'Running', children: formatBoolean(state.running) },
        { key: 'paused', label: 'Paused', children: formatBoolean(state.paused) },
        { key: 'restarting', label: 'Restarting', children: formatBoolean(state.restarting) },
        { key: 'oomKilled', label: 'OOM killed', children: formatBoolean(state.oomKilled) },
        { key: 'dead', label: 'Dead', children: formatBoolean(state.dead) },
        { key: 'pid', label: 'PID', children: String(state.pid) },
        { key: 'exitCode', label: 'Exit code', children: String(state.exitCode) },
    ];
    if (state.startedAt !== undefined) {
        items.push({ key: 'startedAt', label: 'Started', children: formatTimestamp(state.startedAt) });
    }
    if (state.finishedAt !== undefined) {
        items.push({ key: 'finishedAt', label: 'Finished', children: formatTimestamp(state.finishedAt) });
    }
    if (state.error !== '') {
        items.push({ key: 'error', label: 'Error', children: state.error });
    }
    return items;
}

/** "Resources" block: the live sample, or dashes while there is none — stopped, or not sampled yet. */
function buildStatsItems(sample: ContainerStats | undefined): NonNullable<DescriptionsProps['items']> {
    let cpuText: string;
    let memoryText: string;
    if (sample === undefined) {
        cpuText = NO_STATS_TEXT;
        memoryText = NO_STATS_TEXT;
    } else {
        cpuText = formatCpuPercent(sample.cpuPercent);
        const used: string = formatSizeBytes(sample.memoryUsedBytes);
        const limit: string = formatSizeBytes(sample.memoryLimitBytes);
        memoryText = `${used} of ${limit}`;
    }
    return [
        { key: 'cpu', label: 'CPU', children: cpuText },
        { key: 'memory', label: 'Memory', children: memoryText },
    ];
}

function buildHealthItems(health: ContainerHealth): NonNullable<DescriptionsProps['items']> {
    const items: NonNullable<DescriptionsProps['items']> = [
        { key: 'status', label: 'Status', children: <Tag color={healthTagColor(health.status)}>{health.status}</Tag> },
        { key: 'failingStreak', label: 'Failing streak', children: String(health.failingStreak) },
    ];
    const lastProbe: ContainerHealthProbe | undefined = health.log[health.log.length - 1];
    if (lastProbe !== undefined) {
        items.push({
            key: 'lastProbe',
            label: 'Last probe',
            children: `${formatTimestamp(lastProbe.finishedAt)} — exit ${lastProbe.exitCode}`,
        });
        if (lastProbe.output !== '') {
            items.push({ key: 'lastProbeOutput', label: 'Last probe output', children: multiline([lastProbe.output]) });
        }
    }
    return items;
}

function buildConfigItems(config: ContainerConfigDetails): NonNullable<DescriptionsProps['items']> {
    let user: string;
    if (config.user !== '') {
        user = config.user;
    } else {
        user = 'image default';
    }
    const labelLines: string[] = Object.entries(config.labels)
        .map((entry: [string, string]) => `${entry[0]}=${entry[1]}`);
    return [
        { key: 'hostname', label: 'Hostname', children: config.hostname },
        { key: 'domainname', label: 'Domain name', children: config.domainname },
        { key: 'user', label: 'User', children: user },
        { key: 'workingDir', label: 'Working dir', children: config.workingDir },
        { key: 'tty', label: 'TTY', children: formatBoolean(config.tty) },
        { key: 'entrypoint', label: 'Entrypoint', children: config.entrypoint.join(' ') },
        { key: 'cmd', label: 'Cmd', children: config.cmd.join(' ') },
        { key: 'exposedPorts', label: 'Exposed ports', children: config.exposedPorts.join(', ') },
        { key: 'env', label: 'Environment', children: multiline(config.env) },
        { key: 'labels', label: 'Labels', children: multiline(labelLines) },
    ];
}

function buildHostConfigItems(hostConfig: ContainerHostConfigDetails): NonNullable<DescriptionsProps['items']> {
    let restartPolicy: string;
    if (hostConfig.restartPolicy.name === '') {
        restartPolicy = 'no';
    } else if (hostConfig.restartPolicy.name === 'on-failure') {
        restartPolicy = `on-failure (max ${hostConfig.restartPolicy.maximumRetryCount})`;
    } else {
        restartPolicy = hostConfig.restartPolicy.name;
    }
    return [
        { key: 'networkMode', label: 'Network mode', children: hostConfig.networkMode },
        { key: 'restartPolicy', label: 'Restart policy', children: restartPolicy },
        { key: 'autoRemove', label: 'Auto remove', children: formatBoolean(hostConfig.autoRemove) },
        { key: 'privileged', label: 'Privileged', children: formatBoolean(hostConfig.privileged) },
        { key: 'readonlyRootfs', label: 'Read-only rootfs', children: formatBoolean(hostConfig.readonlyRootfs) },
        { key: 'publishAllPorts', label: 'Publish all ports', children: formatBoolean(hostConfig.publishAllPorts) },
        { key: 'binds', label: 'Binds', children: multiline(hostConfig.binds) },
        { key: 'logDriver', label: 'Log driver', children: hostConfig.logConfig.type },
        { key: 'memory', label: 'Memory limit', children: formatMemoryLimit(hostConfig.memory) },
        { key: 'nanoCpus', label: 'CPU limit', children: formatCpuLimit(hostConfig.nanoCpus) },
    ];
}

function portRowKey(port: PortBinding): string {
    let publicPart: string;
    if (port.publicPort !== undefined) {
        publicPart = String(port.publicPort);
    } else {
        publicPart = 'none';
    }
    let ipPart: string;
    if (port.ip !== undefined) {
        ipPart = port.ip;
    } else {
        ipPart = 'any';
    }
    return `${ipPart}:${publicPart}:${port.privatePort}/${port.type}`;
}

const portColumns: TableProps<PortBinding>['columns'] = [
    { title: 'Private port', dataIndex: 'privatePort', key: 'privatePort' },
    {
        title: 'Public port',
        dataIndex: 'publicPort',
        key: 'publicPort',
        render: (publicPort: number | undefined) => {
            if (publicPort !== undefined) {
                return String(publicPort);
            }
            return '';
        },
    },
    { title: 'Type', dataIndex: 'type', key: 'type' },
    {
        title: 'Host IP',
        dataIndex: 'ip',
        key: 'ip',
        render: (ip: string | undefined) => {
            if (ip !== undefined) {
                return ip;
            }
            return '';
        },
    },
];

const mountColumns: TableProps<ContainerMount>['columns'] = [
    { title: 'Type', dataIndex: 'type', key: 'type' },
    { title: 'Source', dataIndex: 'source', key: 'source' },
    { title: 'Destination', dataIndex: 'destination', key: 'destination' },
    { title: 'Mode', dataIndex: 'mode', key: 'mode' },
    {
        title: 'Read-write',
        dataIndex: 'readWrite',
        key: 'readWrite',
        render: (readWrite: boolean) => formatBoolean(readWrite),
    },
];

const networkColumns: TableProps<NetworkAttachment>['columns'] = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'IP address', dataIndex: 'ipAddress', key: 'ipAddress' },
    { title: 'Gateway', dataIndex: 'gateway', key: 'gateway' },
    { title: 'MAC address', dataIndex: 'macAddress', key: 'macAddress' },
    {
        title: 'Aliases',
        dataIndex: 'aliases',
        key: 'aliases',
        render: (aliases: string[]) => aliases.join(', '),
    },
];

function ContainerDetails(props: ContainerDetailsProps): ReactElement {
    const [logsOpen, setLogsOpen] = useState<boolean>(true);

    function describeLoadError(error: unknown): string {
        if (error instanceof DockerFetcherError) {
            if (error.status === 404) {
                return `No container named "${props.containerName}" was found.`;
            }
            return error.message;
        }
        return 'Unexpected error while loading container details';
    }

    /* The component stays mounted when only :containerName changes; the key
       reset drops the old container's data so the new one starts from a
       skeleton. Same-name re-fetches (toolbar actions via reload) are silent —
       the toolbar and the logs panel stay mounted, so the tail session
       survives Start/Stop/Restart/Clear-Logs. */
    const fetched: FetchedData<ContainerDetailsData> = useFetchedData<ContainerDetailsData>({
        fetch: () => props.fetcher.getContainer(props.containerName),
        describeError: describeLoadError,
        requestKey: props.containerName,
        resetOnKeyChange: true,
    });

    /* Always polling, even while the container is stopped or details are still
       loading: Start on this page's toolbar must surface samples within one
       3s tick, and the batch call is cheap. */
    const stats: ContainerStatsMap = useContainerStats(props.fetcher);

    function handleToggleLogs(): void {
        setLogsOpen((value: boolean) => !value);
    }

    if (fetched.data === null && fetched.errorMessage !== null) {
        return (
            <Alert
                type="error"
                showIcon
                message="Failed to load container"
                description={fetched.errorMessage}
            />
        );
    }
    if (fetched.data === null) {
        return <Skeleton active paragraph={{ rows: 8 }} />;
    }
    const details: ContainerDetailsData = fetched.data;
    /* details.id is the full container id — the stats map's key (the Overview
       block only truncates it for display). */
    const sample: ContainerStats | undefined = stats[details.id];

    let refreshAlert: ReactElement | null;
    if (fetched.errorMessage !== null) {
        refreshAlert = (
            <Alert
                type="error"
                showIcon
                message="Failed to refresh container"
                description={fetched.errorMessage}
            />
        );
    } else {
        refreshAlert = null;
    }

    let healthSection: ReactElement | null = null;
    if (details.state.health !== undefined) {
        const health: ContainerHealth = details.state.health;
        healthSection = <Descriptions title="Health" bordered size="small" column={2} items={buildHealthItems(health)} />;
    }

    const detailSections: ReactElement = (
        <Flex vertical gap={24}>
            <Descriptions title="Overview" bordered size="small" column={2} items={buildOverviewItems(details)} />
            <Descriptions title="State" bordered size="small" column={2} items={buildStateItems(details.state)} />
            <Descriptions title="Resources" bordered size="small" column={2} items={buildStatsItems(sample)} />
            {healthSection}
            <Descriptions title="Config" bordered size="small" column={2} items={buildConfigItems(details.config)} />
            <Descriptions title="Host config" bordered size="small" column={2} items={buildHostConfigItems(details.hostConfig)} />
            <div>
                <Typography.Title level={5}>Ports</Typography.Title>
                <Table<PortBinding>
                    columns={portColumns}
                    dataSource={details.ports}
                    rowKey={portRowKey}
                    size="small"
                    pagination={false}
                />
            </div>
            <div>
                <Typography.Title level={5}>Mounts</Typography.Title>
                <Table<ContainerMount>
                    columns={mountColumns}
                    dataSource={details.mounts}
                    rowKey="destination"
                    size="small"
                    pagination={false}
                />
            </div>
            <div>
                <Typography.Title level={5}>Networks</Typography.Title>
                <Table<NetworkAttachment>
                    columns={networkColumns}
                    dataSource={details.networks}
                    rowKey="networkId"
                    size="small"
                    pagination={false}
                />
            </div>
        </Flex>
    );

    let content: ReactElement;
    if (logsOpen) {
        /* Side-by-side split: details scroll in the left pane, logs tail in the
           right, divider draggable. The height pins the split to the viewport:
           100vh minus the layout header (56 + 1 divider), content padding
           (24 + 24), the toolbar row (32), its divider (1), and two Flex
           gaps (24 + 24). The transient refresh alert is not budgeted — while
           it shows, the page scrolls slightly. */
        content = (
            <Splitter style={{ height: 'calc(100vh - 186px)' }}>
                <Splitter.Panel defaultSize="55%" min="25%">
                    <div style={{ height: '100%', overflowY: 'auto', paddingRight: 16 }}>
                        {detailSections}
                    </div>
                </Splitter.Panel>
                <Splitter.Panel min={280}>
                    <ContainerLogsPanel fetcher={props.fetcher} containerName={props.containerName} />
                </Splitter.Panel>
            </Splitter>
        );
    } else {
        content = detailSections;
    }

    return (
        <Flex vertical gap={24}>
            {refreshAlert}
            <ContainerControls
                fetcher={props.fetcher}
                containerName={props.containerName}
                running={details.state.running}
                logsOpen={logsOpen}
                onToggleLogs={handleToggleLogs}
                onMutated={fetched.reload}
            />
            <Divider style={{ margin: 0 }} />
            {content}
        </Flex>
    );
}

export default ContainerDetails;
