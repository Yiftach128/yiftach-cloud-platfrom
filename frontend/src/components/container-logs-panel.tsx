import { Alert, Badge, Empty, Flex, Skeleton, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement, UIEvent } from 'react';

import { DockerFetcherError } from '../fetchers/docker-fetcher-error.ts';
import type { ContainerLogLine, ContainerLogs } from '../fetchers/interfaces.ts';
import type { ContainerLogsPanelProps } from './interfaces.ts';

/** Lines the initial snapshot fetches. */
const LOGS_TAIL: number = 500;
/** Delay between successful polls. */
const POLL_INTERVAL_MS: number = 2000;
/** Delay before retrying after a failed poll. */
const POLL_ERROR_BACKOFF_MS: number = 10000;
/** Oldest lines are dropped past this count so a chatty container cannot grow memory unbounded. */
const MAX_RENDERED_LINES: number = 2000;
/** Distance from the bottom (px) within which the view still follows new lines. */
const PINNED_THRESHOLD_PX: number = 40;

/* Text colors picked for the dark terminal surface below. */
function lineColor(stream: 'stdout' | 'stderr'): string {
    if (stream === 'stderr') {
        return '#ff7875';
    }
    return '#d4d4d4';
}

function lineText(text: string): string {
    /* pre-wrap preserves the space, so a blank log line keeps its height. */
    if (text === '') {
        return ' ';
    }
    return text;
}

/**
 * Live log tail for one container. The panel only mounts while the logs pane
 * is open, so its mount lifecycle is the polling session: polling starts on
 * mount and the effect cleanup stops it on unmount.
 */
function ContainerLogsPanel(props: ContainerLogsPanelProps): ReactElement {
    const [logs, setLogs] = useState<ContainerLogs | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [pollingStopped, setPollingStopped] = useState<boolean>(false);

    const pinnedToBottom = useRef<boolean>(true);
    const bottomSentinel = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let disposed: boolean = false;
        let timer: number | undefined = undefined;
        /* The effect owns one polling session: the line accumulator (whose
           last entry is the since-cursor) lives in this closure, because React
           state read inside the timeout chain would go stale. The useState
           values are only the render mirror. */
        let accumulated: ContainerLogLine[] = [];

        setLogs(null);
        setErrorMessage(null);
        setIsLoading(true);
        setPollingStopped(false);
        pinnedToBottom.current = true;

        async function poll(): Promise<void> {
            if (disposed) {
                return;
            }
            try {
                let cursor: ContainerLogLine | undefined = undefined;
                if (accumulated.length > 0) {
                    cursor = accumulated[accumulated.length - 1];
                }

                let fresh: ContainerLogs;
                if (cursor === undefined || cursor.timestamp === '') {
                    /* Snapshot mode: first fetch, or the cursor line arrived
                       without a usable timestamp. */
                    fresh = await props.fetcher.getContainerLogs(props.containerName, { tail: LOGS_TAIL });
                    accumulated = fresh.lines;
                } else {
                    /* Incremental mode: the cursor timestamp goes back verbatim.
                       The since filter is inclusive, so the cursor line returns
                       as the first element — drop that one duplicate. tail 'all'
                       keeps the boundary in range however much arrived since. */
                    fresh = await props.fetcher.getContainerLogs(props.containerName, {
                        since: cursor.timestamp,
                        tail: 'all',
                    });
                    let newLines: ContainerLogLine[] = fresh.lines;
                    const boundary: ContainerLogLine | undefined = newLines[0];
                    if (boundary !== undefined && boundary.timestamp === cursor.timestamp) {
                        newLines = newLines.slice(1);
                    }
                    accumulated = accumulated.concat(newLines);
                }

                if (accumulated.length > MAX_RENDERED_LINES) {
                    accumulated = accumulated.slice(accumulated.length - MAX_RENDERED_LINES);
                }

                if (disposed) {
                    return;
                }
                setLogs({ tty: fresh.tty, lines: accumulated });
                setErrorMessage(null);
                setIsLoading(false);
                timer = window.setTimeout(poll, POLL_INTERVAL_MS);
            } catch (error) {
                if (disposed) {
                    return;
                }
                if (error instanceof DockerFetcherError && error.status === 404) {
                    /* The container is gone (deleted while being watched):
                       polling for it again can never succeed, so stop for good. */
                    setErrorMessage(`Container "${props.containerName}" no longer exists.`);
                    setPollingStopped(true);
                    setIsLoading(false);
                    return;
                }
                if (error instanceof DockerFetcherError) {
                    setErrorMessage(error.message);
                } else {
                    setErrorMessage('Unexpected error while loading logs');
                }
                setIsLoading(false);
                timer = window.setTimeout(poll, POLL_ERROR_BACKOFF_MS);
            }
        }

        poll();

        return () => {
            disposed = true;
            if (timer !== undefined) {
                clearTimeout(timer);
            }
        };
    }, [props.fetcher, props.containerName]);

    useEffect(() => {
        /* Follow the tail, but only while the user has not scrolled up. */
        if (pinnedToBottom.current && bottomSentinel.current !== null) {
            bottomSentinel.current.scrollIntoView({ block: 'nearest' });
        }
    }, [logs]);

    function handleScroll(event: UIEvent<HTMLDivElement>): void {
        const target: HTMLDivElement = event.currentTarget;
        const distanceFromBottom: number = target.scrollHeight - target.scrollTop - target.clientHeight;
        pinnedToBottom.current = distanceFromBottom <= PINNED_THRESHOLD_PX;
    }

    let liveBadge: ReactElement;
    if (pollingStopped) {
        liveBadge = <Badge status="error" text="Stopped" />;
    } else {
        liveBadge = <Badge status="processing" text="Live" />;
    }

    let body: ReactElement;
    if (isLoading) {
        body = <Skeleton active paragraph={{ rows: 10 }} />;
    } else if (logs === null) {
        let description: string;
        if (errorMessage !== null) {
            description = errorMessage;
        } else {
            description = 'No log data was returned.';
        }
        body = <Alert type="error" showIcon message="Failed to load logs" description={description} />;
    } else {
        let pollErrorAlert: ReactElement | null = null;
        if (errorMessage !== null) {
            pollErrorAlert = <Alert type="error" showIcon message="Log polling failed" description={errorMessage} />;
        }

        let ttyNote: ReactElement | null = null;
        if (logs.tty) {
            ttyNote = <Typography.Text type="secondary">TTY container — stdout and stderr are merged.</Typography.Text>;
        }

        let lineContent: ReactElement;
        if (logs.lines.length === 0) {
            /* The default description text is too dim on the dark surface. */
            lineContent = <Empty description={<span style={{ color: '#d4d4d4' }}>No log output</span>} />;
        } else {
            /* Index keys are safe: the list only appends, or trims from the
               front in bulk once MAX_RENDERED_LINES is reached. */
            lineContent = (
                <>
                    {logs.lines.map((line: ContainerLogLine, index: number) => (
                        <div key={index} style={{ color: lineColor(line.stream) }}>{lineText(line.text)}</div>
                    ))}
                    <div ref={bottomSentinel} />
                </>
            );
        }

        const lineList: ReactElement = (
            <div
                className="app-log-output"
                onScroll={handleScroll}
                style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    fontFamily: 'ui-monospace, Consolas, monospace',
                    fontSize: 12,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    backgroundColor: '#1e1e1e',
                    padding: 12,
                }}
            >
                {lineContent}
            </div>
        );

        body = (
            <>
                {pollErrorAlert}
                {ttyNote}
                {lineList}
            </>
        );
    }

    return (
        <Flex vertical gap={12} style={{ height: '100%', paddingLeft: 16 }}>
            <Flex justify="space-between" align="center">
                <Typography.Title level={5} style={{ margin: 0 }}>Logs</Typography.Title>
                {liveBadge}
            </Flex>
            {body}
        </Flex>
    );
}

export default ContainerLogsPanel;
