# frontend

The OpenScale console: React 19 + TypeScript + Vite 8, styled with
Tailwind CSS v4 and a custom neomorphic/skeuomorphic design system. All
data comes from the [control-plane](../control-plane/README.md) API. The
frontend never talks to Postgres, Kafka, MinIO or Docker directly.

Stack: React 19 · React Router 7 · TanStack Query 5 (server state) ·
Zustand 5 (UI state) · Tailwind CSS 4 · lucide-react · oxlint. Charts are
hand-rolled SVG components; there's no chart library.

## Run it

It runs in Docker by default (`docker compose up -d`) at
http://localhost:5173, with `./frontend` bind-mounted for hot reload. To
run it on the host instead:

```bash
docker compose stop frontend
npm install
npm run dev        # http://localhost:5173
```

| Script | |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) + production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | oxlint |

### Environment

These are read at build/dev time and inlined into the bundle, so they're
the URLs **the browser** uses. They stay `localhost` even when the
frontend itself runs in a container.

| Var | Default | Used by |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8080` | every HTTP gateway and WebSocket ([`src/shared/api/httpClient.ts`](src/shared/api/httpClient.ts)) |
| `VITE_MLFLOW_BASE_URL` | `http://localhost:5000` | ML Workbench iframe |
| `VITE_JUPYTER_BASE_URL` | `http://localhost:8888` | Notebooks iframe |
| `VITE_JUPYTER_TOKEN` | `openscale-dev` | Notebooks iframe |

If you change the frontend's origin, also update the control-plane's
`FRONTEND_ORIGIN`, which it uses for CORS and the WebSocket origin check.

## Structure

```
src/
  app/            App root, router, shell container, theme store, accent presets
  domains/        One folder per screen (see below)
  shared/
    api/          httpClient: the fetch wrapper all HTTP gateways build on
    design-system/  Panel, Well, Led, Toggle, RunButton, StatCard, gauges, icons, tokens.css, fonts
    layout/       AppShell, Sidebar, TopBar, SearchBar (⌘K), navigation.ts (nav entries + paths)
    search/       Global search: entities, ranking rules, hook
    types/        Shared status types
  assets/fonts/   Self-hosted Plus Jakarta Sans + JetBrains Mono (variable)
```

### Domains

Each screen is a self-contained domain with the same four layers:

```
domains/pipelines/
  domain/          Plain types + pure rules (no React, no fetch)
  application/     Gateway interfaces the domain owns + TanStack Query hooks (useJobRuns, useTriggerJob, …)
  infrastructure/  Gateway implementations: http*Gateway (real) and mock*Gateway (offline)
  ui/              React components for the screen
```

| Domain | Screen | Route |
|---|---|---|
| `home` | Home | `/` |
| `pipelines` | Pipelines | `/pipelines` |
| `sql-editor` | SQL Editor | `/sql-editor` |
| `data-catalog` | Data Catalog | `/data-catalog` |
| `notebooks` | Notebooks (JupyterLab iframe) | `/notebooks` |
| `ml-workbench` | ML Workbench (MLflow iframe) | `/ml-workbench` |
| `streaming` | Streaming | `/streaming` |
| `dashboards` | Dashboards | `/dashboards` |
| `system-health` | Infrastructure | `/infrastructure` |
| `connections` | Settings | `/connections` |

**The dependency rule:** UI → application hooks → gateway *interface*.
Each domain picks its implementation in exactly one place, a
`const gateway = …` line in its application layer, e.g.
[`useJobRuns.ts`](src/domains/pipelines/application/useJobRuns.ts):

```ts
const gateway = httpJobsGateway;   // swap to mockJobsGateway to work without the control-plane
```

Code shared by every screen goes in `src/shared/`. A domain may reuse
another domain's public pieces when it's really showing the same data.
`data-catalog` does this: it reuses the SQL Editor's query engine and
results table for table previews, and the Pipelines hooks for its lineage
view. It doesn't copy that code.

## Adding a screen

1. Create `src/domains/<name>/` with the `domain/application/infrastructure/ui`
   layers you need.
2. Add the entry (path, label, icon, subtitle) to
   [`src/shared/layout/navigation.ts`](src/shared/layout/navigation.ts),
   which is the source of truth for path strings.
3. Add the matching route in [`src/app/router.tsx`](src/app/router.tsx).
4. If it needs data, add the endpoint to the control-plane first, then an
   `http*Gateway` that calls it through `shared/api/httpClient`.

## Design system

- **Tokens** live in
  [`src/shared/design-system/tokens.css`](src/shared/design-system/tokens.css):
  light/dark palettes, dual soft-shadow tokens, accent, and status
  colors. Reuse them instead of writing colors inline.
- **Primitives** are exported from
  [`src/shared/design-system/index.ts`](src/shared/design-system/index.ts):
  neomorphic surfaces (`Panel`, `Well`) for structure, and skeuomorphic
  controls (`Led`, `Toggle`, `RunButton`, `ProgressMeter`) for actions
  and live state.
- **Appearance** (theme, accent, chart style, 12 interface skins) is
  chosen on the Settings screen, held in
  [`src/app/theme-store.ts`](src/app/theme-store.ts), and saved to the
  control-plane (`/api/appearance-settings`).
