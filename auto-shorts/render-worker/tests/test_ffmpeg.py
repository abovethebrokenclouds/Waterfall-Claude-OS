from render_worker.ffmpeg import build_ffmpeg_args, build_filter_complex
from render_worker.models import video_spec_from_dict

from .test_models import SPEC_DICT


def test_filter_complex_includes_blur_and_drawtext():
    spec = video_spec_from_dict(SPEC_DICT)
    fc = build_filter_complex(spec)
    assert "boxblur=20" in fc
    assert "drawtext=" in fc
    assert "Hooky hook" in fc
    assert fc.endswith("[v]")


def test_filter_complex_color_background_has_no_blur():
    d = {**SPEC_DICT, "background": {"type": "color", "value": "#0B0B0F"}, "overlays": []}
    spec = video_spec_from_dict(d)
    fc = build_filter_complex(spec)
    assert "boxblur" not in fc
    assert "copy[v]" in fc


def test_build_ffmpeg_args_trims_source_window():
    spec = video_spec_from_dict(SPEC_DICT)
    args = build_ffmpeg_args(spec, "in.mp4", "out.mp4")
    assert args[0] == "ffmpeg"
    # 15s window starting at 10s
    assert args[args.index("-ss") + 1] == "10.0"
    assert args[args.index("-t") + 1] == "15.000"
    assert args[args.index("-i") + 1] == "in.mp4"
    assert args[-1] == "out.mp4"
    assert "-filter_complex" in args
