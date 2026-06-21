"""Object storage backends.

An ``ObjectStore`` protocol with a deterministic ``FakeObjectStore`` for tests/dev
and a lazily-loaded ``S3ObjectStore`` for production. boto3 is imported only when
the real backend is constructed, so the module imports with no native deps.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class ObjectStore(Protocol):
    def upload(self, local_path: str, key: str) -> str:
        """Upload a local file under ``key`` and return its retrievable URL."""
        ...


class FakeObjectStore:
    """Records uploads and returns a deterministic URL — tests and offline dev."""

    def __init__(self, bucket: str = "fake-bucket") -> None:
        self.bucket = bucket
        self.uploaded: dict[str, str] = {}

    def upload(self, local_path: str, key: str) -> str:
        self.uploaded[key] = local_path
        return f"s3://{self.bucket}/{key}"


class S3ObjectStore:
    """S3-compatible backend (AWS S3 / MinIO). Install with the ``s3`` extra."""

    def __init__(
        self,
        bucket: str,
        *,
        endpoint_url: str | None = None,
        public_base_url: str | None = None,
    ) -> None:
        try:
            import boto3  # type: ignore import-not-found
        except ImportError as exc:  # pragma: no cover - exercised only in prod
            raise RuntimeError(
                "boto3 is not installed. Install the 's3' extra: pip install -e '.[s3]'"
            ) from exc
        self._bucket = bucket
        # Public base for building a retrievable URL (e.g. a CDN); falls back to s3://.
        self._public_base = public_base_url
        self._client = boto3.client("s3", endpoint_url=endpoint_url)

    def upload(self, local_path: str, key: str) -> str:  # pragma: no cover - network
        self._client.upload_file(local_path, self._bucket, key)
        if self._public_base:
            return f"{self._public_base.rstrip('/')}/{key}"
        return f"s3://{self._bucket}/{key}"
