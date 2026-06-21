from render_worker.consumer import upload_output
from render_worker.objectstore import FakeObjectStore, ObjectStore
from render_worker.worker import RenderResult


def test_fake_object_store_satisfies_protocol():
    store = FakeObjectStore()
    assert isinstance(store, ObjectStore)


def test_fake_object_store_records_and_returns_url():
    store = FakeObjectStore(bucket="auto-shorts")
    url = store.upload("/tmp/out/short_1.mp4", "shorts/short_1.mp4")
    assert url == "s3://auto-shorts/shorts/short_1.mp4"
    assert store.uploaded["shorts/short_1.mp4"] == "/tmp/out/short_1.mp4"


def _result(status: str) -> RenderResult:
    return RenderResult(
        job_id="job_1",
        short_id="short_1",
        command=["ffmpeg"],
        output_path="/tmp/out/short_1.mp4",
        status=status,
    )


def test_upload_output_sets_url_for_done_render():
    store = FakeObjectStore()
    result = upload_output(_result("done"), store, "shorts/short_1.mp4")
    assert result.output_url == "s3://fake-bucket/shorts/short_1.mp4"


def test_upload_output_skips_non_done_render():
    store = FakeObjectStore()
    result = upload_output(_result("failed"), store, "shorts/short_1.mp4")
    assert result.output_url is None
    assert store.uploaded == {}
