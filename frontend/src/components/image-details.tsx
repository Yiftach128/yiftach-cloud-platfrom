import { Alert, Descriptions, Divider, Flex, Skeleton, Tag, Tooltip, Typography } from 'antd';
import type { DescriptionsProps } from 'antd';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

dayjs.extend(relativeTime);

import { DockerFetcherError } from '../fetchers/docker-fetcher-error.ts';
import type { ImageDetails as ImageDetailsData, ImageExposedPort } from '../fetchers/interfaces.ts';
import { formatTimestamp } from './container-format.ts';
import ImageControls from './image-controls.tsx';
import { formatSizeBytes } from './image-format.ts';
import type { ImageDetailsProps } from './interfaces.ts';

/**
 * Provenance labels the builder stamps on every image it builds — a
 * hand-maintained mirror of the names in
 * builder-service-backend/src/services/worker/build-worker.ts.
 */
const REPO_URL_LABEL = 'cloudplatform.repo-url';
const GIT_REF_LABEL = 'cloudplatform.git-ref';
const COMMIT_LABEL = 'cloudplatform.commit';
const BUILD_JOB_ID_LABEL = 'cloudplatform.build-job-id';

function formatRelative(iso: string): string {
    return dayjs(iso).fromNow();
}

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

function renderExposedPorts(ports: ImageExposedPort[]): ReactElement {
    if (ports.length === 0) {
        return <Typography.Text type="secondary">none declared by the image</Typography.Text>;
    }
    return (
        <Flex wrap gap={12}>
            {ports.map((port: ImageExposedPort) => (
                <Tag key={`${port.port}/${port.protocol}`}>{`${port.port}/${port.protocol}`}</Tag>
            ))}
        </Flex>
    );
}

function buildOverviewItems(details: ImageDetailsData): NonNullable<DescriptionsProps['items']> {
    let platform: string;
    if (details.os !== '' && details.architecture !== '') {
        platform = `${details.os}/${details.architecture}`;
    } else {
        platform = details.os + details.architecture;
    }
    return [
        { key: 'tags', label: 'Tags', children: renderTags(details.tags) },
        { key: 'id', label: 'Image ID', children: <Typography.Text code>{details.id}</Typography.Text> },
        { key: 'size', label: 'Size', children: formatSizeBytes(details.sizeBytes) },
        {
            key: 'createdAt',
            label: 'Created',
            children: <Tooltip title={formatRelative(details.createdAt)}>{formatTimestamp(details.createdAt)}</Tooltip>,
        },
        { key: 'platform', label: 'Platform', children: platform },
        { key: 'exposedPorts', label: 'Exposed ports', children: renderExposedPorts(details.exposedPorts) },
    ];
}

function buildProvenanceItems(labels: Record<string, string>): NonNullable<DescriptionsProps['items']> {
    const repoUrl: string | undefined = labels[REPO_URL_LABEL];
    let repository: ReactElement;
    if (repoUrl !== undefined) {
        repository = (
            <Typography.Link href={repoUrl} target="_blank" rel="noreferrer">
                {repoUrl}
            </Typography.Link>
        );
    } else {
        repository = <Typography.Text type="secondary">—</Typography.Text>;
    }

    const gitRef: string | undefined = labels[GIT_REF_LABEL];
    let branchOrTag: ReactElement;
    if (gitRef !== undefined) {
        branchOrTag = <>{gitRef}</>;
    } else {
        branchOrTag = <Typography.Text type="secondary">default branch</Typography.Text>;
    }

    const commit: string | undefined = labels[COMMIT_LABEL];
    let commitValue: ReactElement;
    if (commit !== undefined) {
        commitValue = <Typography.Text code>{commit}</Typography.Text>;
    } else {
        commitValue = <Typography.Text type="secondary">—</Typography.Text>;
    }

    const buildJobId: string | undefined = labels[BUILD_JOB_ID_LABEL];
    let buildJobValue: ReactElement;
    if (buildJobId !== undefined) {
        buildJobValue = <>{buildJobId}</>;
    } else {
        buildJobValue = <Typography.Text type="secondary">—</Typography.Text>;
    }

    return [
        { key: 'repository', label: 'Repository', children: repository },
        { key: 'gitRef', label: 'Branch / tag', children: branchOrTag },
        { key: 'commit', label: 'Commit', children: commitValue },
        { key: 'buildJobId', label: 'Build job ID', children: buildJobValue },
    ];
}

/** True when the image carries at least one of the builder's provenance labels. */
function hasProvenance(labels: Record<string, string>): boolean {
    return labels[REPO_URL_LABEL] !== undefined
        || labels[GIT_REF_LABEL] !== undefined
        || labels[COMMIT_LABEL] !== undefined
        || labels[BUILD_JOB_ID_LABEL] !== undefined;
}

/**
 * Detail view of one platform-built image: the basics (tags, id, size,
 * created, platform), the ports the Dockerfile EXPOSEs, and the build
 * provenance the builder stamped as labels.
 */
function ImageDetails(props: ImageDetailsProps): ReactElement {
    const [details, setDetails] = useState<ImageDetailsData | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    useEffect(() => {
        let disposed: boolean = false;

        /* The component stays mounted when only :imageId changes, so every
           (re-)fetch starts from a clean slate. */
        setIsLoading(true);
        setErrorMessage(null);
        setDetails(null);

        props.fetcher.getImageDetails(props.imageId)
            .then((result: ImageDetailsData) => {
                if (!disposed) {
                    setDetails(result);
                    setIsLoading(false);
                }
            })
            .catch((error: unknown) => {
                if (!disposed) {
                    if (error instanceof DockerFetcherError) {
                        if (error.status === 404) {
                            setErrorMessage(`No image "${props.imageId}" was found.`);
                        } else {
                            setErrorMessage(error.message);
                        }
                    } else {
                        setErrorMessage('Unexpected error while loading image details');
                    }
                    setIsLoading(false);
                }
            });

        return () => {
            disposed = true;
        };
    }, [props.fetcher, props.imageId]);

    if (errorMessage !== null) {
        return (
            <Alert
                type="error"
                showIcon
                message="Failed to load image"
                description={errorMessage}
            />
        );
    }
    if (isLoading) {
        return <Skeleton active paragraph={{ rows: 6 }} />;
    }
    if (details === null) {
        return (
            <Alert
                type="error"
                showIcon
                message="Failed to load image"
                description="No image data was returned."
            />
        );
    }

    let provenanceSection: ReactElement;
    if (hasProvenance(details.labels)) {
        provenanceSection = (
            <Descriptions
                title="Build provenance"
                bordered
                size="small"
                column={1}
                items={buildProvenanceItems(details.labels)}
            />
        );
    } else {
        provenanceSection = (
            <div>
                <Typography.Title level={5}>Build provenance</Typography.Title>
                <Typography.Text type="secondary">
                    None recorded — this image was built before the platform stamped provenance labels.
                    Rebuilding it records the repository, branch, commit, and build job.
                </Typography.Text>
            </div>
        );
    }

    let primaryTag: string | null;
    const firstTag: string | undefined = details.tags[0];
    if (firstTag !== undefined) {
        primaryTag = firstTag;
    } else {
        primaryTag = null;
    }

    return (
        <Flex vertical gap={24}>
            <ImageControls fetcher={props.fetcher} imageId={details.id} primaryTag={primaryTag} />
            <Divider style={{ margin: 0 }} />
            <Descriptions title="Overview" bordered size="small" column={1} items={buildOverviewItems(details)} />
            {provenanceSection}
        </Flex>
    );
}

export default ImageDetails;
