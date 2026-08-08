/** One HEAD-commit lookup in an already-cloned repository. */
export interface ReadHeadCommitOptions {
    /** Directory holding the clone. */
    repositoryDir: string;
    /** Hard cap on the lookup (milliseconds); the process is killed past it. */
    timeoutMs: number;
}

/** One shallow clone into a fresh workspace directory. */
export interface CloneRepositoryOptions {
    /** Canonical clone URL (https://github.com/owner/repo.git). */
    gitUrl: string;
    /** Branch or tag to check out; the remote's default branch when absent. */
    gitRef?: string;
    /** Existing empty directory the repository is cloned into. */
    targetDir: string;
    /** Hard cap on the whole clone (milliseconds); the process is killed past it. */
    timeoutMs: number;
}
