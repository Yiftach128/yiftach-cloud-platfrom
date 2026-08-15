import { useEffect, useState } from 'react';

import type { DockerFetcherService } from '../fetchers/docker-fetcher-service.ts';
import type { ContainerStatsMap } from '../fetchers/interfaces.ts';

/** Delay between successful stats polls. */
const STATS_POLL_INTERVAL_MS: number = 3000;
/** Delay before retrying after a failed stats poll. */
const STATS_POLL_ERROR_BACKOFF_MS: number = 10000;

/**
 * Live container resource samples, polled from GET /containers/stats in a
 * mount-scoped session. Stats are telemetry with their own lifecycle, so this
 * runs its own timeout loop instead of going through useFetchedData: a failed
 * poll keeps the last samples rendered and silently retries after a longer
 * backoff — the values are decoration, never worth an alert. Returns {} until
 * the first sample lands; the map is keyed by full container id, and stopped
 * containers are absent from it.
 */
export function useContainerStats(fetcher: DockerFetcherService): ContainerStatsMap {
    const [stats, setStats] = useState<ContainerStatsMap>({});

    useEffect(() => {
        let disposed: boolean = false;
        let timer: number | undefined = undefined;

        async function poll(): Promise<void> {
            if (disposed) {
                return;
            }
            let delay: number = STATS_POLL_INTERVAL_MS;
            try {
                const fresh: ContainerStatsMap = await fetcher.getContainersStats();
                if (disposed) {
                    return;
                }
                setStats(fresh);
            } catch {
                delay = STATS_POLL_ERROR_BACKOFF_MS;
            }
            if (disposed) {
                return;
            }
            timer = window.setTimeout(poll, delay);
        }

        poll();

        return () => {
            disposed = true;
            if (timer !== undefined) {
                clearTimeout(timer);
            }
        };
    }, [fetcher]);

    return stats;
}
