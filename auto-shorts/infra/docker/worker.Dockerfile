# Auto-Shorts render worker (Python) — production image.
# Build context must be the `auto-shorts/` directory.
# Build:  docker build -f infra/docker/worker.Dockerfile -t auto-shorts-worker .
FROM python:3.12-slim AS runtime

# ffmpeg is required for rendering; ca-certificates for outbound HTTPS (yt-dlp/S3).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/render-worker
COPY render-worker ./

# Install with the production extras: HTTP server, Whisper, ingestion, Redis, S3.
RUN pip install --no-cache-dir -e ".[server,whisper,ingest,redis,s3]"

ENV PORT=5001 \
    RENDER_DRY_RUN=0
EXPOSE 5001
# Serves /ingest, /transcribe, /render, /health (see render_worker/app.py).
CMD ["python", "-m", "render_worker"]
