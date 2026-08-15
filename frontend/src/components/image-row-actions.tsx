import { DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { App as AntdApp, Button, Flex, Popconfirm, Tooltip } from 'antd';
import { useState } from 'react';
import type { MouseEvent, ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { toErrorText } from './container-format.ts';
import type { ImageRowActionsProps } from './interfaces.ts';
import { navigateOnPlainClick } from './link-click.ts';

/**
 * Hover-revealed action pair for one image-list row: create a container from
 * the image, or delete it. Visibility is CSS-driven (.app-row-actions in
 * index.css); the -pinned modifier keeps the pair shown while the delete runs
 * or its confirm is open, because the pointer then sits in the portaled popup
 * and the row loses :hover.
 */
function ImageRowActions(props: ImageRowActionsProps): ReactElement {
    const app = AntdApp.useApp();
    const navigate = useNavigate();
    const [deleting, setDeleting] = useState<boolean>(false);
    const [confirmOpen, setConfirmOpen] = useState<boolean>(false);

    /* Deep-links into the new-container wizard's image step; the wizard reads
       the ?image= param and prefills the Image reference field. The href makes
       the button a real anchor (new-tab friendly); antd drops it while the
       button is disabled. */
    let createHref: string | undefined;
    if (props.primaryTag === null) {
        createHref = undefined;
    } else {
        createHref = `/containers/new/image?image=${encodeURIComponent(props.primaryTag)}`;
    }

    function handleCreateContainer(event: MouseEvent<HTMLElement>): void {
        if (createHref === undefined) {
            return; // unreachable: the button is disabled for dangling images
        }
        navigateOnPlainClick(event, navigate, createHref);
    }

    /* Returning the promise keeps the Popconfirm open with its OK button
       loading until the call ends. */
    async function handleDelete(): Promise<void> {
        setDeleting(true);
        try {
            await props.fetcher.deleteImage(props.imageId);
            app.message.success('Image deleted');
            /* The re-fetch drops this row, so the reset below may land after
               unmount — React tolerates that silently. */
            props.onMutated();
        } catch (error) {
            app.message.error(toErrorText(error));
        } finally {
            setDeleting(false);
        }
    }

    /* The whole row is a navigation click target (onRow in image-list).
       Stopping here shields the buttons AND the Popconfirm popup: the popup
       mounts in document.body, but React re-bubbles its clicks along the
       React tree, which passes through this wrapper. */
    function handleWrapperClick(event: MouseEvent<HTMLDivElement>): void {
        event.stopPropagation();
    }

    function handleConfirmOpenChange(open: boolean): void {
        setConfirmOpen(open);
    }

    let createTooltip: string;
    if (props.primaryTag === null) {
        createTooltip = 'No tag to create from';
    } else {
        createTooltip = 'Create container';
    }

    let wrapperClassName: string;
    if (deleting || confirmOpen) {
        wrapperClassName = 'app-row-actions app-row-actions-pinned';
    } else {
        wrapperClassName = 'app-row-actions';
    }

    return (
        <Flex gap={4} justify="flex-end" className={wrapperClassName} onClick={handleWrapperClick}>
            <Tooltip title={createTooltip}>
                <Button
                    type="text"
                    size="small"
                    aria-label="Create container"
                    icon={<PlayCircleOutlined />}
                    href={createHref}
                    disabled={props.primaryTag === null || deleting}
                    onClick={handleCreateContainer}
                />
            </Tooltip>
            <Popconfirm
                title="Delete image?"
                description="Removes the image from the daemon. Images still used by a container are refused."
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
                        loading={deleting}
                    />
                </Tooltip>
            </Popconfirm>
        </Flex>
    );
}

export default ImageRowActions;
