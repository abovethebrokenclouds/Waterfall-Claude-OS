"""Auto-Shorts render worker.

Consumes render jobs (declarative VideoSpecs produced by the backend) and renders
vertical shorts with FFmpeg, and transcribes audio with Whisper. The heavy
backends (faster-whisper, ffmpeg) are loaded lazily so the package imports — and
its tests run — with no native dependencies installed.
"""

from .ffmpeg import build_ffmpeg_args
from .models import RenderJob, WhisperSegment, video_spec_from_dict

__all__ = [
    "build_ffmpeg_args",
    "RenderJob",
    "WhisperSegment",
    "video_spec_from_dict",
]
