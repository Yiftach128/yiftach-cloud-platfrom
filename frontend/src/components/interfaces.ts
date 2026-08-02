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
