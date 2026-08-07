import { Alert, Badge, Button, Flex, Skeleton, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement, UIEvent } from 'react';

import { DockerFetcherError } from '../fetchers/docker-fetcher-error.ts';
import type { BuildJob } from '../fetchers/interfaces.ts';
import type { BuildProgressPanelProps } from './interfaces.ts';

/** Delay between successful polls. */
const POLL_INTERVAL_MS: number = 2000;
/** Delay before retrying after a failed poll. */
const POLL_ERROR_BACKOFF_MS: number = 10000;
/** Distance from the bottom (px) within which the view still follows new lines. */
const PINNED_THRESHOLD_PX: number = 40;

/**
 * Watches one build job: polls its snapshot (the backend keeps the whole
 * picture, so every poll replaces the previous one — no cursor needed, unlike
 * the container log tail) and renders the progress lines terminal-style. A
 * 'queued' job just waits its turn — the builder service works the queue
 * oldest-first. Polling stops on a terminal status; success is reported
 * upward exactly once so the wizard can open the created container (the
 * builder created it before the job turned 'succeeded').
 */
function BuildProgressPanel(props: BuildProgressPanelProps): ReactElement {
    const [job, setJob] = useState<BuildJob | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [jobLost, setJobLost] = useState<boolean>(false);
    const [succeededJob, setSucceededJob] = useState<BuildJob | null>(null);

    const pinnedToBottom = useRef<boolean>(true);
    const bottomSentinel = useRef<HTMLDivElement | null>(null);
    /** Guards the one-time onSucceeded report across effect re-runs. */
    const successReported = useRef<boolean>(false);

    useEffect(() => {
        let disposed: boolean = false;
        let timer: number | undefined = undefined;

        setJob(null);
        setErrorMessage(null);
        setIsLoading(true);
        setJobLost(false);
        setSucceededJob(null);
        pinnedToBottom.current = true;
        successReported.current = false;

        async function poll(): Promise<void> {
            if (disposed) {
                return;
            }
            try {
                const fresh: BuildJob = await props.fetcher.getBuildJob(props.jobId);
                if (disposed) {
                    return;
                }
                setJob(fresh);
                setErrorMessage(null);
                setIsLoading(false);
                if (fresh.status === 'succeeded') {
                    setSucceededJob(fresh); // handled by the effect below
                    return;
                }
                if (fresh.status === 'failed') {
                    return; // terminal — the job carries errorMessage
                }
                timer = window.setTimeout(poll, POLL_INTERVAL_MS);
            } catch (error) {
                if (disposed) {
                    return;
                }
                if (error instanceof DockerFetcherError && error.status === 404) {
                    /* The job expired or the backend restarted — polling again
                       can never succeed, so stop for good. */
                    setErrorMessage('This build job no longer exists — the backend may have restarted.');
                    setJobLost(true);
                    setIsLoading(false);
                    return;
                }
                if (error instanceof DockerFetcherError) {
                    setErrorMessage(error.message);
                } else {
                    setErrorMessage('Unexpected error while polling the build');
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
    }, [props.fetcher, props.jobId]);

    /* Reported from an effect, not from inside the poll closure, so the freshest
       onSucceeded prop is the one that runs. The ref keeps it exactly-once even
       though `props` (in the deps) changes identity on every parent render. */
    useEffect(() => {
        if (succeededJob !== null && !successReported.current) {
            successReported.current = true;
            props.onSucceeded(succeededJob);
        }
    }, [succeededJob, props]);

    useEffect(() => {
        /* Follow the tail, but only while the user has not scrolled up. */
        if (pinnedToBottom.current && bottomSentinel.current !== null) {
            bottomSentinel.current.scrollIntoView({ block: 'nearest' });
        }
    }, [job]);

    function handleScroll(event: UIEvent<HTMLDivElement>): void {
        const target: HTMLDivElement = event.currentTarget;
        const distanceFromBottom: number = target.scrollHeight - target.scrollTop - target.clientHeight;
        pinnedToBottom.current = distanceFromBottom <= PINNED_THRESHOLD_PX;
    }

    let statusBadge: ReactElement;
    if (jobLost) {
        statusBadge = <Badge status="error" text="Lost" />;
    } else if (job !== null && job.status === 'queued') {
        statusBadge = <Badge status="default" text="Queued" />;
    } else if (job !== null && job.status === 'succeeded') {
        statusBadge = <Badge status="success" text="Build succeeded" />;
    } else if (job !== null && job.status === 'failed') {
        statusBadge = <Badge status="error" text="Build failed" />;
    } else {
        statusBadge = <Badge status="processing" text="Building" />;
    }

    let body: ReactElement;
    if (isLoading) {
        body = <Skeleton active paragraph={{ rows: 6 }} />;
    } else if (job === null) {
        let description: string;
        if (errorMessage !== null) {
            description = errorMessage;
        } else {
            description = 'No build data was returned.';
        }
        body = (
            <Flex vertical gap={12} align="flex-start">
                <Alert type="error" showIcon message="Build unavailable" description={description} />
                <Button onClick={props.onBack}>Back</Button>
            </Flex>
        );
    } else {
        let failureAlert: ReactElement | null = null;
        if (job.status === 'failed') {
            let description: string;
            if (job.errorMessage !== undefined) {
                description = job.errorMessage;
            } else {
                description = 'The build reported no failure detail.';
            }
            failureAlert = <Alert type="error" showIcon message="Build failed" description={description} />;
        } else if (errorMessage !== null) {
            failureAlert = <Alert type="error" showIcon message="Build polling failed" description={errorMessage} />;
        }

        let lineContent: ReactElement;
        if (job.logLines.length === 0) {
            let placeholder: string;
            if (job.status === 'queued') {
                placeholder = 'Waiting for the builder to pick up this job…';
            } else {
                placeholder = 'Waiting for the first build output…';
            }
            lineContent = <div style={{ color: '#d4d4d4' }}>{placeholder}</div>;
        } else {
            /* Index keys are safe: the backend only appends, or trims from the
               front in bulk at its line cap. */
            lineContent = (
                <>
                    {job.logLines.map((line: string, index: number) => (
                        <div key={index}>{line}</div>
                    ))}
                    <div ref={bottomSentinel} />
                </>
            );
        }

        let footer: ReactElement | null = null;
        if (job.status === 'failed' || jobLost) {
            footer = <Button onClick={props.onBack}>Back</Button>;
        }

        body = (
            <>
                {failureAlert}
                <div
                    onScroll={handleScroll}
                    style={{
                        height: 360,
                        overflowY: 'auto',
                        fontFamily: 'ui-monospace, Consolas, monospace',
                        fontSize: 12,
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                        backgroundColor: '#1e1e1e',
                        color: '#d4d4d4',
                        padding: 12,
                    }}
                >
                    {lineContent}
                </div>
                {footer}
            </>
        );
    }

    return (
        <Flex vertical gap={12} style={{ maxWidth: 860 }}>
            <Flex justify="space-between" align="center">
                <Typography.Title level={5} style={{ margin: 0 }}>Image build</Typography.Title>
                {statusBadge}
            </Flex>
            {body}
        </Flex>
    );
}

export default BuildProgressPanel;
