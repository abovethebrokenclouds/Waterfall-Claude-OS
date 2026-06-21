# Auto-Shorts — render worker (Python)

The polyglot boundary of the platform. Everything else is Node/TypeScript; this
worker exists purely because **Whisper** (transcription) and **FFmpeg/MoviePy**
(rendering) are Python-native. It communicates with the backend only through the
render queue and the shared JSON contracts — never via direct calls.

## What it does

- **HTTP service** (`app.py`) — a FastAPI app exposing the exact contract the
  backend's worker services call: `POST /ingest`, `POST /transcribe`,
  `POST /render`, `GET /health`. Run it with `python -m render_worker`.
- **Queue consumer** (`consumer.py`) — a `JobSource` protocol with an in-memory
  `FakeJobSource` and a lazily-loaded `RedisJobSource`; `run_consumer` drains
  render jobs and hands each to the renderer (`max_jobs` bounds it for tests).
- **Transcription** (`transcribe.py`) — a `Transcriber` protocol with a
  deterministic `FakeTranscriber` for tests/dev and a lazily-loaded
  `WhisperTranscriber` (faster-whisper) for production.
- **Ingestion** (`ingest.py`) — a `Downloader` protocol with a `FakeDownloader`
  and a lazily-loaded `YtDlpDownloader`.
- **Rendering** (`ffmpeg.py` + `worker.py`) — compiles a declarative `VideoSpec`
  (emitted by the backend's Video Template Builder) into an FFmpeg command and
  executes it, producing a vertical 9:16 MP4. `ffmpeg.py` is the Python executor
  counterpart to the backend's `ffmpegCommandGenerator`.
- **Models** (`models.py`) — light dataclasses mirroring the subset of the shared
  contracts the worker needs (`WhisperSegment`, `VideoSpec`, `RenderJob`).

FastAPI is the only core dependency; the heavy native backends (Whisper, ffmpeg,
yt-dlp, redis, uvicorn) are optional extras imported lazily, so the package
imports and its tests run with no native deps.

## Develop

```bash
cd auto-shorts/render-worker
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"      # add whisper/ingest/redis/server extras as needed
ruff check .
pytest -q

# serve the HTTP API the backend calls (needs the 'server' extra)
pip install -e ".[server]"
python -m render_worker        # listens on :5001, dry-run rendering by default
```

Point the backend at it with `WORKER_URL=http://localhost:5001`.

## Usage sketch

```python
from render_worker import RenderJob, build_ffmpeg_args
from render_worker.worker import render_job

job = RenderJob.from_dict(job_payload)        # from the queue
result = render_job(job, input_path="source.mp4", dry_run=True)
print(result.command)                          # the ffmpeg argv
```

## Object storage

`objectstore.py` provides an `ObjectStore` protocol with a `FakeObjectStore`
(tests/dev) and a lazily-loaded `S3ObjectStore` (AWS S3 / MinIO, `s3` extra).
When `run_consumer` is given an `object_store`, each successful render is
uploaded and its `output_url` is reported back to the backend callback.

## Next

Add a consumer entrypoint that wires `RedisJobSource` + `S3ObjectStore` +
`http_reporter` from env, and stream large renders instead of buffering.
