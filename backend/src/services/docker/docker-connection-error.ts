/** The daemon could not be reached at all. */
export class DockerConnectionError extends Error {
    constructor(baseUrl: string, cause: unknown) {
        super(
            `Cannot reach the Docker daemon at ${baseUrl}. ` +
                `Check that the WSL distro is running (\`wsl -d Ubuntu -e true\`) and that dockerd is ` +
                `bound to an IPv4 address (\`wsl -d Ubuntu -u root ss -ltn | grep 2375\`).`,
        );
        this.name = 'DockerConnectionError';
        this.cause = cause;
    }
}
