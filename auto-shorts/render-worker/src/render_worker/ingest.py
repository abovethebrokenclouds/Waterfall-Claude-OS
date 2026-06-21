"""Media ingestion backends.

A ``Downloader`` protocol with a deterministic ``FakeDownloader`` for tests/dev
and a lazily-loaded ``YtDlpDownloader`` for production. The yt-dlp dependency is
imported only when the real backend is constructed, so the module imports with no
native deps.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable


@dataclass(frozen=True)
class MediaRef:
    """Where the extracted audio (and optionally the source media) landed."""

    audio_ref: str
    source_ref: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"audioRef": self.audio_ref, "sourceRef": self.source_ref}


@runtime_checkable
class Downloader(Protocol):
    def fetch_audio(self, url: str, ingestion_method: str) -> MediaRef: ...


class FakeDownloader:
    """Returns a fixed reference — used in tests and offline dev."""

    def fetch_audio(self, url: str, ingestion_method: str) -> MediaRef:
        return MediaRef(audio_ref=f"fake://audio/{abs(hash(url)) % 10_000}.wav")


class YtDlpDownloader:
    """yt-dlp backend. Install with the ``ingest`` extra."""

    def __init__(self, work_dir: str = "/tmp/ingest") -> None:
        self._work_dir = work_dir.rstrip("/")

    def fetch_audio(self, url: str, ingestion_method: str) -> MediaRef:  # pragma: no cover
        try:
            import yt_dlp  # type: ignore import-not-found
        except ImportError as exc:
            raise RuntimeError(
                "yt-dlp is not installed. Install the 'ingest' extra: "
                "pip install -e '.[ingest]'"
            ) from exc

        out_tmpl = f"{self._work_dir}/%(id)s.%(ext)s"
        opts = {
            "format": "bestaudio/best",
            "outtmpl": out_tmpl,
            "postprocessors": [
                {"key": "FFmpegExtractAudio", "preferredcodec": "wav"}
            ],
            "quiet": True,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
        audio_path = f"{self._work_dir}/{info['id']}.wav"
        return MediaRef(audio_ref=audio_path, source_ref=url)
