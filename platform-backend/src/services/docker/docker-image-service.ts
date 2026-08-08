/**
 * Image acquisition — everything that makes images exist on the daemon from
 * this process: existence checks and registry pulls (image *builds* live in
 * the external builder service, builder-service-backend). Split from the
 * manager because these are the long-running, progress-streaming operations:
 * this service's dockerode client deliberately has no socket timeout
 * (docker-modem only arms one when the `timeout` key is present, and pulls
 * run for minutes), with hung transfers caught by the progress stream's idle
 * watchdog instead. The manager consumes this service through the
 * `DockerImageProvider` interface.
 */

import Docker from 'dockerode';

import { DaemonRequestRunner } from './daemon-request-runner.ts';
import { DockerApiError } from './docker-api-error.ts';
import { drainProgressStream } from './drain-progress-stream.ts';
import { readImageLabels, readRepoTags, toImageDetails, toImageSummary } from './image-mapper.ts';
import { ImageNotManagedError } from './image-not-managed-error.ts';
import { ImagePullError } from './image-pull-error.ts';
import type {
    DockerImageProvider,
    DockerImageServiceOptions,
    ImageDetails,
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
     * Inspects a platform-built image by id (or reference): tags, size,
     * exposed ports, and the labels carrying the builder's provenance stamps.
     * Throws {@link ImageNotManagedError} (→ 409) for images without the
     * managed label; unknown ids surface as the daemon's 404
     * {@link DockerApiError}.
     */
    async getManagedImageDetails(id: string): Promise<ImageDetails> {
        const raw = await this.requests.run(`GET /images/${id}/json`, () =>
            this.docker.getImage(id).inspect(),
        );

        const details: ImageDetails = toImageDetails(raw);
        if (details.labels[MANAGED_LABEL] !== 'true') {
            throw new ImageNotManagedError(id);
        }

        // Under the containerd image store, inspect's Size is the compressed
        // content size while the list reports the on-disk footprint — the
        // number the images table shows. Serve the list's size so the two
        // views agree; inspect's value stays only if the list misses the image.
        const summaries: ImageSummary[] = await this.getManagedImages();
        for (const summary of summaries) {
            if (summary.id === details.id) {
                details.sizeBytes = summary.sizeBytes;
                break;
            }
        }
        return details;
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

        // The daemon refuses to delete a multi-tagged image by id without
        // force ("referenced in multiple repositories" 409). Deleting each
        // tag reference instead untags one alias at a time; the last removal
        // deletes the image content, and an image a container uses is still
        // refused there — the no-force safety keeps holding. Single-tag and
        // dangling images keep the id path (a dangling image has no
        // reference to delete by).
        const repoTags: string[] = readRepoTags(details);
        if (repoTags.length > 1) {
            for (const tag of repoTags) {
                await this.requests.run(`DELETE /images/${tag}`, () =>
                    this.docker.getImage(tag).remove(),
                );
            }
        } else {
            await this.requests.run(`DELETE /images/${id}`, () =>
                this.docker.getImage(id).remove(),
            );
        }
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
