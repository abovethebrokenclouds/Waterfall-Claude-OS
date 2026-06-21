"""Render-job processing.

``render_job`` compiles a job's VideoSpec into an ffmpeg command and (unless in
dry-run) executes it. The Redis consumer loop is a thin wrapper that pulls jobs
and hands them here, kept dependency-light so the core logic is unit-testable.
"""

from __future__ import annotations

import logging
import subprocess
from dataclasses import dataclass

from .ffmpeg import build_ffmpeg_args
from .models import RenderJob

logger = logging.getLogger("render_worker")


@dataclass
class RenderResult:
    job_id: str
    short_id: str
    command: list[str]
    output_path: str
    status: str
    #: Set once the rendered file is uploaded to object storage.
    output_url: str | None = None


def render_job(
    job: RenderJob,
    input_path: str,
    output_dir: str = "/tmp/renders",
    dry_run: bool = False,
) -> RenderResult:
    """Render a single job. With ``dry_run`` the command is built but not run."""
    output_path = f"{output_dir.rstrip('/')}/{job.short_id}.mp4"
    args = build_ffmpeg_args(job.spec, input_path, output_path)

    if dry_run:
        logger.info("dry-run render for %s: %s", job.short_id, " ".join(args))
        return RenderResult(job.id, job.short_id, args, output_path, "planned")

    try:
        subprocess.run(args, check=True, capture_output=True)  # noqa: S603
        status = "done"
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:  # pragma: no cover
        logger.error("render failed for %s: %s", job.short_id, exc)
        status = "failed"

    return RenderResult(job.id, job.short_id, args, output_path, status)
