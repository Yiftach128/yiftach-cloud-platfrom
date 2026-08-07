/**
 * Builds an image by streaming an already-cloned directory to the daemon as a
 * tar build context (`POST /build` with a tar body, BuildKit) — the daemon
 * never clones anything itself, and `.git` never leaves this machine. The
 * dockerode client deliberately has no socket timeout (builds run for
 * minutes); hung streams are caught by drain-progress-stream's idle watchdog
 * instead.
 */

import { readdir } from 'node:fs/promises';
import { Readable } from 'node:stream';

import Docker from 'dockerode';
import * as tar from 'tar';

import { decodeBuildKitLogLine } from './decode-buildkit-log-line.ts';
import { drainProgressStream } from './drain-progress-stream.ts';
import type { FollowProgressFn } from './drain-progress-stream.ts';
import type { BuildImageOptions, ImageBuilderServiceOptions } from './interfaces.ts';

/** Label stamped on every image the platform builds; the platform's managed-image operations filter on it. */
const MANAGED_LABEL = 'cloudplatform.managed';

export class ImageBuilderService {
    private readonly docker: Docker;

    constructor(options: ImageBuilderServiceOptions) {
        this.docker = new Docker({
            host: options.host,
            port: options.port,
            protocol: 'http',
        });
    }

    public async buildImage(options: BuildImageOptions): Promise<void> {
        const entries: string[] = await this.listContextEntries(options.contextDir);
        const contextTar = tar.create({ cwd: options.contextDir, portable: true }, entries);
        // node-tar hands out a Minipass stream; Readable.from turns it into the
        // plain node stream docker-modem expects to pipe from.
        const contextStream: Readable = Readable.from(contextTar);

        const buildOptions: Docker.ImageBuildOptions = {
            t: options.tag,
            version: '2',
            rm: true,
            forcerm: true,
            labels: { [MANAGED_LABEL]: 'true' },
        };

        const stream = await this.docker.buildImage(contextStream, buildOptions);

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

    /** The tar carries the repository content only — `.git` never reaches the daemon. */
    private async listContextEntries(contextDir: string): Promise<string[]> {
        const names: string[] = await readdir(contextDir);
        return names.filter((name) => name !== '.git');
    }
}
