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
from .worker import RenderResult, render_job

logger = logging.getLogger("render_worker.consumer")


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
    dry_run: bool = False,
    max_jobs: int | None = None,
) -> list[RenderResult]:
    """Consume jobs until the source is empty (or ``max_jobs`` is reached)."""
    resolve = input_resolver or (lambda _job: "{INPUT}")
    results: list[RenderResult] = []
    processed = 0

    while max_jobs is None or processed < max_jobs:
        payload = source.next_job()
        if payload is None:
            break
        job = RenderJob.from_dict(payload)
        logger.info("consuming render job %s (short %s)", job.id, job.short_id)
        results.append(render_job(job, input_path=resolve(job), dry_run=dry_run))
        processed += 1

    return results
