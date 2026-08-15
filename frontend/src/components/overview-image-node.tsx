import { CodeSandboxOutlined } from '@ant-design/icons';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Flex, Typography } from 'antd';
import { memo } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { Link } from 'react-router';

import { shortImageId } from './image-format.ts';
import type { OverviewImageFlowNode } from './overview-graph-builder.ts';

/**
 * Image card on the overview graph. Managed images render as a real link to
 * their details page (new-tab friendly, no canvas click handler needed);
 * synthesized registry images have no page, so they render as a plain card.
 */
const baseCardStyle: CSSProperties = {
    display: 'block',
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    background: '#ffffff',
    border: '1px solid #d9d9d9',
    borderRadius: 0,
    padding: '8px 12px',
    overflow: 'hidden',
    color: 'inherit',
    textDecoration: 'none',
};

const clickableCardStyle: CSSProperties = {
    ...baseCardStyle,
    cursor: 'pointer',
};

const plainCardStyle: CSSProperties = {
    ...baseCardStyle,
    cursor: 'default',
};

/** Edges anchor to the handles, but a read-only graph shows no connector dots. */
const hiddenHandleStyle: CSSProperties = {
    opacity: 0,
    pointerEvents: 'none',
};

function OverviewImageNode(props: NodeProps<OverviewImageFlowNode>): ReactElement {
    let detailText: string;
    if (props.data.sizeText !== null) {
        detailText = props.data.sizeText;
    } else {
        detailText = 'registry image';
    }

    const content: ReactElement = (
        <>
            <Handle type="target" position={Position.Left} style={hiddenHandleStyle} />
            <Handle type="source" position={Position.Right} style={hiddenHandleStyle} />
            <Flex vertical gap={4}>
                <Flex align="center" gap={8}>
                    <CodeSandboxOutlined />
                    <Typography.Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>
                        {props.data.reference}
                    </Typography.Text>
                </Flex>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {detailText}
                </Typography.Text>
            </Flex>
        </>
    );

    if (props.data.managed) {
        /* The short id keeps the URL and breadcrumb readable; the daemon
           resolves it like any id prefix. draggable={false} keeps a canvas pan
           starting on the card from turning into a native link drag. */
        return (
            <Link
                to={`/images/${encodeURIComponent(shortImageId(props.data.imageId))}`}
                className="app-overview-node-clickable"
                style={clickableCardStyle}
                draggable={false}
            >
                {content}
            </Link>
        );
    }
    return <div style={plainCardStyle}>{content}</div>;
}

export default memo(OverviewImageNode);
