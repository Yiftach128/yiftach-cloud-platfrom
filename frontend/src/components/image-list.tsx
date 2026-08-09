import { Alert, Flex, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';

dayjs.extend(relativeTime);

import { DockerFetcherError } from '../fetchers/docker-fetcher-error.ts';
import type { DockerFetcherService } from '../fetchers/docker-fetcher-service.ts';
import type { ImageSummary } from '../fetchers/interfaces.ts';
import { useFetchedData } from '../hooks/use-fetched-data.ts';
import type { FetchedData } from '../hooks/interfaces.ts';
import { formatTimestamp } from './container-format.ts';
import { formatSizeBytes, shortImageId } from './image-format.ts';
import ImageRowActions from './image-row-actions.tsx';
import type { ImageListProps } from './interfaces.ts';

function formatCreatedAt(createdAt: string): string {
    return dayjs(createdAt).fromNow();
}

/**
 * "Tags" cell: one chip per tag (an image ID can carry several tags — every
 * identical rebuild just adds an alias), or a muted marker for dangling images.
 * antd 6 tags carry no margin of their own, so the flex gap is what keeps
 * adjacent chips apart — empty space the table background shows through.
 */
function renderTags(tags: string[]): ReactElement {
    if (tags.length === 0) {
        return <Typography.Text type="secondary">untagged</Typography.Text>;
    }
    return (
        <Flex wrap gap={12}>
            {tags.map((tag: string) => (
                <Tag key={tag}>{tag}</Tag>
            ))}
        </Flex>
    );
}

/* The width-less Tags column takes the table's remaining space under the fixed
   layout; the bounded columns hold their pixel widths. No ellipsis on Tags —
   chips wrap onto extra lines instead of being clipped. */
const staticColumns: NonNullable<TableProps<ImageSummary>['columns']> = [
    {
        title: 'Tags',
        dataIndex: 'tags',
        key: 'tags',
        render: (tags: string[]) => renderTags(tags),
    },
    {
        title: 'Image ID',
        dataIndex: 'id',
        key: 'id',
        width: 140,
        render: (id: string) => (
            <Tooltip title={id}>
                <Typography.Text code>{shortImageId(id)}</Typography.Text>
            </Tooltip>
        ),
    },
    {
        title: 'Size',
        dataIndex: 'sizeBytes',
        key: 'sizeBytes',
        width: 110,
        render: (sizeBytes: number) => formatSizeBytes(sizeBytes),
    },
    {
        title: 'Created',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 130,
        render: (createdAt: string) => (
            <Tooltip title={formatTimestamp(createdAt)}>{formatCreatedAt(createdAt)}</Tooltip>
        ),
    },
];

function buildColumns(fetcher: DockerFetcherService, onMutated: () => void): NonNullable<TableProps<ImageSummary>['columns']> {
    return staticColumns.concat([
        {
            title: '',
            key: 'actions',
            align: 'right',
            width: 90,
            render: (_value: unknown, record: ImageSummary) => {
                let primaryTag: string | null;
                const firstTag: string | undefined = record.tags[0];
                if (firstTag !== undefined) {
                    primaryTag = firstTag;
                } else {
                    primaryTag = null;
                }
                return (
                    <ImageRowActions
                        fetcher={fetcher}
                        imageId={record.id}
                        primaryTag={primaryTag}
                        onMutated={onMutated}
                    />
                );
            },
        },
    ]);
}

/**
 * The platform-built images (the GitHub build flow's output), with per-row
 * create-container and delete actions. Registry-pulled images never appear —
 * the backend lists only images labeled cloudplatform.managed=true.
 */
function describeLoadError(error: unknown): string {
    if (error instanceof DockerFetcherError) {
        return error.message;
    }
    return 'Unexpected error while loading images';
}

function ImageList(props: ImageListProps): ReactElement {
    const navigate = useNavigate();

    /* Re-fetches (reload after a delete) are silent per the hook contract —
       the remaining rows stay rendered without a table flash. */
    const fetched: FetchedData<ImageSummary[]> = useFetchedData<ImageSummary[]>({
        fetch: () => props.fetcher.getImages(),
        describeError: describeLoadError,
        requestKey: 'images',
        resetOnKeyChange: true,
    });

    if (fetched.data === null && fetched.errorMessage !== null) {
        return (
            <Alert
                type="error"
                showIcon
                message="Failed to load images"
                description={fetched.errorMessage}
            />
        );
    }

    let images: ImageSummary[];
    if (fetched.data === null) {
        images = [];
    } else {
        images = fetched.data;
    }

    let refreshAlert: ReactElement | null;
    if (fetched.data !== null && fetched.errorMessage !== null) {
        refreshAlert = (
            <Alert
                type="error"
                showIcon
                message="Failed to refresh images"
                description={fetched.errorMessage}
            />
        );
    } else {
        refreshAlert = null;
    }

    const columns: NonNullable<TableProps<ImageSummary>['columns']> = buildColumns(props.fetcher, fetched.reload);

    return (
        <Flex vertical gap={12}>
            {refreshAlert}
            <Table<ImageSummary>
                className="app-hover-actions-table"
                tableLayout="fixed"
                columns={columns}
                dataSource={images}
                rowKey="id"
                loading={fetched.isInitialLoading}
                pagination={false}
                locale={{
                    emptyText: 'No platform-built images yet. Build one from a GitHub repository via New Service > GitHub Repository.',
                }}
                onRow={(record: ImageSummary) => ({
                    onClick: (): void => {
                        /* The short id keeps the URL and breadcrumb readable; the
                           daemon resolves it like any id prefix. */
                        navigate(`/images/${encodeURIComponent(shortImageId(record.id))}`);
                    },
                    style: { cursor: 'pointer' },
                })}
            />
        </Flex>
    );
}

export default ImageList;
