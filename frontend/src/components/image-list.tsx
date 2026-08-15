import { Alert, Flex, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableColumnType, TableProps } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { MouseEvent, ReactElement, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';

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
import { navigateOnPlainClick } from './link-click.ts';

/** The wizard step the empty-state hint links to. */
const GITHUB_WIZARD_PATH: string = '/containers/new/github';

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

/**
 * Wraps a cell's content in the row's anchor to the image details page,
 * stretched over the whole cell (.app-row-link swallows the cell padding), so
 * the entire row surface is one continuous link. The action buttons' cell
 * skips it. Only the Image ID cell's link is tabbable, so keyboard users get
 * one stop per row instead of one per cell. The short id keeps the URL and
 * breadcrumb readable; the daemon resolves it like any id prefix.
 */
function renderRowLinkCell(content: ReactNode, image: ImageSummary, tabbable: boolean): ReactElement {
    let tabIndex: number;
    if (tabbable) {
        tabIndex = 0;
    } else {
        tabIndex = -1;
    }

    /* Stopping propagation keeps a modified click (new tab) from also firing
       the whole-row onClick fallback in the current tab. */
    function handleClick(event: MouseEvent<HTMLElement>): void {
        event.stopPropagation();
    }

    return (
        <Link
            to={`/images/${encodeURIComponent(shortImageId(image.id))}`}
            className="app-row-link"
            tabIndex={tabIndex}
            draggable={false}
            onClick={handleClick}
        >
            {content}
        </Link>
    );
}

/* The width-less Tags column takes the table's remaining space under the
   fixed layout; the bounded columns hold their pixel widths. No ellipsis on
   Tags — chips wrap onto extra lines instead of being clipped. All data cells
   render through renderRowLinkCell, so the columns live here rather than at
   module level. */
function buildColumns(
    fetcher: DockerFetcherService,
    onMutated: () => void,
): NonNullable<TableProps<ImageSummary>['columns']> {
    const tagsColumn: TableColumnType<ImageSummary> = {
        title: 'Tags',
        key: 'tags',
        render: (_value: unknown, record: ImageSummary) =>
            renderRowLinkCell(renderTags(record.tags), record, false),
    };
    const imageIdColumn: TableColumnType<ImageSummary> = {
        title: 'Image ID',
        key: 'id',
        width: 140,
        render: (_value: unknown, record: ImageSummary) =>
            renderRowLinkCell(
                <Tooltip title={record.id}>
                    <Typography.Text code>{shortImageId(record.id)}</Typography.Text>
                </Tooltip>,
                record,
                true,
            ),
    };
    const sizeColumn: TableColumnType<ImageSummary> = {
        title: 'Size',
        key: 'sizeBytes',
        width: 110,
        render: (_value: unknown, record: ImageSummary) =>
            renderRowLinkCell(formatSizeBytes(record.sizeBytes), record, false),
    };
    const createdColumn: TableColumnType<ImageSummary> = {
        title: 'Created',
        key: 'createdAt',
        width: 130,
        render: (_value: unknown, record: ImageSummary) =>
            renderRowLinkCell(
                <Tooltip title={formatTimestamp(record.createdAt)}>{formatCreatedAt(record.createdAt)}</Tooltip>,
                record,
                false,
            ),
    };
    const actionsColumn: TableColumnType<ImageSummary> = {
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
    };
    return [tagsColumn, imageIdColumn, sizeColumn, createdColumn, actionsColumn];
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

    function handleEmptyStateLinkClick(event: MouseEvent<HTMLElement>): void {
        navigateOnPlainClick(event, navigate, GITHUB_WIZARD_PATH);
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
                    emptyText: (
                        <>
                            No platform-built images yet. Build one from a GitHub repository via{' '}
                            <Typography.Link href={GITHUB_WIZARD_PATH} onClick={handleEmptyStateLinkClick}>
                                New Service &gt; GitHub Repository
                            </Typography.Link>.
                        </>
                    ),
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
