import { Alert, Card, Flex, Skeleton, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

import { DockerFetcherError } from '../fetchers/docker-fetcher-error.ts';
import type { ImagePreset } from '../fetchers/interfaces.ts';
import type { PresetSelectProps } from './interfaces.ts';

/** Matches the theme's grey primary; drawn as a stronger border on the selected card. */
const SELECTED_BORDER = '2px solid #595959';

function PresetSelect(props: PresetSelectProps): ReactElement {
    const [presets, setPresets] = useState<ImagePreset[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let disposed = false;

        async function load(): Promise<void> {
            try {
                const fetched: ImagePreset[] = await props.fetcher.getImagePresets();
                if (!disposed) {
                    setPresets(fetched);
                    setIsLoading(false);
                }
            } catch (error) {
                if (!disposed) {
                    if (error instanceof DockerFetcherError) {
                        setErrorMessage(error.message);
                    } else {
                        setErrorMessage('Unexpected error while loading presets');
                    }
                    setIsLoading(false);
                }
            }
        }

        void load();
        return () => {
            disposed = true;
        };
    }, [props.fetcher]);

    if (errorMessage !== null) {
        return (
            <Alert
                type="error"
                showIcon
                message="Failed to load presets"
                description={errorMessage}
            />
        );
    }
    if (isLoading) {
        return <Skeleton active paragraph={{ rows: 3 }} />;
    }

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
