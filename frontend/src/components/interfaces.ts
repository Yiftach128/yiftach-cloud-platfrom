import type { ReactElement } from 'react';

import type { DockerFetcherService } from '../fetchers/docker-fetcher-service.ts';
import type { BuildJob, ContainerState, ImagePreset, PresetEnvVar } from '../fetchers/interfaces.ts';

export interface ContainerListProps {
    fetcher: DockerFetcherService;
}

/** One sidebar navigation entry; also the root of the header breadcrumb trail. */
export interface NavItem {
    path: string;
    icon: ReactElement;
    label: string;
    /** Display labels for known child segments, keyed by decoded segment. */
    childLabels?: Record<string, string>;
}

export interface HeaderBreadcrumbProps {
    navItems: NavItem[];
}

export interface ContainerDetailsProps {
    fetcher: DockerFetcherService;
    containerName: string;
}

/** Actions the container toolbar can run; keys the per-button loading state. */
export type ContainerAction = 'start' | 'stop' | 'restart' | 'clear-logs' | 'delete';

export interface ContainerControlsProps {
    fetcher: DockerFetcherService;
    /** Route-param name; the fetcher handles URL encoding. */
    containerName: string;
    /** From the container's state details — drives the Start/Stop toggle. */
    running: boolean;
    /** Whether the logs pane is showing — drives the View/Hide Logs toggle. */
    logsOpen: boolean;
    /** Called when the View/Hide Logs button is clicked. */
    onToggleLogs: () => void;
    /** Called after a successful start/stop/restart so the parent re-fetches. */
    onMutated: () => void;
}

export interface ContainerLogsPanelProps {
    fetcher: DockerFetcherService;
    containerName: string;
}

export interface ContainerRowActionsProps {
    fetcher: DockerFetcherService;
    /** Row's primary name; the fetcher handles URL encoding. */
    containerName: string;
    /** List-endpoint lifecycle state — drives the Start/Stop toggle. */
    state: ContainerState;
    /** Called after any successful action so the list re-fetches. */
    onMutated: () => void;
}

export interface ImageListProps {
    fetcher: DockerFetcherService;
}

export interface ImageRowActionsProps {
    fetcher: DockerFetcherService;
    /** sha256 image id; the fetcher handles URL encoding. */
    imageId: string;
    /** First repository tag, or null for a dangling image (disables create-container). */
    primaryTag: string | null;
    /** Called after a successful delete so the list re-fetches. */
    onMutated: () => void;
}

/** Where a new container's image comes from; drives which source field the config form shows. */
export type ContainerSourceKind = 'preset' | 'image' | 'github';

export interface NewContainerWizardProps {
    fetcher: DockerFetcherService;
}

export interface PresetSelectProps {
    fetcher: DockerFetcherService;
    /** `name` of the selected preset; null when none is selected yet. */
    selectedName: string | null;
    onSelect: (preset: ImagePreset) => void;
}

/** Static content of one source card on the wizard's first screen. */
export interface SourceCardDescriptor {
    kind: ContainerSourceKind;
    icon: ReactElement;
    title: string;
    description: string;
}

export interface SourceKindSelectProps {
    /** Called with the chosen source kind when its card is clicked. */
    onSelect: (kind: ContainerSourceKind) => void;
}

/** One row of the ports list; a side is unset while the user is still typing. */
export interface PortRowValue {
    hostPort?: number;
    containerPort?: number;
}

/** One row of the user-added env var list. */
export interface EnvRowValue {
    name?: string;
    value?: string;
}

/** Values the container config form edits; optional members belong to other source kinds. */
export interface ContainerConfigFormValues {
    name: string;
    /** Image reference, when the source kind is 'image'. */
    image?: string;
    /** GitHub repository URL, when the source kind is 'github'. */
    gitUrl?: string;
    ports: PortRowValue[];
    /** Values for the preset's declared env vars, keyed by variable name. */
    presetEnv?: Record<string, string>;
    extraEnv: EnvRowValue[];
}

export interface ContainerConfigFormProps {
    sourceKind: ContainerSourceKind;
    initialValues: ContainerConfigFormValues;
    /** Preset-declared env vars rendered as fixed rows; only for source kind 'preset'. */
    presetEnvVars?: PresetEnvVar[];
    /** Disables the form and marks the submit button loading while a create runs. */
    pending: boolean;
    onSubmit: (values: ContainerConfigFormValues) => void;
}

/**
 * Where the GitHub flow stands: filling the form, or watching the build job
 * (the builder service creates the container server-side before the job
 * reports success, so there is no separate creating phase anymore).
 */
export type NewContainerPhase = 'configure' | 'building';

export interface BuildProgressPanelProps {
    fetcher: DockerFetcherService;
    /** Build job to poll. */
    jobId: string;
    /** Called once when the job reaches 'succeeded' (the container exists by then). */
    onSucceeded: (job: BuildJob) => void;
    /** Returns to the config form (offered after a failed or lost build). */
    onBack: () => void;
}
