/**
 * Image acquisition — everything that makes images exist on the daemon: existence
 * checks and registry pulls (and, later, builds). Split from the manager because
 * these are the long-running, progress-streaming operations: this service's
 * dockerode client deliberately has no socket timeout (docker-modem only arms one
 * when the `timeout` key is present, and pulls run for minutes), with hung
 * transfers caught by the progress stream's idle watchdog instead. The manager
 * consumes this service through the `DockerImageProvider` interface.
 */

import Docker from 'dockerode';

import { DaemonRequestRunner } from './daemon-request-runner.ts';
import { DockerApiError } from './docker-api-error.ts';
import { drainProgressStream } from './drain-progress-stream.ts';
import type { FollowProgressFn } from './drain-progress-stream.ts';
import { readImageLabels, toImageSummary } from './image-mapper.ts';
import { ImageNotManagedError } from './image-not-managed-error.ts';
import { ImagePullError } from './image-pull-error.ts';
import type {
    BuildImageFromGitOptions,
    DockerImageProvider,
    DockerImageServiceOptions,
    ImageSummary,
} from './interfaces.ts';
import { resolveDockerEndpoint } from './resolve-docker-endpoint.ts';

export * from './image-not-managed-error.ts';
export * from './image-pull-error.ts';

/** Label stamped on every image the platform builds; the managed-image operations filter on it. */
const MANAGED_LABEL = 'cloudplatform.managed';

export class DockerImageService implements DockerImageProvider {
    private readonly docker: Docker;
    private readonly requests: DaemonRequestRunner;

    constructor(options: DockerImageServiceOptions = {}) {
        const endpoint = resolveDockerEndpoint(options);

        const dockerOptions: Docker.DockerOptions = {
            host: endpoint.host,
            port: endpoint.port,
            protocol: endpoint.protocol,
        };
        if (options.apiVersion !== undefined) {
            dockerOptions.version = options.apiVersion;
        }
        if (options.ca !== undefined) {
            dockerOptions.ca = options.ca;
        }
        if (options.cert !== undefined) {
            dockerOptions.cert = options.cert;
        }
        if (options.key !== undefined) {
            dockerOptions.key = options.key;
        }

        this.docker = new Docker(dockerOptions);
        this.requests = new DaemonRequestRunner(options.daemon, endpoint.baseUrl);
    }

    /**
     * Makes `reference` available locally, pulling it from its registry when
     * missing. Throws {@link ImagePullError} when the pull fails (unknown image
     * or tag, registry unreachable).
     */
    async ensureImageExists(reference: string): Promise<void> {
        const exists = await this.imageExists(reference);
        if (!exists) {
            await this.pullImage(reference);
        }
    }

    /**
     * Builds an image from a git remote via the Engine's remote build: the daemon
     * clones the repository itself (`POST /build?remote=...` with no body), using
     * BuildKit. Build *failures* never arrive as HTTP errors — the daemon reports
     * them as `{"error"}` events inside the 200 progress stream — so a failed
     * build rejects with the daemon's message as a plain Error; the caller (the
     * build job layer) records it, and it never reaches the HTTP error handler.
     */
    async buildImageFromGit(options: BuildImageFromGitOptions): Promise<void> {
        const buildOptions: Docker.ImageBuildOptions = {
            remote: options.gitUrl,
            t: options.tag,
            version: '2',
            rm: true,
            forcerm: true,
            labels: { [MANAGED_LABEL]: 'true' },
        };

        // The empty-string context is deliberate: with `remote` set the daemon
        // fetches the build context itself, and dockerode sends no request body.
        const stream = await this.requests.run('POST /build', () =>
            this.docker.buildImage('', buildOptions),
        );

        // BuildKit progress arrives as base64-protobuf "aux" events. dockerode 5's
        // own followProgress decodes them into plain {stream} events, but
        // @types/dockerode 4 does not declare that method — the one cast this
        // folder allows itself.
        const follower = this.docker as unknown as { followProgress: FollowProgressFn };
        await drainProgressStream(
            (s, onFinished, onProgress) => follower.followProgress(s, onFinished, onProgress),
            stream,
            (line: string) => {
                for (const decoded of decodeBuildKitLogLine(line)) {
                    options.onProgressLine(decoded);
                }
            },
        );
    }

    /**
     * Lists the images carrying the platform's managed label — i.e. images
     * built through the platform. Registry-pulled images are never labeled,
     * so they never appear here. The filter is applied daemon-side.
     */
    async getManagedImages(): Promise<ImageSummary[]> {
        const listOptions: Docker.ListImagesOptions = {
            filters: { label: [`${MANAGED_LABEL}=true`] },
        };
        const infos = await this.requests.run('GET /images/json', () =>
            this.docker.listImages(listOptions),
        );
        return infos.map((info) => toImageSummary(info));
    }

    /**
     * Deletes a platform-built image by id (or reference). Throws
     * {@link ImageNotManagedError} (→ 409) for images without the managed
     * label, so hand-pulled images cannot be deleted through this API. "Unused"
     * is enforced by the daemon itself: no force flag is ever sent, so an image
     * still referenced by a container is refused with a 409
     * {@link DockerApiError}, and unknown ids surface as its 404.
     */
    async deleteManagedImage(id: string): Promise<void> {
        const details = await this.requests.run(`GET /images/${id}/json`, () =>
            this.docker.getImage(id).inspect(),
        );

        const labels: Record<string, string> = readImageLabels(details);
        if (labels[MANAGED_LABEL] !== 'true') {
            throw new ImageNotManagedError(id);
        }

        await this.requests.run(`DELETE /images/${id}`, () =>
            this.docker.getImage(id).remove(),
        );
    }

    private async imageExists(reference: string): Promise<boolean> {
        try {
            await this.requests.run(`GET /images/${reference}/json`, () =>
                this.docker.getImage(reference).inspect(),
            );
            return true;
        } catch (error) {
            if (error instanceof DockerApiError && error.status === 404) {
                return false;
            }
            throw error;
        }
    }

    private async pullImage(reference: string): Promise<void> {
        // Only initiation goes through the runner: pull's promise resolves when
        // the daemon starts answering, before any of the stream is consumed, so
        // the runner's boot-and-retry is safe here and never replays a stream.
        const stream = await this.requests.run('POST /images/create', () =>
            this.docker.pull(reference),
        );

        try {
            // Progress lines are dropped: creates are synchronous and the UI
            // shows a spinner, so nobody is watching pull progress.
            await drainProgressStream(
                (s, onFinished, onProgress) =>
                    this.docker.modem.followProgress(s, onFinished, onProgress),
                stream,
                () => {},
            );
        } catch (error) {
            let detail: string;
            if (error instanceof Error) {
                detail = error.message;
            } else {
                detail = String(error);
            }
            throw new ImagePullError(reference, detail);
        }
    }
}

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Undoes a dockerode BuildKit-decoder quirk: protobufjs hands it bytes fields as
 * base64 strings, and its `Buffer.from(log.msg)` never decodes them — so build
 * *step output* (RUN commands' stdout) reaches us still base64-encoded, while
 * vertex headers arrive as plain text. A line is decoded only when it is
 * unmistakably base64-encoded readable text; anything else passes through
 * unchanged. Returns the resulting lines (decoded chunks may hold several).
 */
function decodeBuildKitLogLine(line: string): string[] {
    if (line.length < 8 || line.length % 4 !== 0 || !BASE64_PATTERN.test(line)) {
        return [line];
    }

    const decoded: string = Buffer.from(line, 'base64').toString('utf8');
    if (!isReadableText(decoded)) {
        return [line];
    }

    const lines: string[] = [];
    for (const raw of decoded.split('\n')) {
        const text = raw.trimEnd();
        if (text !== '') {
            lines.push(text);
        }
    }
    return lines;
}

/** True when the text holds no control characters beyond tab/newline/CR/ESC (ANSI colors). */
function isReadableText(text: string): boolean {
    if (text.includes('�')) {
        return false; // invalid UTF-8 replacement character — this was not text
    }
    for (const character of text) {
        const code = character.codePointAt(0);
        if (code === undefined) {
            continue;
        }
        const isAllowedControl = code === 9 || code === 10 || code === 13 || code === 27;
        if ((code < 32 && !isAllowedControl) || code === 127) {
            return false;
        }
    }
    return true;
}
