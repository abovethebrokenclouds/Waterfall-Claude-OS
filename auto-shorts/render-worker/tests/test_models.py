from render_worker.models import RenderJob, WhisperSegment, video_spec_from_dict

SPEC_DICT = {
    "id": "spec_1",
    "shortId": "short_1",
    "aspectRatio": "9:16",
    "resolution": {"w": 1080, "h": 1920},
    "fps": 30,
    "source": {"startSec": 10, "endSec": 25},
    "background": {"type": "blur", "value": "20"},
    "overlays": [
        {
            "type": "text",
            "text": "Hooky hook",
            "position": {"x": 0.5, "y": 0.18},
            "fontSize": 72,
            "color": "#FFFFFF",
            "timing": {"startSec": 0, "endSec": 3},
        }
    ],
}


def test_whisper_segment_from_dict_trims_text():
    seg = WhisperSegment.from_dict({"start": "1.0", "end": "2.0", "text": "  hi  "})
    assert seg == WhisperSegment(1.0, 2.0, "hi")


def test_video_spec_from_dict_parses_camel_case():
    spec = video_spec_from_dict(SPEC_DICT)
    assert spec.width == 1080
    assert spec.height == 1920
    assert spec.source.duration == 15
    assert spec.background_type == "blur"
    assert len(spec.overlays) == 1
    assert spec.overlays[0].font_size == 72


def test_render_job_from_dict():
    job = RenderJob.from_dict({"id": "job_1", "shortId": "short_1", "spec": SPEC_DICT})
    assert job.id == "job_1"
    assert job.spec.short_id == "short_1"
    assert job.status == "queued"
