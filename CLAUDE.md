# Yiftach Cloud Platform

Self-hosted cloud control panel. Backend lives in `backend/` (Node 24 + TypeScript, ESM,
no build step — Node strips types natively, so imports use real `.ts` extensions).

## Code conventions

- **Types live in `interfaces.ts`, not in service files.** Each service folder (e.g.
  `backend/src/services/docker/`) keeps its public interfaces and type aliases in an
  `interfaces.ts` file next to the implementation. Service files import from it and
  contain only implementation. Exception: private types that describe a third-party
  library's wire format (e.g. dockerode response shapes) stay in the implementation
  file so `interfaces.ts` never depends on the underlying library.
- **One class per file.** Every class gets its own file, named after the class in
  kebab-case (`DockerApiError` → `docker-api-error.ts`). Classes never live in
  `interfaces.ts` — it holds only types.
- **Always indent with 4 spaces (not 2).** Applies to all hand-written source and
  config files. Exception: `package.json` stays as npm writes it (2 spaces), since
  npm reformats it on every install.
- **Never put a service file directly in `src/`.** Every service lives in a domain
  folder under `src/services/` (e.g. `src/services/docker/docker-manager-service.ts`).
  Only entry points (like `server.ts`) belong at the `src/` root.
- **Routes are thin — one file per endpoint.** Each endpoint gets its own file in
  `src/routes/`, named `<method>-<name>.ts` (e.g. `get-containers.ts`), exporting a
  factory that takes its service dependencies and returns an Express `Router`. A route
  only translates HTTP ↔ service call; error mapping lives in
  `src/middleware/error-handler.ts`, business logic in services.
- **API routes are versioned.** Every API endpoint is served under `/api/v1/...`
  (e.g. `/api/v1/containers`). Route files declare only the resource path
  (`/containers`); the version prefix is applied once in `server.ts` when mounting,
  so a version bump touches one line. Exception: `/health` stays unversioned — it is
  an infrastructure liveness probe, not part of the API surface.

## Verification

- Typecheck: `npm run typecheck` (from `backend/`).
- The Docker daemon runs in WSL2 Ubuntu on `tcp://127.0.0.1:2375` (IPv4 bind is
  mandatory — WSL's localhost relay does not forward IPv6/dual-stack listeners).
- WSL does not auto-start, but the backend self-heals: `WslDockerDaemon`
  (`backend/src/services/wsl-bootstrap/wsl-docker-daemon.ts`) boots the distro when a request
  finds the daemon dead, retries once, and holds the distro open while the server runs
  (`DOCKER_WSL_KEEPALIVE=0` disables the hold-open). A cold request takes ~10s
  (daemon startup is deliberately slowed ~7-20s by Docker 29's TLS deprecation
  warning). Standalone scripts that bypass the backend must still boot WSL themselves:
  `wsl -d Ubuntu -e true`, then poll `http://127.0.0.1:2375/_ping`.
