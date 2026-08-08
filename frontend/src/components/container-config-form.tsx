import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Flex, Form, Input, InputNumber, Typography } from 'antd';
import type { Rule } from 'antd/es/form';
import type { ReactElement } from 'react';

import type { PresetEnvVar } from '../fetchers/interfaces.ts';
import type { ContainerConfigFormProps, ContainerConfigFormValues } from './interfaces.ts';

/** Mirror of the backend's rules (services/validation/parse-create-container-request.ts). */
const CONTAINER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/;
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Light sanity only — the daemon is authoritative on the reference grammar. */
const IMAGE_REF_PATTERN = /^\S+$/;
/** Mirror of the backend's GitHub URL rule (services/validation/parse-start-build-request.ts). */
const GITHUB_URL_PATTERN = /^https:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/;
/** Mirror of the backend's image name rule (services/validation/parse-start-build-request.ts). */
const IMAGE_NAME_PATTERN =
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[A-Za-z0-9_][A-Za-z0-9._-]{0,127})?$/;
const MIN_PORT = 1;
const MAX_PORT = 65535;

/**
 * The shared configuration form for every create source. The source kind only
 * changes which source field shows (presets carry their image; the other kinds
 * ask for it); name, ports, and env work identically. Preset env vars render as
 * fixed rows straight from the preset's metadata.
 */
function ContainerConfigForm(props: ContainerConfigFormProps): ReactElement {
    let sourceField: ReactElement | null;
    if (props.sourceKind === 'image') {
        sourceField = (
            <Form.Item
                label="Image reference"
                name="image"
                rules={[
                    { required: true, message: 'Enter an image reference' },
                    { pattern: IMAGE_REF_PATTERN, message: 'An image reference has no spaces' },
                ]}
            >
                <Input placeholder="nginx:latest or ghcr.io/owner/name:tag" />
            </Form.Item>
        );
    } else if (props.sourceKind === 'github') {
        sourceField = (
            <>
                <Form.Item
                    label="GitHub repository"
                    name="gitUrl"
                    extra="A public repository with a Dockerfile at its root."
                    rules={[
                        { required: true, message: 'Enter a repository URL' },
                        { pattern: GITHUB_URL_PATTERN, message: 'Use https://github.com/owner/repository' },
                    ]}
                >
                    <Input placeholder="https://github.com/owner/repository" />
                </Form.Item>
                <Form.Item
                    label="Image name"
                    name="imageName"
                    extra={'Optional — becomes the built image\'s tag (a bare name means ":latest", '
                        + 'and rebuilding the same name moves the tag). Empty = auto-generated.'}
                    rules={[
                        {
                            pattern: IMAGE_NAME_PATTERN,
                            message: 'Lowercase name, optional :tag — e.g. my-app or team/my-app:v2',
                        },
                    ]}
                >
                    <Input placeholder="my-app or my-app:v2 (leave empty to auto-generate)" />
                </Form.Item>
            </>
        );
    } else {
        sourceField = null;
    }

    let presetEnvItems: ReactElement | null;
    if (props.presetEnvVars !== undefined && props.presetEnvVars.length > 0) {
        presetEnvItems = (
            <>
                <Typography.Text strong>Environment</Typography.Text>
                {props.presetEnvVars.map((envVar: PresetEnvVar) => {
                    const rules: Rule[] = [];
                    if (envVar.required) {
                        rules.push({ required: true, message: `${envVar.name} is required` });
                    }
                    return (
                        <Form.Item
                            key={envVar.name}
                            label={envVar.name}
                            name={['presetEnv', envVar.name]}
                            extra={envVar.description}
                            rules={rules}
                        >
                            <Input />
                        </Form.Item>
                    );
                })}
            </>
        );
    } else {
        presetEnvItems = null;
    }

    return (
        <Form<ContainerConfigFormValues>
            layout="vertical"
            initialValues={props.initialValues}
            onFinish={props.onSubmit}
            disabled={props.pending}
            style={{ maxWidth: 560 }}
        >
            <Form.Item
                label="Container name"
                name="name"
                rules={[
                    { required: true, message: 'Enter a container name' },
                    {
                        pattern: CONTAINER_NAME_PATTERN,
                        message: '1-63 letters, digits, "_", "." or "-", starting with a letter or digit',
                    },
                ]}
            >
                <Input placeholder="my-service" />
            </Form.Item>

            {sourceField}

            <Typography.Text strong>Published ports</Typography.Text>
            <Form.List name="ports">
                {(fields, operations) => (
                    <Flex vertical gap={8} style={{ marginTop: 8, marginBottom: 16 }}>
                        {fields.map((field) => (
                            <Flex key={field.key} gap={8} align="baseline">
                                <Form.Item
                                    name={[field.name, 'hostPort']}
                                    rules={[{ required: true, message: 'Host port' }]}
                                    noStyle
                                >
                                    <InputNumber min={MIN_PORT} max={MAX_PORT} placeholder="Host port" style={{ width: 130 }} />
                                </Form.Item>
                                <Typography.Text type="secondary">→</Typography.Text>
                                <Form.Item
                                    name={[field.name, 'containerPort']}
                                    rules={[{ required: true, message: 'Container port' }]}
                                    noStyle
                                >
                                    <InputNumber min={MIN_PORT} max={MAX_PORT} placeholder="Container port" style={{ width: 130 }} />
                                </Form.Item>
                                <Button
                                    icon={<DeleteOutlined />}
                                    aria-label="Remove port"
                                    onClick={() => operations.remove(field.name)}
                                />
                            </Flex>
                        ))}
                        <Button icon={<PlusOutlined />} style={{ width: 130 }} onClick={() => operations.add({})}>
                            Add port
                        </Button>
                    </Flex>
                )}
            </Form.List>

            {presetEnvItems}

            <Typography.Text strong>Extra environment variables</Typography.Text>
            <Form.List name="extraEnv">
                {(fields, operations) => (
                    <Flex vertical gap={8} style={{ marginTop: 8, marginBottom: 16 }}>
                        {fields.map((field) => (
                            <Flex key={field.key} gap={8} align="baseline">
                                <Form.Item
                                    name={[field.name, 'name']}
                                    rules={[
                                        { required: true, message: 'Variable name' },
                                        { pattern: ENV_NAME_PATTERN, message: 'Letters, digits and "_", not starting with a digit' },
                                    ]}
                                    noStyle
                                >
                                    <Input placeholder="NAME" style={{ width: 180 }} />
                                </Form.Item>
                                <Typography.Text type="secondary">=</Typography.Text>
                                <Form.Item name={[field.name, 'value']} noStyle>
                                    <Input placeholder="value" style={{ width: 220 }} />
                                </Form.Item>
                                <Button
                                    icon={<DeleteOutlined />}
                                    aria-label="Remove variable"
                                    onClick={() => operations.remove(field.name)}
                                />
                            </Flex>
                        ))}
                        <Button icon={<PlusOutlined />} style={{ width: 130 }} onClick={() => operations.add({})}>
                            Add variable
                        </Button>
                    </Flex>
                )}
            </Form.List>

            <Form.Item>
                <Flex vertical gap={8} align="flex-start">
                    <Button type="primary" htmlType="submit" loading={props.pending}>
                        Create Container
                    </Button>
                    <Typography.Text type="secondary">
                        Pulling the image may take a few minutes on first use.
                    </Typography.Text>
                </Flex>
            </Form.Item>
        </Form>
    );
}

export default ContainerConfigForm;
