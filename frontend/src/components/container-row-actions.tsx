import { DeleteOutlined, PlayCircleOutlined, PoweroffOutlined, ReloadOutlined } from '@ant-design/icons';
import { App as AntdApp, Button, Flex, Popconfirm, Tooltip } from 'antd';
import { useState } from 'react';
import type { MouseEvent, ReactElement } from 'react';

import { isRunningLike, toErrorText } from './container-format.ts';
import type { ContainerAction, ContainerRowActionsProps } from './interfaces.ts';

/**
 * Hover-revealed icon toolbar for one container-list row. Visibility is
 * CSS-driven (.app-row-actions in index.css); the -pinned modifier keeps the
 * toolbar shown while an action runs or the delete confirm is open, because
 * the pointer then sits in the portaled popup and the row loses :hover.
 */
function ContainerRowActions(props: ContainerRowActionsProps): ReactElement {
    const app = AntdApp.useApp();
    const [pendingAction, setPendingAction] = useState<ContainerAction | null>(null);
    const [confirmOpen, setConfirmOpen] = useState<boolean>(false);

    async function runAction(action: ContainerAction, call: () => Promise<void>, successText: string): Promise<void> {
        setPendingAction(action);
        try {
            await call();
            app.message.success(successText);
            /* The re-fetch can drop this row (delete), so the reset below may
               land after unmount — React tolerates that silently. */
            props.onMutated();
        } catch (error) {
            app.message.error(toErrorText(error));
        } finally {
            setPendingAction(null);
        }
    }

    async function handleStartStop(): Promise<void> {
        if (isRunningLike(props.state)) {
            await runAction('stop', () => props.fetcher.stopContainer(props.containerName), 'Container stopped');
        } else {
            await runAction('start', () => props.fetcher.startContainer(props.containerName), 'Container started');
        }
    }

    async function handleRestart(): Promise<void> {
        await runAction('restart', () => props.fetcher.restartContainer(props.containerName), 'Container restarted');
    }

    /* Unlike the details page, delete navigates nowhere: the onMutated
       re-fetch drops the row. Returning the promise keeps the Popconfirm
       open with its OK button loading until the call ends. */
    async function handleDelete(): Promise<void> {
        await runAction('delete', () => props.fetcher.deleteContainer(props.containerName), 'Container deleted');
    }

    /* The whole row is a navigation click target (onRow in container-list).
       Stopping here shields the buttons AND the Popconfirm popup: the popup
       mounts in document.body, but React re-bubbles its clicks along the
       React tree, which passes through this wrapper. */
    function handleWrapperClick(event: MouseEvent<HTMLDivElement>): void {
        event.stopPropagation();
    }

    function handleConfirmOpenChange(open: boolean): void {
        setConfirmOpen(open);
    }

    let toggleLabel: string;
    let toggleIcon: ReactElement;
    let toggleAction: ContainerAction;
    if (isRunningLike(props.state)) {
        toggleLabel = 'Stop';
        toggleIcon = <PoweroffOutlined />;
        toggleAction = 'stop';
    } else {
        toggleLabel = 'Start';
        toggleIcon = <PlayCircleOutlined />;
        toggleAction = 'start';
    }

    const actionPending: boolean = pendingAction !== null;

    let wrapperClassName: string;
    if (actionPending || confirmOpen) {
        wrapperClassName = 'app-row-actions app-row-actions-pinned';
    } else {
        wrapperClassName = 'app-row-actions';
    }

    return (
        <Flex gap={4} justify="flex-end" className={wrapperClassName} onClick={handleWrapperClick}>
            <Tooltip title={toggleLabel}>
                <Button
                    type="text"
                    size="small"
                    aria-label={toggleLabel}
                    icon={toggleIcon}
                    loading={pendingAction === toggleAction}
                    disabled={actionPending && pendingAction !== toggleAction}
                    onClick={handleStartStop}
                />
            </Tooltip>
            <Tooltip title="Restart">
                <Button
                    type="text"
                    size="small"
                    aria-label="Restart"
                    icon={<ReloadOutlined />}
                    loading={pendingAction === 'restart'}
                    disabled={actionPending && pendingAction !== 'restart'}
                    onClick={handleRestart}
                />
            </Tooltip>
            <Popconfirm
                title="Delete container?"
                description="This stops and removes the container. Volumes are kept."
                okText="Delete"
                okButtonProps={{ danger: true }}
                onConfirm={handleDelete}
                onOpenChange={handleConfirmOpenChange}
            >
                <Tooltip title="Delete">
                    <Button
                        danger
                        type="text"
                        size="small"
                        aria-label="Delete"
                        icon={<DeleteOutlined />}
                        loading={pendingAction === 'delete'}
                        disabled={actionPending && pendingAction !== 'delete'}
                    />
                </Tooltip>
            </Popconfirm>
        </Flex>
    );
}

export default ContainerRowActions;
