import { DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { App as AntdApp, Button, Flex, Popconfirm, Tooltip } from 'antd';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { toErrorText } from './container-format.ts';
import type { ImageRowActionsProps } from './interfaces.ts';

/**
 * Action pair for one image-list row: create a container from the image, or
 * delete it. Unlike the container rows, image rows are not click targets
 * (there is no image details page), so the buttons stay always visible — no
 * hover-reveal CSS and no click-shielding wrapper.
 */
function ImageRowActions(props: ImageRowActionsProps): ReactElement {
    const app = AntdApp.useApp();
    const navigate = useNavigate();
    const [deleting, setDeleting] = useState<boolean>(false);

    /* Deep-links into the new-container wizard's image step; the wizard reads
       the ?image= param and prefills the Image reference field. */
    function handleCreateContainer(): void {
        if (props.primaryTag === null) {
            return; // unreachable: the button is disabled for dangling images
        }
        navigate(`/containers/new/image?image=${encodeURIComponent(props.primaryTag)}`);
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

    let createTooltip: string;
    if (props.primaryTag === null) {
        createTooltip = 'No tag to create from';
    } else {
        createTooltip = 'Create container';
    }

    return (
        <Flex gap={4} justify="flex-end">
            <Tooltip title={createTooltip}>
                <Button
                    type="text"
                    size="small"
                    aria-label="Create container"
                    icon={<PlayCircleOutlined />}
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
