import { ContainerOutlined, DatabaseOutlined, GithubOutlined } from '@ant-design/icons';
import { Card, Flex, Typography } from 'antd';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import type { SourceCardDescriptor } from './interfaces.ts';

const SOURCE_CARDS: SourceCardDescriptor[] = [
    {
        kind: 'preset',
        segment: 'database',
        icon: <DatabaseOutlined style={{ fontSize: 24 }} />,
        title: 'Managed Service',
        description: 'Order a service from an existing catalog (e.g. Redis, MongoDB).',
    },
    {
        kind: 'image',
        segment: 'image',
        icon: <ContainerOutlined style={{ fontSize: 24 }} />,
        title: 'Docker Image',
        description: 'Run any public image by its reference, like nginx:latest.',
    },
    {
        kind: 'github',
        segment: 'github',
        icon: <GithubOutlined style={{ fontSize: 24 }} />,
        title: 'GitHub Repository',
        description: 'Build and run a public repository with a Dockerfile at its root.',
    },
];

/**
 * The wizard's first screen: one card per container source kind, each a real
 * anchor to its step route (new-tab friendly).
 */
function SourceKindSelect(): ReactElement {
    /* justify centers the row horizontally; the default cross-axis stretch
       keeps all cards on a line equally tall — the Link is the flex child, so
       it carries the width, and the Card stretches to fill it. color: inherit
       keeps the anchor's link-blue from cascading into the card content. */
    return (
        <Flex gap={16} wrap justify="center" style={{ paddingTop: 46 }}>
            {SOURCE_CARDS.map((card: SourceCardDescriptor) => (
                <Link
                    key={card.kind}
                    to={`/containers/new/${card.segment}`}
                    style={{ width: 260, color: 'inherit', textDecoration: 'none' }}
                >
                    <Card hoverable style={{ height: '100%' }}>
                        <Flex vertical gap={8}>
                            {card.icon}
                            <Typography.Text strong>{card.title}</Typography.Text>
                            <Typography.Text type="secondary">{card.description}</Typography.Text>
                        </Flex>
                    </Card>
                </Link>
            ))}
        </Flex>
    );
}

export default SourceKindSelect;
