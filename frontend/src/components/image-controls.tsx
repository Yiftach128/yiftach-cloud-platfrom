import { DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { App as AntdApp, Button, Flex, Popconfirm, Tooltip } from 'antd';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { toErrorText } from './container-format.ts';
import type { ImageControlsProps } from './interfaces.ts';

/**
 * Toolbar for the image details page: create a container from the image, or
 * delete it — the same action pair as the image list's hover row actions, but
 * as labeled buttons like the container details toolbar.
 */
function ImageControls(props: ImageControlsProps): ReactElement {
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

    /* Success navigates away and unmounts this component, so there is no
       state reset. Returning the promise keeps the Popconfirm open with its
       OK button loading until the call ends. */
    async function handleDelete(): Promise<void> {
        setDeleting(true);
        try {
            await props.fetcher.deleteImage(props.imageId);
            app.message.success('Image deleted');
            navigate('/images');
        } catch (error) {
            app.message.error(toErrorText(error));
            setDeleting(false);
        }
    }

    /* Tooltip only for the disabled case; an undefined title renders none. */
    let createTooltip: string | undefined;
    if (props.primaryTag === null) {
        createTooltip = 'No tag to create from';
    } else {
        createTooltip = undefined;
    }

    return (
        <Flex gap={8} wrap>
            <Tooltip title={createTooltip}>
                <Button
                    icon={<PlayCircleOutlined />}
                    disabled={props.primaryTag === null || deleting}
                    onClick={handleCreateContainer}
                >
                    Create Container
                </Button>
            </Tooltip>
            <Popconfirm
                title="Delete image?"
                description="Removes the image from the daemon. Images still used by a container are refused."
                okText="Delete"
                okButtonProps={{ danger: true }}
                onConfirm={handleDelete}
            >
                <Button danger icon={<DeleteOutlined />} loading={deleting}>
                    Delete
                </Button>
            </Popconfirm>
        </Flex>
    );
}

export default ImageControls;
