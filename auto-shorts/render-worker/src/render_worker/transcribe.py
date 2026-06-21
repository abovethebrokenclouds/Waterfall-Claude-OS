"""Transcription backends.

A ``Transcriber`` protocol with a deterministic fake for tests and a lazily-loaded
faster-whisper implementation for production. The ML dependency is imported only
when the real backend is instantiated, so the module imports with no native deps.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from .models import WhisperSegment


@runtime_checkable
class Transcriber(Protocol):
    def transcribe(self, audio_path: str) -> list[WhisperSegment]: ...


class FakeTranscriber:
    """Returns a fixed transcript — used in tests and offline dev."""

    def __init__(self, segments: list[WhisperSegment] | None = None) -> None:
        self._segments = segments or [
            WhisperSegment(0.0, 2.5, "welcome to the show"),
            WhisperSegment(2.5, 5.0, "today we talk about ai"),
        ]

    def transcribe(self, audio_path: str) -> list[WhisperSegment]:
        return list(self._segments)


class WhisperTranscriber:
    """faster-whisper backend. Install with the ``whisper`` extra."""

    def __init__(self, model_size: str = "base") -> None:
        try:
            from faster_whisper import WhisperModel  # type: ignore import-not-found
        except ImportError as exc:  # pragma: no cover - exercised only in prod
            raise RuntimeError(
                "faster-whisper is not installed. Install the 'whisper' extra: "
                "pip install -e '.[whisper]'"
            ) from exc
        self._model = WhisperModel(model_size)

    def transcribe(self, audio_path: str) -> list[WhisperSegment]:  # pragma: no cover
        segments, _info = self._model.transcribe(audio_path)
        return [WhisperSegment(s.start, s.end, s.text.strip()) for s in segments]
