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
 *
 * Polling components (timeout chains with cursors and backoff) are a different
 * lifecycle and do not use this hook.
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

        if (optionsRef.current.resetOnKeyChange && lastKeyRef.current !== optionsRef.current.requestKey) {
            setData(null);
            setErrorMessage(null);
        }
        lastKeyRef.current = optionsRef.current.requestKey;

        optionsRef.current.fetch()
            .then((result: T) => {
                if (!disposed) {
                    setData(result);
                    setErrorMessage(null);
                }
            })
            .catch((error: unknown) => {
                if (!disposed) {
                    /* Deliberately leaves data untouched: a failed re-fetch
                       keeps the stale content rendered. */
                    setErrorMessage(optionsRef.current.describeError(error));
                }
            });

        /* Any deps change (reload, key change, enabled flip) or unmount runs
           this first, so a slow old response can never overwrite a newer one. */
        return () => {
            disposed = true;
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
