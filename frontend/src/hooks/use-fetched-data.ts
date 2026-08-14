import { useCallback, useEffect, useRef, useState } from 'react';

import type { FetchedData, UseFetchedDataOptions } from './interfaces.ts';

/**
 * Shared request/response fetching state: skeleton only while there is nothing
 * to show, silent re-fetches once there is.
 *
 * | Event                        | data           | errorMessage   | Caller renders                  |
 * |------------------------------|----------------|----------------|---------------------------------|
 * | First mount (enabled)        | null           | null           | Skeleton; fetch starts          |
 * | Fetch success                | fresh result   | null           | Content                         |
 * | Fetch failure, data null     | null           | set            | Full-body error alert           |
 * | Fetch failure, data present  | kept           | set            | Content + inline alert above it |
 * | reload()                     | kept in flight | kept in flight | Silent; swaps when settled      |
 * | Key change, reset true       | null           | null           | Skeleton (different entity)     |
 * | Key change, reset false      | kept           | kept           | Old content until settle        |
 * | enabled false                | kept           | kept           | No fetch; in-flight discarded   |
 * | Poll tick (pollIntervalMs)   | kept in flight | kept in flight | Silent; swaps when settled      |
 *
 * pollIntervalMs re-runs the fetch on a fixed cadence with the same silent
 * re-fetch contract. Polling components needing more than that — cursors,
 * error backoff, line accumulation (the log and build panels) — are a
 * different lifecycle and do not use this hook.
 */
export function useFetchedData<T>(options: UseFetchedDataOptions<T>): FetchedData<T> {
    const [data, setData] = useState<T | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [reloadCounter, setReloadCounter] = useState<number>(0);

    /* Latest-ref pattern: callers pass inline closures over props/state; the
       effect always invokes the newest one without depending on its identity.
       The render-time write is idempotent, so StrictMode's double render is
       harmless. */
    const optionsRef = useRef<UseFetchedDataOptions<T>>(options);
    optionsRef.current = options;

    /** requestKey of the last enabled effect run; null before the first. */
    const lastKeyRef = useRef<string | null>(null);

    let enabled: boolean;
    if (options.enabled === undefined) {
        enabled = true;
    } else {
        enabled = options.enabled;
    }

    useEffect(() => {
        if (!enabled) {
            return;
        }
        let disposed: boolean = false;
        let timer: number | undefined = undefined;

        if (optionsRef.current.resetOnKeyChange && lastKeyRef.current !== optionsRef.current.requestKey) {
            setData(null);
            setErrorMessage(null);
        }
        lastKeyRef.current = optionsRef.current.requestKey;

        async function run(): Promise<void> {
            try {
                const result: T = await optionsRef.current.fetch();
                if (disposed) {
                    return;
                }
                setData(result);
                setErrorMessage(null);
            } catch (error) {
                if (disposed) {
                    return;
                }
                /* Deliberately leaves data untouched: a failed re-fetch keeps
                   the stale content rendered. */
                setErrorMessage(optionsRef.current.describeError(error));
            }

            const pollIntervalMs: number | undefined = optionsRef.current.pollIntervalMs;
            if (pollIntervalMs !== undefined && !disposed) {
                timer = window.setTimeout(run, pollIntervalMs);
            }
        }

        run();

        /* Any deps change (reload, key change, enabled flip) or unmount runs
           this first, so a slow old response can never overwrite a newer one
           and no orphaned poll timer survives. */
        return () => {
            disposed = true;
            if (timer !== undefined) {
                clearTimeout(timer);
            }
        };
    }, [options.requestKey, enabled, reloadCounter]);

    const reload = useCallback((): void => {
        setReloadCounter((value: number) => value + 1);
    }, []);

    return {
        data: data,
        isInitialLoading: data === null && errorMessage === null,
        errorMessage: errorMessage,
        reload: reload,
    };
}
