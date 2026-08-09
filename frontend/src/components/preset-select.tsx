import { Alert, Card, Flex, Skeleton, Typography } from 'antd';
import type { ReactElement } from 'react';

import { DockerFetcherError } from '../fetchers/docker-fetcher-error.ts';
import type { ImagePreset } from '../fetchers/interfaces.ts';
import { useFetchedData } from '../hooks/use-fetched-data.ts';
import type { FetchedData } from '../hooks/interfaces.ts';
import type { PresetSelectProps } from './interfaces.ts';

/** Matches the theme's grey primary; drawn as a stronger border on the selected card. */
const SELECTED_BORDER = '2px solid #595959';

function describeLoadError(error: unknown): string {
    if (error instanceof DockerFetcherError) {
        return error.message;
    }
    return 'Unexpected error while loading presets';
}

function PresetSelect(props: PresetSelectProps): ReactElement {
    const fetched: FetchedData<ImagePreset[]> = useFetchedData<ImagePreset[]>({
        fetch: () => props.fetcher.getImagePresets(),
        describeError: describeLoadError,
        requestKey: 'presets',
        resetOnKeyChange: true,
    });

    if (fetched.data === null && fetched.errorMessage !== null) {
        return (
            <Alert
                type="error"
                showIcon
                message="Failed to load presets"
                description={fetched.errorMessage}
            />
        );
    }
    if (fetched.data === null) {
        return <Skeleton active paragraph={{ rows: 3 }} />;
    }
    const presets: ImagePreset[] = fetched.data;

    return (
        <Flex gap={16} wrap>
            {presets.map((preset: ImagePreset) => {
                let border: string | undefined;
                if (preset.name === props.selectedName) {
                    border = SELECTED_BORDER;
                } else {
                    border = undefined;
                }
                return (
                    <Card
                        key={preset.name}
                        hoverable
                        onClick={() => props.onSelect(preset)}
                        style={{ width: 260, border: border }}
                    >
                        <Flex vertical gap={4}>
                            <Typography.Text strong>{preset.displayName}</Typography.Text>
                            <Typography.Text type="secondary">{preset.description}</Typography.Text>
                            <Typography.Text code>{preset.image}</Typography.Text>
                        </Flex>
                    </Card>
                );
            })}
        </Flex>
    );
}

export default PresetSelect;
