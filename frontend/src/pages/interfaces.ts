import type { DockerFetcherService } from '../fetchers/docker-fetcher-service.ts';

export interface ServicesPageProps {
    fetcher: DockerFetcherService;
}

export interface ContainerDetailsPageProps {
    fetcher: DockerFetcherService;
}

export interface NewContainerPageProps {
    fetcher: DockerFetcherService;
}

export interface ImagesPageProps {
    fetcher: DockerFetcherService;
}
