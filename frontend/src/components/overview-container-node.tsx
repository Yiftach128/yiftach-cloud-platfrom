import { CloudServerOutlined } from '@ant-design/icons';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { Flex, Tag, Typography } from 'antd';
import { memo } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { Link } from 'react-router';

import { NO_STATS_TEXT, stateTagColor } from './container-format.ts';
import OriginBadge from './origin-badge.tsx';
import type { OverviewContainerFlowNode } from './overview-graph-builder.ts';

/**
 * Container card on the overview graph: name, lifecycle state, live CPU and
 * memory, published ports. The card is a real link to the container's details
 * page (new-tab friendly), so the canvas needs no node click handler.
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

function OverviewContainerNode(props: NodeProps<OverviewContainerFlowNode>): ReactElement {
    let cpuText: string;
    if (props.data.cpuText !== null) {
        cpuText = props.data.cpuText;
    } else {
        cpuText = NO_STATS_TEXT;
    }
    let memoryText: string;
    if (props.data.memoryText !== null) {
        memoryText = props.data.memoryText;
    } else {
        memoryText = NO_STATS_TEXT;
    }

    let portsLine: ReactElement | null;
    if (props.data.portsText !== '') {
        portsLine = (
            <Typography.Text type="secondary" ellipsis style={{ fontSize: 12 }}>
                {props.data.portsText}
            </Typography.Text>
        );
    } else {
        portsLine = null;
    }

    /* draggable={false} keeps a canvas pan starting on the card from turning
       into a native link drag. */
    return (
        <Link
            to={`/services/${encodeURIComponent(props.data.containerName)}`}
            className="app-overview-node-clickable"
            style={cardStyle}
            draggable={false}
        >
            <Handle type="target" position={Position.Left} style={hiddenHandleStyle} />
            <Flex vertical gap={4}>
                <Flex align="center" gap={8}>
                    <CloudServerOutlined />
                    <Typography.Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>
                        {props.data.containerName}
                    </Typography.Text>
                </Flex>
                <Flex align="center" justify="space-between">
                    <Tag color={stateTagColor(props.data.state)}>{props.data.state}</Tag>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        <OriginBadge managed={props.data.managed} />
                    </Typography.Text>
                </Flex>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {`CPU ${cpuText} · ${memoryText}`}
                </Typography.Text>
                {portsLine}
            </Flex>
        </Link>
    );
}

export default memo(OverviewContainerNode);
