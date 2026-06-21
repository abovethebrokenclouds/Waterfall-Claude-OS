# Deploying the Auto-Shorts backend (for the Lovable frontend)

The Lovable frontend is hosted on Lovable. It calls this backend over HTTP at
`VITE_API_BASE_URL`. To integrate, deploy the backend (and render worker) so they
have a public URL, set CORS to the Lovable origin, then point Lovable at the URL.

The backend boots even without Postgres/Redis (it falls back to in-memory), so
you can start small and add the data services later.

---

## What needs to run

| Service | Image | Purpose |
|---------|-------|---------|
| **backend** | `infra/docker/backend.Dockerfile` | REST API + orchestrator (the URL Lovable calls) |
| **worker** | `infra/docker/worker.Dockerfile` | Whisper transcription + FFmpeg rendering (backend calls it) |
| postgres | `postgres:16` | persistence (optional; in-memory fallback) |
| redis | `redis:7` | render queue (optional; in-memory fallback) |
| S3 / MinIO | — | stores rendered MP4s (optional) |

The browser only ever talks to **backend**. `WORKER_URL` is an internal address.

---

## Required configuration

| Env (backend) | Value |
|---------------|-------|
| `ANTHROPIC_API_KEY` | your key — the only model credential (used via the Super Agent) |
| `CORS_ORIGINS` | your Lovable app origin, e.g. `https://your-app.lovable.app` (comma-separated for several) |
| `WORKER_URL` | internal URL of the worker, e.g. `http://worker:5001` |
| `DATABASE_URL` / `REDIS_URL` | optional; enable Postgres/Redis when set |

> Lock `CORS_ORIGINS` to your real frontend origin(s) in production. If unset, the
> API reflects any origin (handy for first tests, not for production).

---

## Option A — single Docker host / VPS (fastest)

```bash
cd auto-shorts
cp .env.example .env          # set ANTHROPIC_API_KEY and CORS_ORIGINS
docker compose -f infra/docker-compose.prod.yml --env-file .env up -d --build
```

This brings up backend (`:4000`), worker, Postgres, and Redis. Put a reverse
proxy + TLS (Caddy/Nginx/Traefik) in front of `:4000`, then your public URL is
e.g. `https://api.yourdomain.com`.

Verify: `curl https://api.yourdomain.com/health` → `{"status":"ok"}`.

## Option B — Render (managed, one blueprint)

1. Copy `auto-shorts/render.yaml` to the **repository root** (Render reads
   Blueprints from the root).
2. Render → **New → Blueprint** → pick this repo.
3. Fill the `sync: false` secrets: `ANTHROPIC_API_KEY`, `CORS_ORIGINS`, and the
   `S3_*` vars (or leave S3 unset to skip uploads).
4. Deploy. The backend gets a public `https://auto-shorts-backend.onrender.com`.

(Equivalent setups work on Railway, Fly.io, or Cloud Run — build the two
Dockerfiles with build context `auto-shorts/`.)

---

## Point Lovable at it

In the Lovable app, set **`VITE_API_BASE_URL`** to the backend's public URL
(or use the in-app Settings panel from the master prompt). Then:

1. Open the Lovable app, click **Settings → Test connection** (hits `/health`).
2. Paste a URL and **Generate** — calls flow to the deployed backend.

If you see CORS errors in the browser console, set `CORS_ORIGINS` on the backend
to the exact Lovable origin shown in the error and redeploy.

---

## Smallest possible first step

Just the backend, no data services, points at a worker:

```bash
docker build -f infra/docker/backend.Dockerfile -t auto-shorts-backend ./auto-shorts
docker run -p 4000:4000 \
  -e ANTHROPIC_API_KEY=sk-... \
  -e CORS_ORIGINS=https://your-app.lovable.app \
  -e WORKER_URL=http://your-worker:5001 \
  auto-shorts-backend
```

`/health` and the agent/orchestrator endpoints work immediately; render/transcribe
need the worker reachable at `WORKER_URL`.
