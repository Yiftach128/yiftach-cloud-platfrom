import { App as AntdApp, Flex, Skeleton } from 'antd';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';

import type {
    Container,
    CreateContainerRequest,
    ImageDetails,
    ImageExposedPort,
    ImagePreset,
    ImageSummary,
    PortMappingRequest,
    PresetEnvVar,
    StartBuildRequest,
} from '../fetchers/interfaces.ts';
import { useFetchedData } from '../hooks/use-fetched-data.ts';
import type { FetchedData } from '../hooks/interfaces.ts';
import BuildProgressPanel from './build-progress-panel.tsx';
import ContainerConfigForm from './container-config-form.tsx';
import { toErrorText } from './container-format.ts';
import type {
    AppliedImagePrefill,
    ContainerConfigFormValues,
    ContainerSourceKind,
    EnvRowValue,
    NewContainerPhase,
    NewContainerWizardProps,
    PortRowValue,
    TakenResources,
} from './interfaces.ts';
import { collectTakenNames, deriveNameFromImageReference, suggestContainerName } from './name-defaults.ts';
import { buildLockedPortRows, collectTakenHostPorts } from './port-defaults.ts';
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

function buildInitialValues(
    preset: ImagePreset | null,
    taken: TakenResources,
): ContainerConfigFormValues {
    if (preset === null) {
        return { name: '', ports: [{ locked: false }], extraEnv: [] };
    }

    const presetEnv: Record<string, string> = {};
    for (const envVar of preset.envVars) {
        if (envVar.defaultValue !== undefined) {
            presetEnv[envVar.name] = envVar.defaultValue;
        }
    }

    return {
        name: suggestContainerName(preset.name, taken.names),
        ports: buildLockedPortRows([preset.containerPort], taken.hostPorts),
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
    /* The blur normalization strips any fragment from the URL field, so
       appending the ref here can never produce a second "#". */
    let wireUrl: string;
    if (values.gitRef !== undefined) {
        const gitRef: string = values.gitRef.trim();
        if (gitRef !== '') {
            wireUrl = `${gitUrl}#${gitRef}`;
        } else {
            wireUrl = gitUrl;
        }
    } else {
        wireUrl = gitUrl;
    }
    const request: StartBuildRequest = {
        gitUrl: wireUrl,
        name: values.name,
        ports: toPortRequests(values.ports),
        env: toEnvRecord(values),
    };
    // Blank means "auto-generate" and is simply omitted from the request.
    if (values.imageName !== undefined) {
        const imageName: string = values.imageName.trim();
        if (imageName !== '') {
            request.imageName = imageName;
        }
    }
    return request;
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
 * chosen preset changes, so its initialValues re-apply. The form waits for a
 * snapshot of what existing containers already claim (published host ports and
 * names) — it feeds the default host ports, the suggested container names, and
 * the inline conflict validation. Picking a managed image in the image step's
 * picker updates `?image=`, re-entering the same prefill-and-remount path as a
 * My Images deep link.
 */
function NewContainerWizard(props: NewContainerWizardProps): ReactElement {
    const app = AntdApp.useApp();
    const navigate = useNavigate();
    const params = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
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

    /* One snapshot of what existing containers claim — published host ports
       and names — for default suggestions and the inline conflict validation.
       Best-effort: a failure just means empty sets, falling back to today's
       behavior (the fetch never rejects, so describeError is unreachable). */
    const takenFetched: FetchedData<TakenResources> = useFetchedData<TakenResources>({
        fetch: async (): Promise<TakenResources> => {
            try {
                const containers: Container[] = await props.fetcher.getContainers();
                return {
                    hostPorts: collectTakenHostPorts(containers),
                    names: collectTakenNames(containers),
                };
            } catch {
                return { hostPorts: new Set<number>(), names: new Set<string>() };
            }
        },
        describeError: toErrorText,
        requestKey: 'taken-resources',
        resetOnKeyChange: true,
    });

    /* Managed image tags for the image step's picker. Best-effort: a failure
       leaves the field working as plain free text. Options may arrive after
       the form renders — the picker handles that. */
    const tagsFetched: FetchedData<string[]> = useFetchedData<string[]>({
        fetch: async (): Promise<string[]> => {
            try {
                const images: ImageSummary[] = await props.fetcher.getImages();
                const tags: string[] = [];
                for (const image of images) {
                    for (const tag of image.tags) {
                        tags.push(tag);
                    }
                }
                return tags;
            } catch {
                return [];
            }
        },
        describeError: toErrorText,
        requestKey: 'managed-image-tags',
        resetOnKeyChange: true,
        enabled: sourceKind === 'image',
    });

    /* The applied image prefill: the deep-linked image's EXPOSEd ports feed
       the form's initial port rows. resetOnKeyChange is deliberately false —
       picking a new image keeps the currently rendered form until the new
       image's lookup settles, then the formKey change remounts it with the
       fresh defaults. Best-effort: a failed lookup — image gone, daemon still
       booting — still applies the pick, with the default empty port row. */
    let prefillRequestKey: string;
    if (prefillImage === null) {
        prefillRequestKey = 'none';
    } else {
        prefillRequestKey = `image:${prefillImage}`;
    }
    const prefillFetched: FetchedData<AppliedImagePrefill> = useFetchedData<AppliedImagePrefill>({
        fetch: async (): Promise<AppliedImagePrefill> => {
            if (prefillImage === null) {
                return { image: null, ports: null };
            }
            try {
                const details: ImageDetails = await props.fetcher.getImageDetails(prefillImage);
                /* The create request publishes TCP only, so only TCP EXPOSEs prefill. */
                const ports: number[] = details.exposedPorts
                    .filter((port: ImageExposedPort) => port.protocol === 'tcp')
                    .map((port: ImageExposedPort) => port.port);
                if (ports.length > 0) {
                    return { image: prefillImage, ports: ports };
                }
                return { image: prefillImage, ports: null };
            } catch {
                return { image: prefillImage, ports: null };
            }
        },
        describeError: toErrorText,
        requestKey: prefillRequestKey,
        resetOnKeyChange: false,
        enabled: sourceKind === 'image',
    });

    async function createAndOpen(values: ContainerConfigFormValues, image: string): Promise<void> {
        await props.fetcher.createContainer(toCreateRequest(values, image));
        app.message.success('Container created');
        navigate('/services');
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

    function handleManagedImageSelected(tag: string): void {
        /* Routing the pick through ?image= re-enters the deep-link prefill
           path: same fetch, same form remount — but the current form stays
           rendered until the new image's lookup settles. */
        setSearchParams({ image: tag });
    }

    /* Free-typed references skip the ?image= remount; the form looks their
       EXPOSEs up on blur instead, via the local-image endpoint (works for
       unmanaged images like nginx:latest, but only once they are local). */
    async function lookupExposedTcpPorts(reference: string): Promise<number[]> {
        const ports: ImageExposedPort[] = await props.fetcher.getImageExposedPorts(reference);
        return ports
            .filter((port: ImageExposedPort) => port.protocol === 'tcp')
            .map((port: ImageExposedPort) => port.port);
    }

    function handleBuildSucceeded(): void {
        /* The builder already created the container before the job turned
           'succeeded' — nothing left to do but show the services list. */
        app.message.success('Container created');
        navigate('/services');
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
    } else if (takenFetched.data === null
        || (sourceKind === 'image' && prefillImage !== null && prefillFetched.data === null)) {
        /* The form only mounts once the taken-host-ports snapshot settles, so
           its initialValues already carry the defaults. The prefill clause
           only fires on a cold ?image= deep link — once any prefill state is
           applied, picking a new image keeps the current form rendered until
           the fresh lookup settles (silent swap, no skeleton). */
        form = <Skeleton active paragraph={{ rows: 6 }} />;
    } else {
        const takenResources: TakenResources = takenFetched.data;

        /* The form renders from the *applied* prefill, not the URL param —
           while a newly picked image's lookup is in flight, these still hold
           the previous pick, so the visible form stays a consistent snapshot. */
        let appliedImage: string | null;
        let appliedPorts: number[] | null;
        if (sourceKind === 'image' && prefillFetched.data !== null) {
            appliedImage = prefillFetched.data.image;
            appliedPorts = prefillFetched.data.ports;
        } else {
            appliedImage = null;
            appliedPorts = null;
        }

        let formKey: string;
        let initialPreset: ImagePreset | null;
        if (sourceKind === 'preset' && selectedPreset !== null) {
            formKey = `preset:${selectedPreset.name}`;
            initialPreset = selectedPreset;
        } else if (appliedImage !== null) {
            /* Folding the prefill into the key remounts the form when the
               applied image changes, so the new value re-applies. Keys stay
               distinct from the bare 'image' (no param) and 'preset:*' forms. */
            formKey = `image:${appliedImage}`;
            initialPreset = null;
        } else {
            formKey = sourceKind;
            initialPreset = null;
        }

        let initialValues: ContainerConfigFormValues;
        if (sourceKind === 'github' && savedValues !== null) {
            initialValues = savedValues; // restore what the build was started with
        } else {
            initialValues = buildInitialValues(initialPreset, takenResources);
            if (appliedImage !== null) {
                initialValues.image = appliedImage;
                /* An empty suggestion (tag sanitized to nothing) just leaves
                   the required rule prompting, as today. */
                initialValues.name = suggestContainerName(
                    deriveNameFromImageReference(appliedImage),
                    takenResources.names,
                );
                if (appliedPorts !== null && appliedPorts.length > 0) {
                    initialValues.ports = buildLockedPortRows(appliedPorts, takenResources.hostPorts);
                }
            }
        }

        let presetEnvVars: PresetEnvVar[] | undefined;
        if (initialPreset === null) {
            presetEnvVars = undefined;
        } else {
            presetEnvVars = initialPreset.envVars;
        }

        /* The picker props only apply to the image step; other steps keep the
           plain source fields. */
        let pickerTags: string[] | undefined;
        let prefillImageProp: string | undefined;
        let onImageSelected: ((tag: string) => void) | undefined;
        let onLookupPorts: ((reference: string) => Promise<number[]>) | undefined;
        if (sourceKind === 'image') {
            if (tagsFetched.data === null) {
                pickerTags = [];
            } else {
                pickerTags = tagsFetched.data;
            }
            if (appliedImage !== null) {
                prefillImageProp = appliedImage;
            } else {
                prefillImageProp = undefined;
            }
            onImageSelected = handleManagedImageSelected;
            onLookupPorts = lookupExposedTcpPorts;
        } else {
            pickerTags = undefined;
            prefillImageProp = undefined;
            onImageSelected = undefined;
            onLookupPorts = undefined;
        }

        form = (
            <ContainerConfigForm
                key={formKey}
                sourceKind={sourceKind}
                initialValues={initialValues}
                presetEnvVars={presetEnvVars}
                takenHostPorts={takenResources.hostPorts}
                takenNames={takenResources.names}
                managedImageTags={pickerTags}
                prefillImage={prefillImageProp}
                onManagedImageSelected={onImageSelected}
                onLookupExposedPorts={onLookupPorts}
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
