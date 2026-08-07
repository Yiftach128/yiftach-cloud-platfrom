import { App as AntdApp, Flex } from 'antd';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';

import type {
    BuildJob,
    ContainerDetails,
    CreateContainerRequest,
    ImagePreset,
    PortMappingRequest,
    PresetEnvVar,
    StartBuildRequest,
} from '../fetchers/interfaces.ts';
import BuildProgressPanel from './build-progress-panel.tsx';
import ContainerConfigForm from './container-config-form.tsx';
import { toErrorText } from './container-format.ts';
import type {
    ContainerConfigFormValues,
    ContainerSourceKind,
    EnvRowValue,
    NewContainerPhase,
    NewContainerWizardProps,
    PortRowValue,
} from './interfaces.ts';
import PresetSelect from './preset-select.tsx';
import SourceKindSelect from './source-kind-select.tsx';

/** Source kind by its URL step segment (/containers/new/<segment>), and the inverse. */
const SEGMENT_TO_KIND: Record<string, ContainerSourceKind> = {
    database: 'preset',
    image: 'image',
    github: 'github',
};

const KIND_TO_SEGMENT: Record<ContainerSourceKind, string> = {
    preset: 'database',
    image: 'image',
    github: 'github',
};

function buildInitialValues(preset: ImagePreset | null): ContainerConfigFormValues {
    if (preset === null) {
        return { name: '', ports: [{}], extraEnv: [] };
    }

    const presetEnv: Record<string, string> = {};
    for (const envVar of preset.envVars) {
        if (envVar.defaultValue !== undefined) {
            presetEnv[envVar.name] = envVar.defaultValue;
        }
    }

    return {
        name: preset.name,
        ports: [{ hostPort: preset.containerPort, containerPort: preset.containerPort }],
        presetEnv: presetEnv,
        extraEnv: [],
    };
}

function toPortRequests(rows: PortRowValue[]): PortMappingRequest[] {
    const ports: PortMappingRequest[] = [];
    for (const row of rows) {
        if (row.hostPort !== undefined && row.containerPort !== undefined) {
            ports.push({ hostPort: row.hostPort, containerPort: row.containerPort });
        }
    }
    return ports;
}

function toEnvRecord(values: ContainerConfigFormValues): Record<string, string> {
    // Blank values are omitted, never sent as empty strings — an empty
    // MONGO_INITDB_ROOT_PASSWORD is not the same as an unset one.
    const env: Record<string, string> = {};
    if (values.presetEnv !== undefined) {
        for (const [name, value] of Object.entries(values.presetEnv)) {
            if (value !== undefined && value !== '') {
                env[name] = value;
            }
        }
    }
    for (const row of values.extraEnv) {
        const envRow: EnvRowValue = row;
        if (envRow.name !== undefined && envRow.name !== '' && envRow.value !== undefined) {
            env[envRow.name] = envRow.value;
        }
    }
    return env;
}

function toCreateRequest(values: ContainerConfigFormValues, image: string): CreateContainerRequest {
    return {
        name: values.name,
        image: image,
        ports: toPortRequests(values.ports),
        env: toEnvRecord(values),
    };
}

function toStartBuildRequest(values: ContainerConfigFormValues, gitUrl: string): StartBuildRequest {
    return {
        gitUrl: gitUrl,
        name: values.name,
        ports: toPortRequests(values.ports),
        env: toEnvRecord(values),
    };
}

/**
 * The /containers/new flow: choose a source on the opening card screen
 * (database preset, docker image reference, or a public GitHub repository),
 * fill the shared config form, create. The step lives in the URL
 * (/containers/new/:source?), so the header breadcrumb both reflects and
 * drives it — its root crumb navigates back to the card screen. Preset and
 * image creates are one synchronous call; the GitHub source enqueues a build
 * job carrying the whole container config — the builder service builds the
 * image and creates the container server-side, while this wizard just watches
 * the job (via {@link BuildProgressPanel}) and opens the container when the
 * job succeeds. The form is remounted (via `key`) whenever the source or the
 * chosen preset changes, so its initialValues re-apply.
 */
function NewContainerWizard(props: NewContainerWizardProps): ReactElement {
    const app = AntdApp.useApp();
    const navigate = useNavigate();
    const params = useParams();
    const [searchParams] = useSearchParams();
    const [selectedPreset, setSelectedPreset] = useState<ImagePreset | null>(null);
    const [pending, setPending] = useState<boolean>(false);
    const [phase, setPhase] = useState<NewContainerPhase>('configure');
    const [buildJobId, setBuildJobId] = useState<string | null>(null);
    /** The form values a GitHub build was started with; restored when returning to the form. */
    const [savedValues, setSavedValues] = useState<ContainerConfigFormValues | null>(null);

    /* null = the card screen (no :source segment). An unrecognized segment
       redirects back to the cards instead of rendering a broken step. */
    let sourceKind: ContainerSourceKind | null;
    let unknownSource: boolean;
    const sourceSegment = params['source'];
    if (sourceSegment === undefined) {
        sourceKind = null;
        unknownSource = false;
    } else {
        const kind: ContainerSourceKind | undefined = SEGMENT_TO_KIND[sourceSegment];
        if (kind === undefined) {
            sourceKind = null;
            unknownSource = true;
        } else {
            sourceKind = kind;
            unknownSource = false;
        }
    }

    /* ?image=<tag> deep-links from the My Images page; only the image source
       step consumes it — other steps ignore a stray param. */
    let prefillImage: string | null;
    const imageParam: string | null = searchParams.get('image');
    if (sourceKind === 'image' && imageParam !== null && imageParam !== '') {
        prefillImage = imageParam;
    } else {
        prefillImage = null;
    }

    async function createAndOpen(values: ContainerConfigFormValues, image: string): Promise<void> {
        const details: ContainerDetails = await props.fetcher.createContainer(
            toCreateRequest(values, image),
        );
        app.message.success('Container created');
        navigate(`/services/${encodeURIComponent(details.name)}`);
    }

    async function handleSubmit(values: ContainerConfigFormValues): Promise<void> {
        if (sourceKind === null) {
            return; // unreachable: the form only renders after a card is chosen
        }
        if (sourceKind === 'github') {
            if (values.gitUrl === undefined) {
                return;
            }
            setPending(true);
            try {
                const job = await props.fetcher.startBuild(
                    toStartBuildRequest(values, values.gitUrl.trim()),
                );
                setSavedValues(values);
                setBuildJobId(job.id);
                setPhase('building');
            } catch (error) {
                app.message.error(toErrorText(error));
            } finally {
                setPending(false);
            }
            return;
        }

        let image: string;
        if (sourceKind === 'preset') {
            if (selectedPreset === null) {
                return;
            }
            image = selectedPreset.image;
        } else {
            if (values.image === undefined) {
                return;
            }
            image = values.image.trim();
        }

        setPending(true);
        try {
            await createAndOpen(values, image);
        } catch (error) {
            app.message.error(toErrorText(error));
            setPending(false); // on success the wizard unmounts via navigation
        }
    }

    function handleBuildSucceeded(job: BuildJob): void {
        /* The builder already created the container before the job turned
           'succeeded' — nothing left to do but open it. */
        app.message.success('Container created');
        navigate(`/services/${encodeURIComponent(job.containerName)}`);
    }

    function handleBuildBack(): void {
        setPhase('configure');
        setBuildJobId(null);
    }

    if (unknownSource) {
        return <Navigate to="/containers/new" replace />;
    }

    if (sourceKind === null) {
        return (
            <SourceKindSelect
                onSelect={(kind: ContainerSourceKind) =>
                    navigate(`/containers/new/${KIND_TO_SEGMENT[kind]}`)}
            />
        );
    }

    /* Only the GitHub step shows the running build; navigating to another step
       mid-build shows that step while the builder keeps working, and returning
       here re-mounts the panel, which resumes polling the same job. */
    if (sourceKind === 'github' && phase !== 'configure' && buildJobId !== null) {
        return (
            <BuildProgressPanel
                fetcher={props.fetcher}
                jobId={buildJobId}
                onSucceeded={handleBuildSucceeded}
                onBack={handleBuildBack}
            />
        );
    }

    let presetPicker: ReactElement | null;
    if (sourceKind === 'preset') {
        let selectedName: string | null;
        if (selectedPreset === null) {
            selectedName = null;
        } else {
            selectedName = selectedPreset.name;
        }
        presetPicker = (
            <PresetSelect
                fetcher={props.fetcher}
                selectedName={selectedName}
                onSelect={(preset: ImagePreset) => setSelectedPreset(preset)}
            />
        );
    } else {
        presetPicker = null;
    }

    let form: ReactElement | null;
    if (sourceKind === 'preset' && selectedPreset === null) {
        form = null; // nothing to configure until a preset is picked
    } else {
        let formKey: string;
        let initialPreset: ImagePreset | null;
        if (sourceKind === 'preset' && selectedPreset !== null) {
            formKey = `preset:${selectedPreset.name}`;
            initialPreset = selectedPreset;
        } else if (prefillImage !== null) {
            /* Folding the prefill into the key remounts the form when the
               ?image= param changes, so the new value re-applies. Keys stay
               distinct from the bare 'image' (no param) and 'preset:*' forms. */
            formKey = `image:${prefillImage}`;
            initialPreset = null;
        } else {
            formKey = sourceKind;
            initialPreset = null;
        }

        let initialValues: ContainerConfigFormValues;
        if (sourceKind === 'github' && savedValues !== null) {
            initialValues = savedValues; // restore what the build was started with
        } else {
            initialValues = buildInitialValues(initialPreset);
            if (prefillImage !== null) {
                initialValues.image = prefillImage;
            }
        }

        let presetEnvVars: PresetEnvVar[] | undefined;
        if (initialPreset === null) {
            presetEnvVars = undefined;
        } else {
            presetEnvVars = initialPreset.envVars;
        }

        form = (
            <ContainerConfigForm
                key={formKey}
                sourceKind={sourceKind}
                initialValues={initialValues}
                presetEnvVars={presetEnvVars}
                pending={pending}
                onSubmit={handleSubmit}
            />
        );
    }

    return (
        <Flex vertical gap={24}>
            {presetPicker}
            {form}
        </Flex>
    );
}

export default NewContainerWizard;
