"""Render-job queue consumer.

A ``JobSource`` protocol with an in-memory ``FakeJobSource`` for tests/dev and a
lazily-loaded ``RedisJobSource`` for production. ``run_consumer`` pulls jobs and
hands each to a handler; ``max_jobs`` bounds the loop so it is unit-testable.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from typing import Any, Protocol, runtime_checkable

from .models import RenderJob
from .objectstore import ObjectStore
from .worker import RenderResult, render_job

logger = logging.getLogger("render_worker.consumer")

#: Called after each job with its result, e.g. to report status to the backend.
StatusReporter = Callable[[RenderResult], None]


def upload_output(
    result: RenderResult,
    object_store: ObjectStore,
    key: str,
) -> RenderResult:
    """Upload a finished render's file to object storage, setting ``output_url``.

    No-op for any non-``done`` result (nothing to upload yet).
    """
    if result.status == "done":
        result.output_url = object_store.upload(result.output_path, key)
    return result


def http_reporter(backend_url: str) -> StatusReporter:
    """Build a reporter that POSTs each result to the backend render callback."""

    def report(result: RenderResult) -> None:  # pragma: no cover - network
        import json as _json
        import urllib.request

        status = "done" if result.status in ("done", "planned") else "failed"
        payload = _json.dumps(
            {
                "jobId": result.job_id,
                "status": status,
                "outputUrl": result.output_url or result.output_path,
            }
        ).encode()
        req = urllib.request.Request(
            f"{backend_url.rstrip('/')}/api/render-callback",
            data=payload,
            headers={"content-type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=5).close()  # noqa: S310

    return report


@runtime_checkable
class JobSource(Protocol):
    def next_job(self, timeout: float = 5.0) -> dict[str, Any] | None: ...


class FakeJobSource:
    """Drains a fixed list of job payloads — used in tests and offline dev."""

    def __init__(self, jobs: list[dict[str, Any]]) -> None:
        self._jobs = list(jobs)

    def next_job(self, timeout: float = 5.0) -> dict[str, Any] | None:
        return self._jobs.pop(0) if self._jobs else None


class RedisJobSource:
    """Blocking-pop a job payload off a Redis list. Install the ``redis`` extra."""

    def __init__(self, url: str, queue_key: str = "auto-shorts:renders") -> None:
        try:
            import redis  # type: ignore import-not-found
        except ImportError as exc:  # pragma: no cover - exercised only in prod
            raise RuntimeError(
                "redis is not installed. Install the 'redis' extra: "
                "pip install -e '.[redis]'"
            ) from exc
        self._client = redis.Redis.from_url(url)
        self._key = queue_key

    def next_job(self, timeout: float = 5.0) -> dict[str, Any] | None:  # pragma: no cover
        item = self._client.blpop([self._key], timeout=int(timeout))
        if item is None:
            return None
        _key, payload = item
        return json.loads(payload)


def run_consumer(
    source: JobSource,
    *,
    input_resolver: Callable[[RenderJob], str] | None = None,
    reporter: StatusReporter | None = None,
    object_store: ObjectStore | None = None,
    key_prefix: str = "shorts",
    dry_run: bool = False,
    max_jobs: int | None = None,
) -> list[RenderResult]:
    """Consume jobs until the source is empty (or ``max_jobs`` is reached).

    For each job: render it, upload the output to ``object_store`` (if given and
    the render succeeded), append the result, and report it (if a ``reporter`` is
    given) — e.g. back to the backend render callback.
    """
    resolve = input_resolver or (lambda _job: "{INPUT}")
    results: list[RenderResult] = []
    processed = 0

    while max_jobs is None or processed < max_jobs:
        payload = source.next_job()
        if payload is None:
            break
        job = RenderJob.from_dict(payload)
        logger.info("consuming render job %s (short %s)", job.id, job.short_id)
        result = render_job(job, input_path=resolve(job), dry_run=dry_run)
        if object_store is not None:
            upload_output(result, object_store, f"{key_prefix}/{job.short_id}.mp4")
        results.append(result)
        if reporter is not None:
            reporter(result)
        processed += 1

    return results
