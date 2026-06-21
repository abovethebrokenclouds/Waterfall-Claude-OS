"""HTTP service the Node backend calls.

Exposes the worker's capabilities over the same contract the backend's
``WorkerIngestionService`` / ``WorkerTranscriptionService`` already POST to:

    POST /ingest      {url, sourceType, ingestionMethod, metadata} -> {audioRef, sourceRef}
    POST /transcribe  {audioRef}                                   -> {segments: [...]}
    POST /render      <RenderJob>                                  -> <RenderResult>

Dependencies are injected via ``create_app`` so the service is testable with the
fake backends and wired with real ones in production.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

from .ingest import Downloader, FakeDownloader
from .models import RenderJob
from .transcribe import FakeTranscriber, Transcriber
from .worker import render_job


class IngestRequest(BaseModel):
    url: str
    sourceType: str | None = None  # noqa: N815 - matches backend camelCase contract
    ingestionMethod: str = "http"  # noqa: N815
    metadata: dict[str, Any] = {}


class TranscribeRequest(BaseModel):
    audioRef: str  # noqa: N815


def create_app(
    transcriber: Transcriber | None = None,
    downloader: Downloader | None = None,
    *,
    dry_run_render: bool = True,
) -> FastAPI:
    transcriber = transcriber or FakeTranscriber()
    downloader = downloader or FakeDownloader()
    app = FastAPI(title="Auto-Shorts Render Worker")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/ingest")
    def ingest(req: IngestRequest) -> dict[str, Any]:
        ref = downloader.fetch_audio(req.url, req.ingestionMethod)
        return ref.to_dict()

    @app.post("/transcribe")
    def transcribe(req: TranscribeRequest) -> dict[str, Any]:
        segments = transcriber.transcribe(req.audioRef)
        return {
            "segments": [
                {"start": s.start, "end": s.end, "text": s.text} for s in segments
            ]
        }

    @app.post("/render")
    def render(job: dict[str, Any]) -> dict[str, Any]:
        parsed = RenderJob.from_dict(job)
        result = render_job(
            parsed,
            input_path=job.get("inputPath", "{INPUT}"),
            dry_run=dry_run_render,
        )
        return {
            "jobId": result.job_id,
            "shortId": result.short_id,
            "status": result.status,
            "outputPath": result.output_path,
            "command": result.command,
        }

    return app
