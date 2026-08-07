/**
 * Drains a Docker progress stream (image pull or build) to completion.
 *
 * The Engine reports long-running work as a JSON-lines stream of progress events
 * and — crucially — reports *failure* the same way: a terminal `{"error": ...}`
 * event inside an HTTP 200 response. followProgress implementations parse the
 * JSON but never inspect it, so this helper watches every event itself and
 * rejects when the daemon reports an error.
 *
 * An idle watchdog destroys the stream when the daemon goes silent: the image
 * service's dockerode client deliberately has no socket timeout (transfers run
 * for minutes), so this is the only hung-daemon protection on these calls.
 */

const STREAM_IDLE_TIMEOUT_MS = 300_000;

/**
 * Shape of dockerode's followProgress functions. Taken as a parameter because
 * there are two implementations: the typed `modem.followProgress` (pulls, classic
 * builds) and the untyped BuildKit-aware `Docker.prototype.followProgress`
 * (BuildKit builds) — the caller picks.
 */
export type FollowProgressFn = (
    stream: NodeJS.ReadableStream,
    onFinished: (error: Error | null, output: unknown[]) => void,
    onProgress: (event: unknown) => void,
) => void;

/**
 * One JSON event from the daemon's progress stream. A docker wire shape, so it
 * stays private to this file (the quarantine convention of this folder).
 */
interface ProgressEvent {
    /** Raw output text (build steps, BuildKit-decoded output). */
    stream?: string;
    /** Progress phase, e.g. "Downloading" or "Pull complete". */
    status?: string;
    /** Layer the status refers to. */
    id?: string;
    /** Rendered byte-counter bar; present on high-frequency transfer updates. */
    progress?: string;
    /** Present on the terminal event when the operation failed. */
    error?: string;
    errorDetail?: { message?: string };
}

/**
 * Consumes the stream until it ends, forwarding one human-readable line per
 * meaningful event to `onLine`. Resolves on clean completion; rejects when the
 * stream errors, the daemon reports an `{"error"}` event, or the idle watchdog
 * fires.
 */
export function drainProgressStream(
    follow: FollowProgressFn,
    stream: NodeJS.ReadableStream,
    onLine: (line: string) => void,
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        let settled = false;
        let idleTimer: NodeJS.Timeout | undefined;

        const settle = (error: Error | null): void => {
            if (settled) {
                return;
            }
            settled = true;
            if (idleTimer !== undefined) {
                clearTimeout(idleTimer);
            }
            if (error === null) {
                resolve();
            } else {
                reject(error);
            }
        };

        const resetIdleTimer = (): void => {
            if (idleTimer !== undefined) {
                clearTimeout(idleTimer);
            }
            idleTimer = setTimeout(() => {
                const idleError = new Error(
                    `the daemon sent no progress for ${STREAM_IDLE_TIMEOUT_MS / 1000}s`,
                );
                // dockerode hands out an http.IncomingMessage, which is destroyable;
                // the NodeJS.ReadableStream type just does not say so. Destroying
                // surfaces the error through followProgress's onFinished.
                const destroyable = stream as NodeJS.ReadableStream & {
                    destroy?: (error?: Error) => void;
                };
                if (destroyable.destroy === undefined) {
                    settle(idleError);
                } else {
                    destroyable.destroy(idleError);
                }
            }, STREAM_IDLE_TIMEOUT_MS);
            idleTimer.unref();
        };

        const handleEvent = (event: unknown): void => {
            if (settled) {
                return;
            }
            resetIdleTimer();
            if (typeof event !== 'object' || event === null) {
                return;
            }
            const progress = event as ProgressEvent;

            if (progress.error !== undefined) {
                let detail: string;
                if (progress.errorDetail !== undefined && progress.errorDetail.message !== undefined) {
                    detail = progress.errorDetail.message;
                } else {
                    detail = progress.error;
                }
                settle(new Error(detail));
                return;
            }

            if (progress.stream !== undefined) {
                for (const raw of progress.stream.split('\n')) {
                    const text = raw.trimEnd();
                    if (text !== '') {
                        onLine(text);
                    }
                }
                return;
            }

            if (progress.status !== undefined) {
                // Events carrying a byte-counter bar arrive many times per second
                // per layer; they are noise in a line-oriented log.
                if (progress.progress !== undefined) {
                    return;
                }
                let line: string;
                if (progress.id !== undefined && progress.id !== '') {
                    line = `${progress.id}: ${progress.status}`;
                } else {
                    line = progress.status;
                }
                onLine(line);
            }
        };

        resetIdleTimer();
        follow(
            stream,
            (error) => {
                settle(error);
            },
            handleEvent,
        );
    });
}
