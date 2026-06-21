# Auto-Shorts AI

Turn any URL — a YouTube video, a podcast page, a direct video link — into a set
of platform-ready short-form videos (TikTok, Instagram Reels, YouTube Shorts,
Facebook, X), complete with captions, hooks, layouts, and platform-specific copy.

Paste a URL → the system ingests and transcribes the media, an agent pipeline
detects the highlights and plans the shorts, and you get back a grid of editable,
downloadable vertical videos with ready-to-post titles, descriptions, and hashtags.

> **Where this lives.** This platform is scaffolded under `auto-shorts/` inside the
> `Waterfall-Claude-OS` repo so it does not disturb that repo's role as the
> canonical Waterfall skill registry. All platform code, config, and docs stay
> inside this directory.

---

## How it works

```
URL
 │
 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Master Orchestrator  (backend/src/services/orchestrator.ts)          │
│                                                                        │
│  1. URL Ingestion Agent      → source_type, ingestion_method, metadata │
│  2. Media Ingestion          → download + extract audio (yt-dlp)       │
│  3. Transcription            → Whisper segments        [render-worker] │
│  4. Transcript Cleaner       → time-aligned caption chunks             │
│  5. Highlight Detection      → scored highlight segments               │
│  6. Short-Form Planner       → ShortPlan[] (hook, timestamps, layout)  │
│  7. Video Template Builder   → VideoSpec[] (aspect, overlays, captions)│
│  8. Platform Copywriter      → per-platform titles/desc/hashtags       │
└──────────────────────────────────────────────────────────────────────┘
 │
 ▼
Single JSON: { ingestion, transcript, highlights, shorts, video_specs, platform_copy }
 │
 ▼
Render workers consume jobs from Redis → vertical MP4s with captions → S3
 │
 ▼
Web UI: grid of shorts (preview, edit copy, download)
```

The pipeline produces a **declarative** output. Planning and copy are pure
JSON; rendering is driven by `VideoSpec` → an FFmpeg command, so a short can be
re-rendered deterministically and inspected before any pixels are produced.

---

## Architecture

| Layer | Tech | Responsibility |
|-------|------|----------------|
| **Frontend** | Next.js · React · Tailwind CSS | URL input, results grid, edit modal, per-platform copy tabs |
| **Backend** | Node.js · TypeScript · Express | REST API, Master Orchestrator, the 8 Claude agents |
| **Render worker** | Python · Whisper · FFmpeg / MoviePy | Transcription + video rendering, consumed from a queue |
| **Datastore** | Postgres | Jobs, shorts, specs, copy |
| **Object storage** | S3-compatible (MinIO in dev) | Source media + rendered MP4s |
| **Queue** | Redis | Render-job fan-out to workers |
| **AI** | Whisper (transcription) · Claude (planning + copy) | — |

**Why two languages.** TypeScript is the primary backend so the agents share
the exact `ShortPlan` / `VideoSpec` / `BrandKit` types with the Next.js UI via
`shared/`. Python is confined to `render-worker/` purely because Whisper and
FFmpeg/MoviePy are Python-native. The two halves never call each other directly —
they communicate through the Redis queue and the JSON Schemas in `shared/schemas/`.

---

## Repo layout

```
auto-shorts/
├─ frontend/        Next.js + Tailwind web UI
├─ backend/         Node/TS API, orchestrator, and the 8 agents
│  └─ src/
│     ├─ api/       HTTP route handlers
│     ├─ agents/    one module per agent (urlIngestion, highlightDetector, …)
│     ├─ services/  orchestrator, ingestion, storage, queue
│     ├─ models/    Postgres repositories
│     ├─ workers/   job producers + worker glue
│     └─ config/    env, logger, Super-Agent client
├─ render-worker/   Python: Whisper transcription + FFmpeg/MoviePy rendering
├─ shared/          types/ · schemas/ · prompts/  (cross-language contracts)
└─ infra/           docker/ · k8s/ · terraform/
```

### Core contracts (defined once in `shared/`)

`BrandKit` · `ShortPlan` · `VideoSpec` · `RenderJob` · `PlatformCopy` —
expressed as TypeScript types and mirrored as JSON Schema so both the Node
backend and the Python worker validate the same shape.

---

## Quickstart (local)

> Requires Docker + Docker Compose. First boot pulls Postgres, Redis, and MinIO.

```bash
cd auto-shorts
cp .env.example .env          # then fill in ANTHROPIC_API_KEY etc. (see below)
docker compose up --build
```

| Service | URL |
|---------|-----|
| Web UI | http://localhost:3000 |
| API | http://localhost:4000 |
| MinIO console | http://localhost:9001 |

### Running pieces individually

```bash
# Backend (API + orchestrator)
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev

# Render worker
cd render-worker && pip install -e . && python -m src.queue.consumer
```

---

## API surface

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/ingest-url` | Resolve a URL → source type + metadata |
| `POST` | `/api/generate-shorts` | **Master Orchestrator** — URL + prefs → full shorts JSON |
| `POST` | `/api/generate-plan` | Re-run planning on an existing transcript |
| `POST` | `/api/render-short` | Enqueue a `RenderJob` for one short |
| `GET`  | `/api/shorts/:id` | Fetch a short (plan, spec, copy, render status) |

`POST /api/generate-shorts` accepts a URL plus optional preferences (brand kit,
number of shorts, target platforms) and returns one JSON object containing
`ingestion`, `transcript`, `highlights`, `shorts`, `video_specs`, and
`platform_copy`. Rendering is asynchronous and enqueued separately.

---

## Configuration

Copy `.env.example` → `.env`. Key variables:

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude access for the planning + copy agents |
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string for the render queue |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Object storage |
| `WHISPER_MODEL` | Whisper model size (e.g. `base`, `small`, `medium`) |

> AI calls go through the platform's reasoning-engine client in
> `backend/src/config/` — app code refers to model **tiers**, never hardcoded
> model strings or manual token caps.

---

## Testing

```bash
cd backend && npm test          # agent I/O, orchestrator, API unit tests
cd frontend && npm test         # component tests
cd render-worker && pytest      # transcription + render unit tests
```

Integration tests cover the end-to-end **URL → shorts JSON** flow with the model
and media layers mocked, so the full pipeline is verified without rendering.

---

## CI / CD

`.github/workflows/ci.yml` (at the repo root) installs, lints, tests, and builds
the frontend and backend on every push and pull request touching `auto-shorts/**`.
PR labelling and label-gated auto-merge are added in follow-up workflows.

---

## Status

🚧 **Scaffolding.** This README and the CI workflow are the first deliverables.
Agent modules, the orchestrator, the API, the worker, and the UI land in
subsequent PRs against `claude/auto-shorts-platform-setup-ofqik8`.

Support: `support@waterfalltechnologies.net`
