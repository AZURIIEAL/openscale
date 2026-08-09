# OpenScale control-plane UI — tech stack decisions

Concrete architecture decisions for the neomorphic/skeuomorphic control-panel
UI, following on from [`brainstorm.md`](brainstorm.md). Unlike that file,
this one records actual decisions, not open options.

---

## Decision: two-language backend

The existing data/ML pipeline (ingestion, Silver, Gold, feature store, ML
training) stays **Python** — non-negotiable, since it depends on
Spark/pandas/MLflow/scikit-learn, none of which have real substitutes in
another language.

The **new control-plane API** (serves the UI, triggers jobs, watches
Docker/Kafka/service health, pushes live status over WebSockets) is
**Go**, not Python. Reasoning:

- Matches the language Docker, Kubernetes, Prometheus, Terraform, and
  Grafana's backend are written in — thematically and technically aligned
  with a tool whose pitch is "controls all your infra."
- Single static binary deploy — no venv/pip, which structurally rules out
  the two dependency-drift bugs already hit in this project
  (`docs/issues-and-fixes.md` #4 and #15).
- Strong concurrency primitives for many WebSocket connections / polling
  several services at once, without FastAPI's async ceremony.

**Known cost, accepted knowingly:** this is now a two-language project —
two toolchains, two CI setups, cross-language debugging at the boundary.
Not a decision to take lightly on a single-maintainer project, but decided
in favor of the stronger control-plane story.

---

## Frontend

| Layer | Pick | Why |
|---|---|---|
| Framework | React 18 + TypeScript + Vite | Best ecosystem for admin/control-panel UIs; no SSR/SEO need, so Vite over Next.js — see "Why not Next.js" below |
| Component primitives | shadcn/ui (Radix + Tailwind) | Unstyled, accessible primitives — fully skinnable into the neomorphic look, which has no trustworthy off-the-shelf kit |
| Styling | Tailwind CSS, custom `shadow-neo-in`/`shadow-neo-out` tokens | Neomorphism is a disciplined dual-shadow technique — define once, reuse everywhere |
| Charts | ECharts (`echarts-for-react`) | Handles time-series/streaming updates and larger datasets better than Recharts; gauges/dials fit the skeuomorphic "console" aesthetic |
| Server state | TanStack Query | Built for exactly this: polling job/service status, caching Gold queries, auto-refetch |
| Client/UI state | Zustand | Minimal, only for UI-local state (panel open/closed etc.) |
| Real-time | Native WebSocket API | Talks to the Go control-plane's WS endpoints for live pipeline/streaming status |

### Visual design system — decided

Four directions were mocked up as static HTML/CSS previews (Home screen,
real project content — service health, Spark memory gauges, daily-revenue
sparkline, recent-runs table) to compare neomorphic/skeuomorphic
treatments before committing: a cool-slate/teal "refined console," a dark
cockpit/instrument-panel look, a warm studio mixing-desk look, and an
industrial factory-panel look. **Chosen: the cool-slate/teal refined
console** — softest and most "premium software" of the four, both light
and dark themes fully tokenized (the other three each committed to a
single theme as a deliberate stylistic choice).

Canonical tokens (light theme; dark-theme values are the direct
`prefers-color-scheme`/`data-theme` overrides used in the mockup):

| Token | Value | Use |
|---|---|---|
| `--bg` / `--surface` | `#e3e7ec` | Neomorphic ground — panels emerge from this via shadow only, not color |
| `--ink` | `#262b33` | Primary text |
| `--ink-muted` | `#6b7480` | Secondary text/labels |
| `--ink-faint` | `#9aa3ae` | Tertiary (table headers, captions) |
| `--accent` | `#3e6e6b` | Verdigris teal — primary actions, active nav, focus rings. Deliberately separate from semantic color |
| `--good` | `#3f8a4d` | Status: healthy/success |
| `--warn` | `#b8811f` | Status: degraded |
| `--crit` | `#b23c31` | Status: failed/critical |
| shadow (raised) | `8px 8px 16px rgba(163,177,198,.55), -8px -8px 16px rgba(255,255,255,.85)` | `.panel` |
| shadow (inset/pressed) | `inset 4px 4px 9px rgba(163,177,198,.55), inset -4px -4px 9px rgba(255,255,255,.85)` | `.well`, active nav item |

**Type pairing** (all embedded as real `@font-face` data URIs in the
mockups, not system-font fallbacks):
- **Big Shoulders Display** (weight 800) — wordmark, panel nameplates,
  big numbers. Condensed/industrial, reads like embossed metal lettering.
- **IBM Plex Sans** (400/600) — body text, nav labels, descriptions.
  Chosen over Inter/Space Grotesk deliberately — Plex has a technical/
  engineering heritage (designed by IBM for technical documentation) that
  fits a data-platform subject; Inter/Space Grotesk are the generic
  "safe" default.
- **IBM Plex Mono** (500) — every numeric readout, table figure,
  timestamp, and log line. `font-variant-numeric: tabular-nums` wherever
  digits line up in columns.

**Component language:** neomorphic soft dual-shadow panels for structure
(cards, tables, the console rail); skeuomorphic treatment reserved for
*controls specifically* — LED-style status dots (radial gradient + glow),
circular SVG gauges for resource metrics, an embossed push-button style
for run/trigger actions. High-contrast override intended for destructive
actions (stop pipeline, delete table) — not yet built into the mockup,
flagged as a real requirement before Phase 0 implementation, since
neomorphism's low contrast is a genuine accessibility risk there.

### Why not Next.js

Considered and rejected for the control-plane app itself: Next's core value
(SSR/RSC, SEO, Vercel-native deploy) doesn't apply to a **local control
panel opened by the same person running the Docker stack** — no public
internet, no SEO, no cold visitor on a slow connection. Real SSR value
would also require a Node.js server process running (`next start`) — a
*third* runtime alongside Go and Python, working directly against the
project's "just `docker compose up`, nothing complicated" positioning. And
the Go control-plane already owns backend logic, so Next's API routes
would just be a confusing fourth place for it to live.

**Where Next.js would be the right call:** a separate, small **public
marketing/docs site** for OpenScale as an OSS project — landing page,
docs, "why this exists" content that benefits from being fast and
indexable. That's a genuine SSR/SEO use case, shelved as a later, separate
project rather than a replacement for the control-plane app.

## Backend — control plane (Go)

| Layer | Pick | Why |
|---|---|---|
| HTTP framework | chi | Thin router on stdlib `net/http` — stays compatible with the standard middleware ecosystem, unlike Fiber's fasthttp |
| WebSockets | `nhooyr.io/websocket` | Modern, context-aware API; actively developed, unlike the now community-maintained `gorilla/websocket` |
| Postgres | `pgx` driver + `sqlc` | Type-safe Go generated from real SQL, no ORM magic |
| Redis client | `go-redis` | Job queue dispatch + reads from the existing Python-written online feature store |
| Docker control | `docker/docker` official Go SDK (Engine API) | Programmatic container start/stop/inspect/logs — not shelling out to the `docker compose` CLI and parsing text |
| Logging | `zerolog` | Minimal, fast, structured |
| Config | `caarlos0/env` | Struct-tag env parsing, skip Viper's extra weight |
| Dev hot-reload | `air` | Same "save and see it" loop as Vite on the frontend |
| API contract | Spec-first OpenAPI (hand-written or `oapi-codegen`-generated) -> `openapi-typescript` for the frontend client | Preserves zero-drift typed client, previously free via FastAPI's introspection |

## Backend — data/ML workers (Python, unchanged)

Existing scripts (`ingestion/run_ingestion.py`, `spark/gold/run_gold.py`,
`feature-store/feature-jobs/compute_features.py`,
`ml/training/train_fare_model.py`, etc.) run exactly as they do today. A
long-running **Python worker process** wraps them:

- Reads job requests from a **Redis Stream** via `redis-py`'s
  `XREADGROUP` (consumer-group semantics — safe with multiple workers,
  each job processed exactly once).
- Job message shape: `{job_id, job_type, params, submitted_at}` (JSON).
- Runs the corresponding existing script/function unchanged.
- Writes status/results to a `control_plane.job_runs` table in the
  existing Postgres instance — Redis Streams is dispatch only, Postgres is
  the system of record for job history the UI queries.

## Database

| Need | Pick | Why |
|---|---|---|
| Control-plane metadata (job history, UI preferences) | New schema in the existing Postgres | Zero new infra |
| Ad-hoc SQL from the UI | DuckDB directly against Gold/Silver Parquet on MinIO | Interactive "serverless SQL" without standing up Trino |

## Auth

Deliberately skipped for v1 — matches the "laptop-first, local tool"
positioning. Revisit only if this becomes something people deploy
shared/remotely.

## Packaging

Plain browser-based web app (Go control-plane serving/proxying to the React
build), not Electron/Tauri — matches the pattern MinIO console, Grafana,
and MLflow UI already use in this stack.
