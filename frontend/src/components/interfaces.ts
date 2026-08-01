import type { DockerFetcherService } from '../fetchers/docker-fetcher-service.ts';

export interface ContainerListProps {
    fetcher: DockerFetcherService;
}
