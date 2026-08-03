# Yiftach Cloud Platform

Self-hosted cloud control panel. Backend lives in `backend/` (Node 24 + TypeScript, ESM,
no build step — Node strips types natively, so imports use real `.ts` extensions).
Frontend lives in `frontend/` (React 19 + TypeScript + Vite, Ant Design UI). The two are
standalone npm packages — no workspaces.

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
- **Prefer plain, Java-like code over TypeScript shorthand.** Runtime code should read
  the way it would in Java: explicit type annotations (`Promise<void>`,
  `readonly url: string`), classic control flow (`if {} else {}` with braces), and
  simple method chains (`.filter(...).map(...)`) are the house style. Avoid
  TypeScript/JavaScript-specific shorthand: no ES `#` private members (use the
  `private` keyword), no `??` / `?.` / `??=`, no truthiness defaulting (`x || fallback`),
  and no defaulting inside object literals (`{ all: options.all ?? true }`) — resolve
  each value into a named local with explicit `if`/`else` first, then build the object.
  Type declarations (interfaces, unions, generics, optional `?:` properties) are not
  affected — they have no Java equivalent and stay idiomatic TypeScript.

## Backend architecture

Express 5. A request flows route → service → dockerode; errors flow back through the
error handler.

- `src/server.ts` — composition root: loads `.env`, builds the services, mounts routes
  under `/api/v1` and the error handler last. No logic.
- `src/middleware/error-handler.ts` — the only place service errors become HTTP:
  `DockerApiError` → its status, `DockerConnectionError` → 503, anything else → 500.
- `src/services/docker/` — `DockerManagerService`, a typed facade over the Docker
  Engine API (dockerode). Public types in `interfaces.ts`; dockerode/daemon wire shapes
  are quarantined in `container-mapper.ts` and `classify-dockerode-error.ts`. Every
  daemon call runs through `withDaemon`, which asks the daemon lifecycle to boot the
  daemon and retries once when the connection fails.
- `src/services/wsl/` — the WSL deployment adapters for the docker service's
  host-side contracts. `WslDockerDaemon` implements `DockerDaemonLifecycle`: boots
  the WSL distro on demand and holds it open (operational details under
  Verification); `bootstrapWslDocker` builds it and starts a background warm-up.
  `WslDockerHostFiles` implements `DockerHostFiles`: daemon-host file operations
  (log clearing) via `wsl.exe -u root`.

## Frontend architecture

The code conventions above apply to the frontend too (components take the place of
classes; JSX files use `.tsx`).

- `src/pages/` — one thin page per route, like backend route files: they only compose
  components. Routing lives in `App.tsx` (react-router): a pathless layout route renders
  `components/app-layout.tsx` (AntD sidebar + `<Outlet />`); menu keys are the route paths.
- `src/components/` — one component per file (e.g. `container-list.tsx`).
- `src/fetchers/` — all backend API access. `DockerFetcherService` (axios) throws only
  `DockerFetcherError`, so axios never leaks into components. Wire types in
  `fetchers/interfaces.ts` mirror the backend's `interfaces.ts`, except JSON-serialized
  fields (backend `Date` → frontend ISO `string`).
- The dev server proxies `/api` → `http://127.0.0.1:3000` (`vite.config.ts`); the backend
  deliberately has no CORS middleware, so never call the backend origin directly.
- App-wide look and feel is set via antd `ConfigProvider` theme tokens in `main.tsx` —
  prefer tokens over CSS overrides of `.ant-*` classes.

## Verification

- Typecheck: `npm run typecheck` (from `backend/` or `frontend/`); `npm run build` from
  `frontend/` also verifies the bundle.
- The Docker daemon runs in WSL2 Ubuntu on `tcp://127.0.0.1:2375` (IPv4 bind is
  mandatory — WSL's localhost relay does not forward IPv6/dual-stack listeners).
- WSL does not auto-start, but the backend self-heals: `WslDockerDaemon`
  (`backend/src/services/wsl/wsl-docker-daemon.ts`) boots the distro when a request
  finds the daemon dead, retries once, and holds the distro open while the server runs
  (`DOCKER_WSL_KEEPALIVE=0` disables the hold-open). A cold request takes ~10s
  (daemon startup is deliberately slowed ~7-20s by Docker 29's TLS deprecation
  warning). Standalone scripts that bypass the backend must still boot WSL themselves:
  `wsl -d Ubuntu -e true`, then poll `http://127.0.0.1:2375/_ping`.
