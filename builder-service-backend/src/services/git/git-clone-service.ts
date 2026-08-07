/**
 * Shallow-clones public repositories with the git CLI. The clone can never
 * prompt (GIT_TERMINAL_PROMPT=0 plus a disabled credential helper — a private
 * or nonexistent repo fails immediately instead of hanging), `--` keeps the
 * URL from being read as an option, and an AbortSignal kills the process at
 * the timeout. Validation of the URL and ref happened platform-side; this is
 * defense in depth, not the primary gate.
 */

import { spawn } from 'node:child_process';

import { GitCloneError } from './git-clone-error.ts';
import type { CloneRepositoryOptions } from './interfaces.ts';

/** Only the tail of stderr is kept — git progress can be long, the error is at the end. */
const STDERR_TAIL_CHARS = 2000;

export class GitCloneService {
    public cloneRepository(options: CloneRepositoryOptions): Promise<void> {
        const args: string[] = ['clone', '--depth', '1', '--single-branch', '--no-tags'];
        args.push('-c', 'credential.helper=');
        if (options.gitRef !== undefined) {
            args.push('--branch', options.gitRef);
        }
        args.push('--', options.gitUrl, options.targetDir);

        return new Promise<void>((resolve, reject) => {
            const child = spawn('git', args, {
                stdio: ['ignore', 'ignore', 'pipe'],
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
                signal: AbortSignal.timeout(options.timeoutMs),
            });

            let stderrTail = '';
            child.stderr.on('data', (chunk: Buffer) => {
                stderrTail = (stderrTail + chunk.toString('utf8')).slice(-STDERR_TAIL_CHARS);
            });

            child.on('error', (error: Error) => {
                if (error.name === 'AbortError') {
                    const seconds: number = options.timeoutMs / 1000;
                    reject(new GitCloneError(options.gitUrl, `timed out after ${seconds}s`));
                } else {
                    reject(new GitCloneError(options.gitUrl, error.message));
                }
            });

            child.on('close', (code: number | null) => {
                if (code === 0) {
                    resolve();
                } else {
                    let detail: string = stderrTail.trim();
                    if (detail === '') {
                        detail = `git exited with code ${code}`;
                    }
                    reject(new GitCloneError(options.gitUrl, detail));
                }
            });
        });
    }
}
