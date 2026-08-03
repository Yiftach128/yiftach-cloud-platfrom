/**
 * Daemon-host file access for a dockerd that runs inside a WSL distro.
 *
 * Implements the docker service's `DockerHostFiles` contract by running commands
 * in the distro as root (log files under /var/lib/docker are root-owned). Paths
 * are passed as argv to `wsl.exe --exec` — no shell ever parses them.
 */

import { execFile } from 'node:child_process';

import type { DockerHostFiles } from '../docker/interfaces.ts';
import type { WslDockerHostFilesOptions } from './interfaces.ts';

const DEFAULT_DISTRO = 'Ubuntu';

export class WslDockerHostFiles implements DockerHostFiles {
    private readonly distro: string;

    constructor(options: WslDockerHostFilesOptions = {}) {
        if (options.distro === undefined) {
            this.distro = DEFAULT_DISTRO;
        } else {
            this.distro = options.distro;
        }
    }

    truncateFile(absolutePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const args = ['-d', this.distro, '-u', 'root', '--exec', 'truncate', '-s', '0', absolutePath];
            execFile('wsl.exe', args, (error) => {
                if (error === null) {
                    resolve();
                } else {
                    reject(new Error(
                        `truncating "${absolutePath}" in WSL distro "${this.distro}" failed: ${error.message}`,
                    ));
                }
            });
        });
    }
}
