import { Router } from 'express';

import type { DockerManagerService } from '../services/docker/docker-manager-service.ts';

/**
 * GET /containers/:id/logs — a snapshot of the container's log; every line
 * carries its timestamp. `?tail=100` limits to the last N lines (default 500),
 * `?tail=all` removes the limit, `?since=<RFC3339 timestamp>` returns only lines
 * logged at or after that time — pass a previous line's `timestamp` verbatim to
 * poll for what came next. Invalid values are ignored.
 */
export function getContainerLogsRoute(docker: DockerManagerService): Router {
    return Router().get('/containers/:id/logs', async (req, res) => {
        let tail: number | 'all' | undefined = undefined;
        const tailRaw = req.query['tail'];
        if (tailRaw === 'all') {
            tail = 'all';
        } else if (typeof tailRaw === 'string') {
            const parsed: number = Number(tailRaw);
            if (Number.isInteger(parsed) && parsed > 0) {
                tail = parsed;
            }
        }

        // Validated as a date but forwarded as the original string: a JS Date
        // would truncate the daemon's nanosecond precision to milliseconds.
        let since: string | undefined = undefined;
        const sinceRaw = req.query['since'];
        if (typeof sinceRaw === 'string' && sinceRaw !== '') {
            const parsed: Date = new Date(sinceRaw);
            if (!Number.isNaN(parsed.getTime())) {
                since = sinceRaw;
            }
        }

        res.json(await docker.getContainerLogs(req.params.id, {
            tail: tail,
            since: since,
        }));
    });
}
