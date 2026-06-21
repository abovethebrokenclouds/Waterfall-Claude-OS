from render_worker.models import RenderJob
from render_worker.transcribe import FakeTranscriber, Transcriber
from render_worker.worker import render_job

from .test_models import SPEC_DICT


def test_render_job_dry_run_builds_command_without_executing():
    job = RenderJob.from_dict({"id": "job_1", "shortId": "short_1", "spec": SPEC_DICT})
    result = render_job(job, "input.mp4", output_dir="/tmp/out", dry_run=True)
    assert result.status == "planned"
    assert result.output_path == "/tmp/out/short_1.mp4"
    assert result.command[0] == "ffmpeg"
    assert "input.mp4" in result.command


def test_fake_transcriber_satisfies_protocol():
    t = FakeTranscriber()
    assert isinstance(t, Transcriber)
    segments = t.transcribe("anything.wav")
    assert len(segments) == 2
    assert segments[0].text == "welcome to the show"
