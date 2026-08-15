import { Alert, Badge, Flex, Table, Tooltip } from 'antd';
import type { TableColumnType, TableProps } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { ReactElement } from 'react';

dayjs.extend(relativeTime);

import { DockerFetcherError } from '../fetchers/docker-fetcher-error.ts';
import type { BuildAgent } from '../fetchers/interfaces.ts';
import { useFetchedData } from '../hooks/use-fetched-data.ts';
import type { FetchedData } from '../hooks/interfaces.ts';
import { formatUptime } from './agent-format.ts';
import { formatTimestamp, NO_STATS_TEXT } from './container-format.ts';
import type { BuildAgentListProps } from './interfaces.ts';

/* Each poll also re-renders the uptime and last-seen cells, so they tick along
   with the data; a builder's idle/building transition beats immediately, so
   this cadence is the UI's worst-case lag. */
const AGENTS_POLL_INTERVAL_MS: number = 5000;

function renderStatus(agent: BuildAgent): ReactElement {
    if (agent.status === 'building') {
        return <Badge status="processing" text="Building" />;
    }
    if (agent.status === 'offline') {
        return <Badge status="error" text="Offline" />;
    }
    return <Badge status="default" text="Idle" />;
}

/** Uptime of a dead process is meaningless — offline rows get the muted marker. */
function renderUptime(agent: BuildAgent): string {
    if (agent.status === 'offline') {
        return NO_STATS_TEXT;
    }
    return formatUptime(agent.startedAt);
}

function renderLastSeen(agent: BuildAgent): ReactElement {
    return <Tooltip title={formatTimestamp(agent.lastSeenAt)}>{dayjs(agent.lastSeenAt).fromNow()}</Tooltip>;
}

/* Read-only table, no detail page behind the rows — so no row links, no row
   onClick, and the columns can live at module level. The width-less Name
   column absorbs the remaining space under the fixed layout. */
const nameColumn: TableColumnType<BuildAgent> = {
    title: 'Name',
    key: 'name',
    dataIndex: 'name',
};
const statusColumn: TableColumnType<BuildAgent> = {
    title: 'Status',
    key: 'status',
    width: 140,
    render: (_value: unknown, record: BuildAgent) => renderStatus(record),
};
const uptimeColumn: TableColumnType<BuildAgent> = {
    title: 'Uptime',
    key: 'uptime',
    width: 120,
    render: (_value: unknown, record: BuildAgent) => renderUptime(record),
};
const lastSeenColumn: TableColumnType<BuildAgent> = {
    title: 'Last seen',
    key: 'lastSeenAt',
    width: 140,
    render: (_value: unknown, record: BuildAgent) => renderLastSeen(record),
};
const columns: NonNullable<TableProps<BuildAgent>['columns']> = [
    nameColumn,
    statusColumn,
    uptimeColumn,
    lastSeenColumn,
];

function describeLoadError(error: unknown): string {
    if (error instanceof DockerFetcherError) {
        return error.message;
    }
    return 'Unexpected error while loading build agents';
}

/**
 * The builder-service agents the platform has heard from, offline ones
 * included: an agent silent past the backend's threshold shows as Offline and
 * disappears after the retention window (or on a platform restart — presence
 * is in-memory).
 */
function BuildAgentList(props: BuildAgentListProps): ReactElement {
    const fetched: FetchedData<BuildAgent[]> = useFetchedData<BuildAgent[]>({
        fetch: () => props.fetcher.getBuildAgents(),
        describeError: describeLoadError,
        requestKey: 'build-agents',
        resetOnKeyChange: true,
        pollIntervalMs: AGENTS_POLL_INTERVAL_MS,
    });

    if (fetched.data === null && fetched.errorMessage !== null) {
        return (
            <Alert
                type="error"
                showIcon
                message="Failed to load build agents"
                description={fetched.errorMessage}
            />
        );
    }

    let agents: BuildAgent[];
    if (fetched.data === null) {
        agents = [];
    } else {
        agents = fetched.data;
    }

    let refreshAlert: ReactElement | null;
    if (fetched.data !== null && fetched.errorMessage !== null) {
        refreshAlert = (
            <Alert
                type="error"
                showIcon
                message="Failed to refresh build agents"
                description={fetched.errorMessage}
            />
        );
    } else {
        refreshAlert = null;
    }

    return (
        <Flex vertical gap={12}>
            {refreshAlert}
            <Table<BuildAgent>
                tableLayout="fixed"
                columns={columns}
                dataSource={agents}
                rowKey="name"
                loading={fetched.isInitialLoading}
                pagination={false}
                locale={{
                    emptyText:
                        'No build agents have reported in. Start the builder service and it will appear here within a few seconds.',
                }}
            />
        </Flex>
    );
}

export default BuildAgentList;
