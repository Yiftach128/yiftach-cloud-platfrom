import type { ReactElement } from 'react';

import type { DockerFetcherService } from '../fetchers/docker-fetcher-service.ts';

export interface ContainerListProps {
    fetcher: DockerFetcherService;
}

/** One sidebar navigation entry; also the root of the header breadcrumb trail. */
export interface NavItem {
    path: string;
    icon: ReactElement;
    label: string;
}

export interface HeaderBreadcrumbProps {
    navItems: NavItem[];
}

export interface ContainerDetailsProps {
    fetcher: DockerFetcherService;
    containerName: string;
}

/** Actions the container toolbar can run; keys the per-button loading state. */
export type ContainerAction = 'start' | 'stop' | 'restart' | 'delete';

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
