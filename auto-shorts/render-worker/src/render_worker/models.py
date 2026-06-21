"""Lightweight data models mirroring the shared platform contracts.

These intentionally validate only what the worker needs to render or transcribe.
The canonical source of truth is ``auto-shorts/shared/types`` (TypeScript) plus
the JSON Schemas in ``auto-shorts/shared/schemas``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class WhisperSegment:
    start: float
    end: float
    text: str

    @staticmethod
    def from_dict(d: dict[str, Any]) -> WhisperSegment:
        return WhisperSegment(
            start=float(d["start"]),
            end=float(d["end"]),
            text=str(d.get("text", "")).strip(),
        )


@dataclass(frozen=True)
class Source:
    start_sec: float
    end_sec: float

    @property
    def duration(self) -> float:
        return max(0.0, self.end_sec - self.start_sec)


@dataclass(frozen=True)
class Overlay:
    type: str
    position: dict[str, float]
    text: str | None = None
    font_size: int | None = None
    color: str | None = None
    timing: dict[str, float] | None = None


@dataclass(frozen=True)
class VideoSpec:
    """The subset of the backend's VideoSpec the renderer consumes."""

    id: str
    short_id: str
    width: int
    height: int
    fps: int
    source: Source
    background_type: str
    background_value: str
    overlays: list[Overlay] = field(default_factory=list)


def video_spec_from_dict(d: dict[str, Any]) -> VideoSpec:
    """Parse a VideoSpec JSON object (camelCase, as emitted by the backend)."""
    resolution = d["resolution"]
    src = d["source"]
    background = d.get("background", {"type": "blur", "value": "20"})
    overlays = [
        Overlay(
            type=o["type"],
            position=o["position"],
            text=o.get("text"),
            font_size=o.get("fontSize"),
            color=o.get("color"),
            timing=o.get("timing"),
        )
        for o in d.get("overlays", [])
    ]
    return VideoSpec(
        id=d["id"],
        short_id=d["shortId"],
        width=int(resolution["w"]),
        height=int(resolution["h"]),
        fps=int(d.get("fps", 30)),
        source=Source(start_sec=float(src["startSec"]), end_sec=float(src["endSec"])),
        background_type=background.get("type", "blur"),
        background_value=str(background.get("value", "20")),
        overlays=overlays,
    )


@dataclass
class RenderJob:
    id: str
    short_id: str
    spec: VideoSpec
    status: str = "queued"
    output_path: str | None = None
    error: str | None = None

    @staticmethod
    def from_dict(d: dict[str, Any]) -> RenderJob:
        return RenderJob(
            id=d["id"],
            short_id=d["shortId"],
            spec=video_spec_from_dict(d["spec"]),
            status=d.get("status", "queued"),
        )
