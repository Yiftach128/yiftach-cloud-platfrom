import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { AutoComplete, Button, Flex, Form, Input, InputNumber, Tooltip, Typography } from 'antd';
import type { Rule } from 'antd/es/form';
import { useRef, useState } from 'react';
import type { FocusEvent, ReactElement } from 'react';

import type { PresetEnvVar } from '../fetchers/interfaces.ts';
import { GIT_REF_PATTERN, normalizeGitHubUrl } from './git-url.ts';
import type {
    ContainerConfigFormProps,
    ContainerConfigFormValues,
    GitHubUrlParts,
    PortRowValue,
} from './interfaces.ts';
import { CONTAINER_NAME_PATTERN, suggestContainerName } from './name-defaults.ts';
import { buildLockedPortRows, MAX_PORT, MIN_PORT } from './port-defaults.ts';

/** Mirror of the backend's env name rule (services/validation/parse-container-fields.ts). */
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Light sanity only — the daemon is authoritative on the reference grammar. */
const IMAGE_REF_PATTERN = /^\S+$/;
/**
 * Anchored to exactly owner/repository, like the backend
 * (services/validation/parse-start-build-request.ts). URLs the blur
 * normalization can rewrite (a "/tree/branch" paste) never reach this rule
 * in their raw form; anything it can't fix errors inline instead of 400ing
 * after submit.
 */
const GITHUB_URL_PATTERN = /^https:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?\/?$/;

/**
 * True when every ports row is still auto-seeded (locked) or empty — the
 * state an EXPOSE lookup may replace without discarding user input.
 */
function arePortRowsAutoSeeded(rows: PortRowValue[]): boolean {
    for (const row of rows) {
        if (row === undefined || row === null) {
            continue;
        }
        if (row.locked === true) {
            continue;
        }
        if (row.hostPort !== undefined || row.containerPort !== undefined) {
            return false;
        }
    }
    return true;
}
/** Mirror of the backend's image name rule (services/validation/parse-start-build-request.ts). */
const IMAGE_NAME_PATTERN =
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[A-Za-z0-9_][A-Za-z0-9._-]{0,127})?$/;
/**
 * The shared configuration form for every create source. The source kind only
 * changes which source field shows (presets carry their image; the image kind
 * offers a picker over the platform's managed images, and free text still
 * accepts any registry reference); name, ports, and env work identically.
 * Preset env vars render as fixed rows straight from the preset's metadata.
 * Ports rows seeded from trusted image metadata render their container port
 * locked (editing the image reference soft-unlocks them) — for managed images
 * via the ?image= prefill, and for free-typed references via a best-effort
 * EXPOSE lookup on blur that works once the image is local. Host ports are
 * checked inline against the ports running containers already publish. Names
 * are checked the same way against all existing containers. A pasted GitHub
 * URL is normalized on blur — a "/tree/branch" address-bar paste splits into
 * the repository root and the Branch / tag field, and the repo name becomes
 * the suggested container name unless the user already typed one.
 */
function ContainerConfigForm(props: ContainerConfigFormProps): ReactElement {
    const [form] = Form.useForm<ContainerConfigFormValues>();
    /* Watching the image field powers the soft-unlock check and re-renders
       the ports rows as the reference is edited. */
    const imageValue: string | undefined = Form.useWatch('image', form);
    /* The last name this form suggested from a GitHub repo — a name equal to
       it is still "untouched" and may be replaced by a newer suggestion. */
    const lastSuggestedNameRef = useRef<string | null>(null);
    /* The free-typed reference whose EXPOSE lookup seeded the current locked
       ports rows; editing the reference away from it soft-unlocks them. */
    const [fetchedPortsImage, setFetchedPortsImage] = useState<string | null>(null);
    const pendingLookupRef = useRef<string | null>(null);

    function handleImageBlur(): void {
        if (props.onLookupExposedPorts === undefined) {
            return;
        }
        const lookup: (reference: string) => Promise<number[]> = props.onLookupExposedPorts;
        const rawReference: string | undefined = form.getFieldValue('image');
        if (rawReference === undefined) {
            return;
        }
        const reference: string = rawReference.trim();
        if (reference === '') {
            return;
        }
        /* Already seeded (or being looked up); the deep-link/picker path owns
           props.prefillImage itself. */
        if (reference === props.prefillImage || reference === fetchedPortsImage
            || reference === pendingLookupRef.current) {
            return;
        }
        pendingLookupRef.current = reference;
        lookup(reference)
            .then((tcpPorts: number[]) => {
                if (pendingLookupRef.current === reference) {
                    pendingLookupRef.current = null;
                }
                if (tcpPorts.length === 0) {
                    return;
                }
                /* Guards run at response time (the daemon may boot for ~10s):
                   the reference must still be in the field, and only
                   auto-seeded or still-empty rows may be replaced — a port
                   the user typed meanwhile is never overwritten. */
                const currentReference: string | undefined = form.getFieldValue('image');
                if (currentReference === undefined || currentReference.trim() !== reference) {
                    return;
                }
                const currentRows: PortRowValue[] | undefined = form.getFieldValue('ports');
                if (currentRows !== undefined && !arePortRowsAutoSeeded(currentRows)) {
                    return;
                }
                form.setFieldsValue({ ports: buildLockedPortRows(tcpPorts, props.takenHostPorts) });
                setFetchedPortsImage(reference);
            })
            .catch(() => {
                /* Not local, or the daemon is down — best-effort, rows stay. */
                if (pendingLookupRef.current === reference) {
                    pendingLookupRef.current = null;
                }
            });
    }

    function handleGitUrlBlur(event: FocusEvent<HTMLInputElement>): void {
        const parts: GitHubUrlParts | null = normalizeGitHubUrl(event.target.value);
        if (parts === null) {
            return; // not a normalizable GitHub URL; the pattern rule owns the error
        }

        if (parts.gitUrl !== event.target.value.trim()) {
            form.setFieldsValue({ gitUrl: parts.gitUrl });
        }

        if (parts.gitRef !== undefined) {
            const currentRef: string | undefined = form.getFieldValue('gitRef');
            /* A filled Branch / tag field wins over the URL's ref; the URL is
               stripped bare either way, so the composed build request can
               never carry two "#". */
            if (currentRef === undefined || currentRef === '') {
                form.setFieldsValue({ gitRef: parts.gitRef });
            }
        }

        const currentName: string | undefined = form.getFieldValue('name');
        if (currentName === undefined || currentName === ''
            || currentName === lastSuggestedNameRef.current) {
            const suggestion: string = suggestContainerName(parts.repo, props.takenNames);
            if (suggestion !== '') {
                form.setFieldsValue({ name: suggestion });
                lastSuggestedNameRef.current = suggestion;
            }
        }

        /* setFieldsValue does not re-run rules; re-validate to clear a stale
           inline error left by the pre-normalized paste. */
        form.validateFields(['gitUrl']).catch(() => {});
    }

    function handleImageSelect(value: string): void {
        if (props.onManagedImageSelected !== undefined) {
            props.onManagedImageSelected(value);
        }
    }

    function filterImageOption(inputValue: string, option?: { value: string }): boolean {
        if (option === undefined) {
            return false;
        }
        return option.value.toLowerCase().includes(inputValue.toLowerCase());
    }

    let sourceField: ReactElement | null;
    if (props.sourceKind === 'image') {
        let managedImageTags: string[];
        if (props.managedImageTags === undefined) {
            managedImageTags = [];
        } else {
            managedImageTags = props.managedImageTags;
        }
        const imageOptions: { value: string }[] = managedImageTags.map(
            (tag: string) => ({ value: tag }),
        );
        sourceField = (
            <Form.Item
                label="Image reference"
                name="image"
                extra="Pick a platform-built image to prefill its ports, or type any registry reference."
                rules={[
                    { required: true, message: 'Enter an image reference' },
                    { pattern: IMAGE_REF_PATTERN, message: 'An image reference has no spaces' },
                ]}
            >
                <AutoComplete
                    options={imageOptions}
                    filterOption={filterImageOption}
                    onSelect={(value: string) => handleImageSelect(value)}
                    onBlur={handleImageBlur}
                    placeholder="nginx:latest or ghcr.io/owner/name:tag"
                />
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
                    <Input placeholder="https://github.com/owner/repository" onBlur={handleGitUrlBlur} />
                </Form.Item>
                <Form.Item
                    label="Branch / tag"
                    name="gitRef"
                    extra="Optional — a branch or tag name; empty builds the default branch."
                    rules={[
                        { pattern: GIT_REF_PATTERN, message: 'Letters, digits, "/", "_", "." or "-" only' },
                    ]}
                >
                    <Input placeholder="main or v1.2" />
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
            form={form}
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
                    {
                        validator: (_rule, value: string | undefined) => {
                            if (value === undefined || value === '') {
                                return Promise.resolve(); // the required rule owns emptiness
                            }
                            if (props.takenNames.has(value)) {
                                return Promise.reject(new Error(
                                    `A container named "${value}" already exists`,
                                ));
                            }
                            return Promise.resolve();
                        },
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
                        {fields.map((field) => {
                            const row: PortRowValue | undefined = form.getFieldValue(['ports', field.name]);

                            /* A locked row's container port renders read-only:
                               unconditionally for presets, and for image-seeded
                               rows only while the image field still matches
                               their source — editing the reference soft-unlocks
                               them instead of trapping stale values. A blur
                               lookup replaces all locked rows, so once it has
                               fired it is the authoritative source. */
                            let effectiveLocked: boolean;
                            if (row !== undefined && row.locked === true) {
                                if (fetchedPortsImage !== null) {
                                    effectiveLocked = imageValue !== undefined
                                        && imageValue.trim() === fetchedPortsImage;
                                } else if (props.prefillImage === undefined) {
                                    effectiveLocked = true;
                                } else if (imageValue === props.prefillImage) {
                                    effectiveLocked = true;
                                } else {
                                    effectiveLocked = false;
                                }
                            } else {
                                effectiveLocked = false;
                            }

                            let containerPortTooltip: string | undefined;
                            if (effectiveLocked) {
                                containerPortTooltip = 'Fixed by the image — its Dockerfile declares this port';
                            } else {
                                containerPortTooltip = undefined;
                            }

                            return (
                                <Flex key={field.key} gap={8} align="baseline">
                                    <Form.Item
                                        name={[field.name, 'hostPort']}
                                        style={{ marginBottom: 0 }}
                                        rules={[
                                            { required: true, message: 'Host port' },
                                            {
                                                validator: (_rule, value: number | null | undefined) => {
                                                    if (value === undefined || value === null) {
                                                        return Promise.resolve(); // the required rule owns emptiness
                                                    }
                                                    if (props.takenHostPorts.has(value)) {
                                                        return Promise.reject(new Error(
                                                            `Port ${value} is already used by another container`,
                                                        ));
                                                    }
                                                    return Promise.resolve();
                                                },
                                            },
                                        ]}
                                    >
                                        <InputNumber min={MIN_PORT} max={MAX_PORT} placeholder="Host port" style={{ width: 130 }} />
                                    </Form.Item>
                                    <Typography.Text type="secondary">→</Typography.Text>
                                    {/* The span receives the Tooltip's hover handlers —
                                        Form.Item would swallow them, and a Tooltip between
                                        the item and the input would swallow the value
                                        injection instead. */}
                                    <Tooltip title={containerPortTooltip}>
                                        <span>
                                            <Form.Item
                                                name={[field.name, 'containerPort']}
                                                rules={[{ required: true, message: 'Container port' }]}
                                                noStyle
                                            >
                                                <InputNumber
                                                    min={MIN_PORT}
                                                    max={MAX_PORT}
                                                    placeholder="Container port"
                                                    disabled={effectiveLocked}
                                                    style={{ width: 130 }}
                                                />
                                            </Form.Item>
                                        </span>
                                    </Tooltip>
                                    <Button
                                        icon={<DeleteOutlined />}
                                        aria-label="Remove port"
                                        onClick={() => operations.remove(field.name)}
                                    />
                                </Flex>
                            );
                        })}
                        <Button icon={<PlusOutlined />} style={{ width: 130 }} onClick={() => operations.add({ locked: false })}>
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
