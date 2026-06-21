"""Compile a declarative VideoSpec into an FFmpeg invocation.

This is the Python-side executor counterpart to the backend's
``ffmpegCommandGenerator`` — the backend plans specs; the worker renders them.
Pure and deterministic so it is fully unit-testable without invoking ffmpeg.
"""

from __future__ import annotations

import shlex

from .models import Overlay, VideoSpec


def _escape_drawtext(text: str) -> str:
    return text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’")


def _draw_text_filter(o: Overlay, width: int, height: int) -> str:
    x = round(o.position.get("x", 0.5) * width)
    y = round(o.position.get("y", 0.5) * height)
    size = o.font_size or 48
    color = (o.color or "#FFFFFF").replace("#", "0x")
    parts = [
        f"text='{_escape_drawtext(o.text or '')}'",
        f"x=({x}-text_w/2)",
        f"y=({y}-text_h/2)",
        f"fontsize={size}",
        f"fontcolor={color}",
        "box=1",
        "boxcolor=0x00000088",
        "boxborderw=20",
    ]
    if o.timing:
        parts.append(f"enable='between(t,{o.timing['startSec']},{o.timing['endSec']})'")
    return "drawtext=" + ":".join(parts)


def build_filter_complex(spec: VideoSpec) -> str:
    w, h = spec.width, spec.height
    cover = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}"

    if spec.background_type == "blur":
        background = (
            "split=2[bg][fg];"
            f"[bg]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},"
            f"boxblur={spec.background_value}[bgb];"
            f"[fg]scale={w}:-1[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2"
        )
    else:
        background = cover

    text_filters = [
        _draw_text_filter(o, w, h) for o in spec.overlays if o.type == "text" and o.text
    ]

    graph = [f"[0:v]{background}[base]"]
    if text_filters:
        graph.append("[base]" + ",".join(text_filters) + "[v]")
    else:
        graph.append("[base]copy[v]")
    return ";".join(graph)


def build_ffmpeg_args(spec: VideoSpec, input_path: str, output_path: str) -> list[str]:
    """Build the full ffmpeg argv (including the leading 'ffmpeg')."""
    return [
        "ffmpeg",
        "-y",
        "-ss",
        str(spec.source.start_sec),
        "-t",
        f"{spec.source.duration:.3f}",
        "-i",
        input_path,
        "-filter_complex",
        build_filter_complex(spec),
        "-map",
        "[v]",
        "-map",
        "0:a?",
        "-r",
        str(spec.fps),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        output_path,
    ]


def build_ffmpeg_command(spec: VideoSpec, input_path: str, output_path: str) -> str:
    """A copy-paste-ready shell string for inspection/debugging."""
    return shlex.join(build_ffmpeg_args(spec, input_path, output_path))
