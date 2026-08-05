import { ContainerOutlined, DatabaseOutlined, GithubOutlined } from '@ant-design/icons';
import { Card, Flex, Typography } from 'antd';
import type { ReactElement } from 'react';

import type { SourceCardDescriptor, SourceKindSelectProps } from './interfaces.ts';

const SOURCE_CARDS: SourceCardDescriptor[] = [
    {
        kind: 'preset',
        icon: <DatabaseOutlined style={{ fontSize: 24 }} />,
        title: 'Database',
        description: 'Launch MongoDB, Redis, or PostgreSQL from a ready-made preset.',
    },
    {
        kind: 'image',
        icon: <ContainerOutlined style={{ fontSize: 24 }} />,
        title: 'Docker Image',
        description: 'Run any public image by its reference, like nginx:latest.',
    },
    {
        kind: 'github',
        icon: <GithubOutlined style={{ fontSize: 24 }} />,
        title: 'GitHub Repository',
        description: 'Build and run a public repository with a Dockerfile at its root.',
    },
];

/** The wizard's first screen: one clickable card per container source kind. */
function SourceKindSelect(props: SourceKindSelectProps): ReactElement {
    /* justify centers the row horizontally; the default cross-axis stretch
       keeps all cards on a line equally tall. */
    return (
        <Flex gap={16} wrap justify="center" style={{ paddingTop: 46 }}>
            {SOURCE_CARDS.map((card: SourceCardDescriptor) => (
                <Card
                    key={card.kind}
                    hoverable
                    onClick={() => props.onSelect(card.kind)}
                    style={{ width: 260 }}
                >
                    <Flex vertical gap={8}>
                        {card.icon}
                        <Typography.Text strong>{card.title}</Typography.Text>
                        <Typography.Text type="secondary">{card.description}</Typography.Text>
                    </Flex>
                </Card>
            ))}
        </Flex>
    );
}

export default SourceKindSelect;
