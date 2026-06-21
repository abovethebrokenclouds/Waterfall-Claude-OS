# Auto-Shorts — render worker (Python)

The polyglot boundary of the platform. Everything else is Node/TypeScript; this
worker exists purely because **Whisper** (transcription) and **FFmpeg/MoviePy**
(rendering) are Python-native. It communicates with the backend only through the
render queue and the shared JSON contracts — never via direct calls.

## What it does

- **Transcription** (`transcribe.py`) — a `Transcriber` protocol with a
  deterministic `FakeTranscriber` for tests/dev and a lazily-loaded
  `WhisperTranscriber` (faster-whisper) for production.
- **Rendering** (`ffmpeg.py` + `worker.py`) — compiles a declarative `VideoSpec`
  (emitted by the backend's Video Template Builder) into an FFmpeg command and
  executes it, producing a vertical 9:16 MP4. `ffmpeg.py` is the Python executor
  counterpart to the backend's `ffmpegCommandGenerator`.
- **Models** (`models.py`) — light dataclasses mirroring the subset of the shared
  contracts the worker needs (`WhisperSegment`, `VideoSpec`, `RenderJob`).

Heavy native dependencies are optional extras and imported lazily, so the package
imports and its tests run with nothing but the standard library.

## Develop

```bash
cd auto-shorts/render-worker
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"      # add ".[whisper]" for the real Whisper backend
ruff check .
pytest -q
```

## Usage sketch

```python
from render_worker import RenderJob, build_ffmpeg_args
from render_worker.worker import render_job

job = RenderJob.from_dict(job_payload)        # from the queue
result = render_job(job, input_path="source.mp4", dry_run=True)
print(result.command)                          # the ffmpeg argv
```

## Next

A thin HTTP wrapper exposing `/ingest` and `/transcribe` (consumed by the
backend's `WorkerIngestionService` / `WorkerTranscriptionService`) and a Redis
consumer loop that pulls `RenderJob`s and uploads outputs to S3.
