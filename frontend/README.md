# Frontend

React + TypeScript + Vite frontend for the Yiftach Cloud Platform.

## Commands

Run from `frontend/`:

- `npm run dev` — dev server on http://localhost:5173; `/api` requests are
  proxied to the backend at `http://127.0.0.1:3000`, so start the backend first
  if the page needs the API.
- `npm run build` — typecheck and build to `dist/`.
- `npm run typecheck` — typecheck only.
- `npm run lint` — oxlint.
- `npm run preview` — serve the production build locally.
