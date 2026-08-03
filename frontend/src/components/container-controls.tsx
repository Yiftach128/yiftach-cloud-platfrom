import { DeleteOutlined, FileTextOutlined, PlayCircleOutlined, PoweroffOutlined, ReloadOutlined } from '@ant-design/icons';
import { App as AntdApp, Button, Flex, Popconfirm } from 'antd';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { DockerFetcherError } from '../fetchers/docker-fetcher-error.ts';
import type { ContainerAction, ContainerControlsProps } from './interfaces.ts';

function toErrorText(error: unknown): string {
    if (error instanceof DockerFetcherError) {
        return error.message;
    }
    return 'Unexpected error while calling the backend';
}

function ContainerControls(props: ContainerControlsProps): ReactElement {
    const navigate = useNavigate();
    const app = AntdApp.useApp();
    const [pendingAction, setPendingAction] = useState<ContainerAction | null>(null);

    async function runAction(action: ContainerAction, call: () => Promise<void>, successText: string): Promise<void> {
        setPendingAction(action);
        try {
            await call();
            app.message.success(successText);
            /* The parent re-fetches and swaps this toolbar out for a skeleton,
               so the reset below can land after unmount — React tolerates that
               silently. */
            props.onMutated();
        } catch (error) {
            app.message.error(toErrorText(error));
        } finally {
            setPendingAction(null);
        }
    }

    async function handleStartStop(): Promise<void> {
        if (props.running) {
            await runAction('stop', () => props.fetcher.stopContainer(props.containerName), 'Container stopped');
        } else {
            await runAction('start', () => props.fetcher.startContainer(props.containerName), 'Container started');
        }
    }

    async function handleRestart(): Promise<void> {
        await runAction('restart', () => props.fetcher.restartContainer(props.containerName), 'Container restarted');
    }

    /* Not runAction: success navigates away and unmounts this component, so
       there is no state reset and no onMutated. Returning the promise keeps
       the Popconfirm open with its OK button loading until the call ends. */
    async function handleDelete(): Promise<void> {
        setPendingAction('delete');
        try {
            await props.fetcher.deleteContainer(props.containerName);
            app.message.success('Container deleted');
            navigate('/services');
        } catch (error) {
            app.message.error(toErrorText(error));
            setPendingAction(null);
        }
    }

    let toggleLabel: string;
    let toggleIcon: ReactElement;
    let toggleAction: ContainerAction;
    if (props.running) {
        toggleLabel = 'Stop';
        toggleIcon = <PoweroffOutlined />;
        toggleAction = 'stop';
    } else {
        toggleLabel = 'Start';
        toggleIcon = <PlayCircleOutlined />;
        toggleAction = 'start';
    }

    let logsLabel: string;
    if (props.logsOpen) {
        logsLabel = 'Hide Logs';
    } else {
        logsLabel = 'View Logs';
    }

    const actionPending: boolean = pendingAction !== null;

    return (
        <Flex gap={8} wrap>
            <Button
                icon={toggleIcon}
                loading={pendingAction === toggleAction}
                disabled={actionPending && pendingAction !== toggleAction}
                onClick={handleStartStop}
            >
                {toggleLabel}
            </Button>
            <Button
                icon={<ReloadOutlined />}
                loading={pendingAction === 'restart'}
                disabled={actionPending && pendingAction !== 'restart'}
                onClick={handleRestart}
            >
                Restart
            </Button>
            <Button icon={<FileTextOutlined />} disabled={actionPending} onClick={props.onToggleLogs}>
                {logsLabel}
            </Button>
            <Popconfirm
                title="Delete container?"
                description="This stops and removes the container. Volumes are kept."
                okText="Delete"
                okButtonProps={{ danger: true }}
                onConfirm={handleDelete}
            >
                <Button
                    danger
                    icon={<DeleteOutlined />}
                    loading={pendingAction === 'delete'}
                    disabled={actionPending && pendingAction !== 'delete'}
                >
                    Delete
                </Button>
            </Popconfirm>
        </Flex>
    );
}

export default ContainerControls;
