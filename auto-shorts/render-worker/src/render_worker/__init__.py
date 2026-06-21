"""Auto-Shorts render worker.

Consumes render jobs (declarative VideoSpecs produced by the backend) and renders
vertical shorts with FFmpeg, and transcribes audio with Whisper. The heavy
backends (faster-whisper, ffmpeg) are loaded lazily so the package imports — and
its tests run — with no native dependencies installed.
"""

from .app import create_app
from .consumer import FakeJobSource, JobSource, RedisJobSource, run_consumer
from .ffmpeg import build_ffmpeg_args
from .ingest import Downloader, FakeDownloader, MediaRef, YtDlpDownloader
from .models import RenderJob, WhisperSegment, video_spec_from_dict

__all__ = [
    "create_app",
    "run_consumer",
    "JobSource",
    "FakeJobSource",
    "RedisJobSource",
    "Downloader",
    "FakeDownloader",
    "YtDlpDownloader",
    "MediaRef",
    "build_ffmpeg_args",
    "RenderJob",
    "WhisperSegment",
    "video_spec_from_dict",
]
