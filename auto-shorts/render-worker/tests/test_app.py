from fastapi.testclient import TestClient

from render_worker.app import create_app

from .test_models import SPEC_DICT

client = TestClient(create_app())


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_ingest_returns_audio_ref():
    res = client.post(
        "/ingest",
        json={"url": "https://youtu.be/abc", "ingestionMethod": "yt-dlp"},
    )
    assert res.status_code == 200
    assert res.json()["audioRef"].startswith("fake://audio/")


def test_transcribe_returns_segments_in_backend_shape():
    res = client.post("/transcribe", json={"audioRef": "fake://audio/1.wav"})
    assert res.status_code == 200
    segments = res.json()["segments"]
    assert len(segments) == 2
    assert set(segments[0].keys()) == {"start", "end", "text"}


def test_render_endpoint_plans_command():
    job = {"id": "job_1", "shortId": "short_1", "spec": SPEC_DICT, "inputPath": "in.mp4"}
    res = client.post("/render", json=job)
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "planned"
    assert body["command"][0] == "ffmpeg"
    assert "in.mp4" in body["command"]
