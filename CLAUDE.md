# Yiftach Cloud Platform

Self-hosted cloud control panel, built as three standalone npm packages — no workspaces.
The platform backend lives in `platform-backend/` (Node 24 + TypeScript, ESM, no build
step — Node strips types natively, so imports use real `.ts` extensions). The builder
service lives in `builder-service-backend/` (same Node 24 + TS style — a headless worker
that performs image builds; no HTTP server). The frontend lives in `frontend/`
(React 19 + TypeScript + Vite, Ant Design UI).

## Code conventions

- **Types live in `interfaces.ts`, not in service files.** Each service folder (e.g.
  `platform-backend/src/services/docker/`) keeps its public interfaces and type aliases
  in an `interfaces.ts` file next to the implementation. Service files import from it and
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
  Only entry points (like `server.ts`, `main.ts`) and startup wiring (`config.ts`)
  belong at the `src/` root.
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
  Two carve-outs: `config.ts` env-resolution files may use `||` defaulting
  (`process.env.X || "default"`), and boolean logic with `||`/`&&` inside conditions
  (`if (a || b && c)`) is always fine — the ban covers truthiness *defaulting* for
  value resolution, not boolean tests.

## Platform backend architecture (`platform-backend/`)

Express 5. A request flows route → service → dockerode; errors flow back through the
error handler.

- `src/server.ts` — composition root: loads `.env`, builds the services, mounts
  `express.json()`, the routes under `/api/v1`, and the error handler last. No logic.
- `src/middleware/error-handler.ts` — the only place service errors become HTTP:
  `ValidationError` and malformed JSON → 400, `DockerApiError` → its status,
  `ImagePullError`/`BuildJobNotFoundError` → 404, `LogsNotClearableError`/
  `ImageNotManagedError` → 409, `BuildQueueFullError` → 429,
  `DockerConnectionError` → 503, anything else → 500.
- `src/services/docker/` — the daemon-facing services. `DockerManagerService` is the
  typed facade for container operations (list/inspect/create/start/stop/logs/delete);
  `DockerImageService` owns image acquisition and lifecycle (exists-check, registry
  pull, plus list/detail/delete of platform-built images — those labeled
  `cloudplatform.managed=true`; `GET /images/:id` serves the inspect-backed
  `ImageDetails` with exposed ports and the provenance labels, 409 for unmanaged
  images — its `sizeBytes` is deliberately taken from the list endpoint so it
  matches the images table (containerd-store inspect reports compressed content
  size instead); deletes never pass force, so the daemon itself
  refuses in-use images) with its own timeout-less dockerode client, since
  pulls run for minutes — hung streams are caught by
  `drain-progress-stream.ts`'s idle watchdog instead. The manager consumes it
  through the `DockerImageProvider` interface. Both run every daemon request
  through `DaemonRequestRunner`, which asks the daemon lifecycle to boot the
  daemon and retries once when the connection fails (stream draining stays
  outside the runner — never retried). Public types in `interfaces.ts`;
  dockerode/daemon wire shapes are quarantined in `container-mapper.ts`,
  `image-mapper.ts`, `classify-dockerode-error.ts`, and `drain-progress-stream.ts`.
  Image *builds* do not happen in this process — they belong to the builder service.
- `src/services/builds/` — the FIFO build queue the builder service works off:
  `POST /builds` enqueues (202, status `queued`; 429 past 10 waiting jobs) with the
  whole container config riding along, plus an optional `imageName` ("name" or
  "name:tag") used as the image tag instead of the generated
  `cloudplatform/build-<owner>-<repo>:<shortid>`; clients poll `GET /builds/:id`. The builder
  claims the oldest queued job via `POST /builds-queue/claim` (204 when empty; the
  claim also fire-and-forgets a WSL daemon warm-up), appends progress lines via
  `POST /builds-queue/:id/logs`, creates the container through the normal
  `POST /containers`, and reports via `POST /builds-queue/:id/result` (the first
  terminal status wins). A running job untouched for 10 minutes
  (`BUILD_STALE_TIMEOUT_MS`) is failed by the sweeper so the UI never hangs; finished
  jobs expire after 30 minutes; a restart forgets all jobs (pollers get 404, and the
  builder abandons in-flight work on that same 404).
- `src/services/validation/` — hand-rolled request-body validators (no schema
  library), one function per endpoint body, throwing `ValidationError` (→ 400).
  The container name/ports/env field rules live once in `parse-container-fields.ts`,
  shared by the create-container and start-build parsers.
- `src/services/wsl/` — the WSL deployment adapters for the docker service's
  host-side contracts. `WslDockerDaemon` implements `DockerDaemonLifecycle`: boots
  the WSL distro on demand and holds it open (operational details under
  Verification); `bootstrapWslDocker` builds it and starts a background warm-up.
  `WslDockerHostFiles` implements `DockerHostFiles`: daemon-host file operations
  (log clearing) via `wsl.exe -u root`.

## Builder service architecture (`builder-service-backend/`)

A headless polling worker — no HTTP server, so no routes and no error handler; the
backend code conventions apply. It runs alongside the platform via `npm start` today
and is designed to run as a container later (its `Dockerfile` exists; a compose file
is a future phase). One task at a time: claim → clone → build → create container →
report, then poll again.

- `src/main.ts` — entry point; `src/config.ts` — env-driven `Config`, logged at
  startup (`PLATFORM_API_URL`, `DOCKER_HOST`, `POLL_INTERVAL_MS`, `WORKSPACE_DIR`,
  `GIT_CLONE_TIMEOUT_MS`; defaults suit local dev).
- `src/services/platform/` — `PlatformApiClient`, the only door to the platform API
  (axios, styled after the frontend's `DockerFetcherService`; axios never leaks).
  A 404 on a job-scoped call becomes `BuildJobLostError` — the single abandon signal
  (the platform restarted and forgot the job).
- `src/services/git/` — `GitCloneService` shallow-clones with the git CLI
  (`--depth 1 --single-branch --no-tags`, prompts disabled, `--` before the URL,
  killed at `GIT_CLONE_TIMEOUT_MS`) and reads the clone's HEAD commit
  (`readHeadCommit`, via `git rev-parse`). The host running the builder needs
  `git` on PATH.
- `src/services/docker/` — `ImageBuilderService` streams the cloned directory
  (minus `.git`) to the daemon as a tar build context (BuildKit, `version: '2'`,
  labels the image `cloudplatform.managed=true` plus the caller's `extraLabels` —
  the worker passes the build provenance: `cloudplatform.repo-url`, `.git-ref`
  (only when a `#ref` was given), `.commit`, and `.build-job-id`; the frontend's
  image-detail page reads these, so keep the names in sync with
  `frontend/src/components/image-details.tsx`). The daemon never runs git.
  `drain-progress-stream.ts` and `decode-buildkit-log-line.ts` here are deliberate
  copies of the platform's docker-folder logic (`drain-progress-stream.ts` exists in
  both packages **byte-identically** — no workspaces, so edits must touch both).
- `src/services/worker/` — `BuildWorker` (the serial loop; always deletes the clone
  workspace in `finally`) and `LogBatcher` (flushes log lines to the platform about
  once a second; records a 404 instead of throwing from the timer).

## Frontend architecture

The code conventions above apply to the frontend too (components take the place of
classes; JSX files use `.tsx`).

- `src/pages/` — one thin page per route, like backend route files: they only compose
  components. Routing lives in `App.tsx` (react-router): a pathless layout route renders
  `components/app-layout.tsx` (AntD sidebar + `<Outlet />`); menu keys are the route paths.
- `src/components/` — one component per file (e.g. `container-list.tsx`).
- `src/fetchers/` — all backend API access. `DockerFetcherService` (axios) throws only
  `DockerFetcherError`, so axios never leaks into components. Wire types in
  `fetchers/interfaces.ts` mirror the platform backend's `interfaces.ts`, except
  JSON-serialized fields (backend `Date` → frontend ISO `string`).
- **Skeletons only when there is nothing to show; re-fetches are silent.** A view renders
  a loading `Skeleton` only while it has no data yet — first load, or navigation to a
  *different* entity. Once content is on screen, re-fetches keep the stale content
  rendered and swap it when fresh data arrives; a failed re-fetch shows a non-destructive
  `Alert` above the kept content (cleared by the next success) instead of replacing it.
  Only an initial-load failure may replace the body with an error alert. The mechanism is
  `src/hooks/use-fetched-data.ts` — component fetches go through it rather than
  hand-rolling `useEffect` + disposed flags (`requestKey` carries the entity
  identity; `resetOnKeyChange` chooses reset-to-skeleton vs. keep-stale when it changes,
  e.g. the new-container wizard keeps the current form while a newly picked image's
  prefill loads; `pollIntervalMs` adds a slow silent re-fetch cadence, e.g. the
  container table's row refresh). Polling that needs more than a cadence — cursors,
  error backoff, accumulation (`container-logs-panel.tsx`, `build-progress-panel.tsx`,
  the container table's stats loop) — keeps its own timeout loop instead, but follows
  the same skeleton-per-session and inline-alert rules.
- The GitHub source in the new-container wizard submits the build **and** the container
  config in one `POST /builds`; the builder service creates the container server-side,
  so the wizard only watches the job (`queued` → `running` → terminal) and navigates to
  My Services when it succeeds. It never calls `POST /containers` for that source.
- Clicking a My Images row opens `/images/:imageId` (short id in the URL — the daemon
  resolves it as an id prefix): `components/image-details.tsx`, fed by
  `GET /api/v1/images/:id`, showing the basics, the EXPOSEd ports, and the builder's
  provenance labels (repository link, branch/tag, commit, build job). The wizard's
  create-from-image deep link (`?image=`) uses the same endpoint to pre-fill the
  ports rows from the image's TCP EXPOSEs (host port = container port, like presets;
  best-effort — a failed lookup just leaves the default empty row).
- The dev server proxies `/api` → `http://127.0.0.1:3000` (`vite.config.ts`); the backend
  deliberately has no CORS middleware, so never call the backend origin directly.
- App-wide look and feel is set via antd `ConfigProvider` theme tokens in `main.tsx` —
  prefer tokens over CSS overrides of `.ant-*` classes.
- UI chrome is never text-selectable. `index.css` sets `user-select: none` on `body`;
  only copyable content opts back in with `user-select: text` — form fields, table
  *body* cells (headers/column names stay chrome), description values, alert text,
  and `.app-log-output` (the log panes). Buttons re-disable selection so row actions
  inside table cells stay chrome. New chrome (buttons, menus, cards, breadcrumbs,
  table headers) needs no work — it inherits none; a new surface that displays
  copyable values must join the opt-in list in `index.css`.

## Verification

- Typecheck: `npm run typecheck` (from `platform-backend/`, `builder-service-backend/`,
  or `frontend/`); `npm run build` from `frontend/` also verifies the bundle.
- Run locally: `npm run dev` in `platform-backend/` (port 3000) and in
  `builder-service-backend/` (no port — it polls the platform), `npm run dev` in
  `frontend/`. Builds need both backend processes up.
- End-to-end build test repo: `https://github.com/Yiftach128/cloudplatform-build-test`
  (a 2-file nginx repo that exists for exactly this).
- The Docker daemon runs in WSL2 Ubuntu on `tcp://127.0.0.1:2375` (IPv4 bind is
  mandatory — WSL's localhost relay does not forward IPv6/dual-stack listeners).
- WSL does not auto-start, but the platform backend self-heals: `WslDockerDaemon`
  (`platform-backend/src/services/wsl/wsl-docker-daemon.ts`) boots the distro when a
  request finds the daemon dead, retries once, and holds the distro open while the
  server runs (`DOCKER_WSL_KEEPALIVE=0` disables the hold-open). Its `wsl.exe`
  children are spawned with `windowsHide: true` on purpose: a `wsl.exe` sharing the
  backend terminal's console can flip that console's input modes and interfere with
  Ctrl+C for the whole terminal. Don't switch it to `detached` — a console-less
  `wsl.exe` allocates its own *visible* console window. Keep any new `wsl.exe`
  spawn `windowsHide` (or short-lived) for the same reason. Ctrl+Break (SIGBREAK)
  is a registered fallback stop key, and the server logs
  `<signal> received, shutting down...` so a dead keyboard is distinguishable from
  a hung shutdown. A cold request takes
  ~10s (daemon startup is deliberately slowed ~7-20s by Docker 29's TLS deprecation
  warning). The build queue also warms the daemon on every claim. Standalone scripts
  that bypass the backend must still boot WSL themselves: `wsl -d Ubuntu -e true`,
  then poll `http://127.0.0.1:2375/_ping`.
