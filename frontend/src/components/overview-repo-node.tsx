import { GithubOutlined } from '@ant-design/icons';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Flex, Typography } from 'antd';
import { memo } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import type { OverviewRepoFlowNode } from './overview-graph-builder.ts';

/**
 * GitHub source card on the overview graph. The card is a real external anchor
 * opening the repository in a new tab, so the canvas needs no node click
 * handler. The wrapper element already has the node's declared width/height,
 * so the card just fills it.
 */
const cardStyle: CSSProperties = {
    display: 'block',
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    background: '#ffffff',
    border: '1px solid #d9d9d9',
    borderRadius: 0,
    padding: '8px 12px',
    cursor: 'pointer',
    overflow: 'hidden',
    color: 'inherit',
    textDecoration: 'none',
};

/** Edges anchor to the handles, but a read-only graph shows no connector dots. */
const hiddenHandleStyle: CSSProperties = {
    opacity: 0,
    pointerEvents: 'none',
};

function OverviewRepoNode(props: NodeProps<OverviewRepoFlowNode>): ReactElement {
    /* draggable={false} keeps a canvas pan starting on the card from turning
       into a native link drag. */
    return (
        <a
            href={props.data.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="app-overview-node-clickable"
            style={cardStyle}
            draggable={false}
        >
            <Handle type="source" position={Position.Right} style={hiddenHandleStyle} />
            <Flex vertical gap={4}>
                <Flex align="center" gap={8}>
                    <GithubOutlined />
                    <Typography.Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>
                        {props.data.displayName}
                    </Typography.Text>
                </Flex>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    GitHub
                </Typography.Text>
            </Flex>
        </a>
    );
}

export default memo(OverviewRepoNode);
