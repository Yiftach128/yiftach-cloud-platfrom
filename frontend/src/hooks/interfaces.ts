/** Configuration for one useFetchedData call site. */
export interface UseFetchedDataOptions<T> {
    /**
     * Performs one fetch of the resource. The latest closure is always the one
     * invoked (held in a ref), so it may freely capture props/state without
     * being an effect dependency. Best-effort callers fold their own catch
     * into this function and resolve a fallback value instead of rejecting.
     */
    fetch: () => Promise<T>;
    /** Maps a rejected fetch's error to the message surfaced as errorMessage. */
    describeError: (error: unknown) => string;
    /** Identity of the request; any change triggers a new fetch. */
    requestKey: string;
    /**
     * True: a requestKey change clears data and errorMessage first, so the
     * caller shows its skeleton (navigating to a different entity). False: the
     * stale data stays rendered until the new fetch settles (silent swap).
     */
    resetOnKeyChange: boolean;
    /**
     * When false, the hook fetches nothing and leaves all state untouched (an
     * in-flight fetch is discarded); flipping back to true fetches again.
     * Absent means true.
     */
    enabled?: boolean;
    /**
     * When set, the fetch re-runs this many ms after each settle, with the
     * same silent re-fetch contract (stale data stays rendered; a failure
     * sets errorMessage until the next success). reload() and requestKey
     * changes cancel the pending timer and fetch immediately. Absent means
     * one fetch per requestKey/reload.
     */
    pollIntervalMs?: number;
}

/** What useFetchedData returns to the rendering component. */
export interface FetchedData<T> {
    /** Latest successful result; null before the first success for the current requestKey (after a reset). */
    data: T | null;
    /** Derived: data === null && errorMessage === null — show the skeleton. */
    isInitialLoading: boolean;
    /** Message of the most recent failed fetch; null after any success. */
    errorMessage: string | null;
    /** Triggers a silent refetch of the current requestKey; stable identity. */
    reload: () => void;
}
