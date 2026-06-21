from render_worker.consumer import FakeJobSource, JobSource, run_consumer

from .test_models import SPEC_DICT


def _job(short_id: str) -> dict:
    return {"id": f"job_{short_id}", "shortId": short_id, "spec": SPEC_DICT}


def test_fake_source_satisfies_protocol():
    assert isinstance(FakeJobSource([]), JobSource)


def test_run_consumer_drains_all_jobs():
    source = FakeJobSource([_job("a"), _job("b"), _job("c")])
    results = run_consumer(source, dry_run=True)
    assert [r.short_id for r in results] == ["a", "b", "c"]
    assert all(r.status == "planned" for r in results)


def test_run_consumer_respects_max_jobs():
    source = FakeJobSource([_job("a"), _job("b"), _job("c")])
    results = run_consumer(source, dry_run=True, max_jobs=2)
    assert len(results) == 2


def test_run_consumer_uses_input_resolver():
    source = FakeJobSource([_job("a")])
    results = run_consumer(
        source, dry_run=True, input_resolver=lambda job: f"/media/{job.short_id}.mp4"
    )
    assert "/media/a.mp4" in results[0].command


def test_run_consumer_reports_each_result():
    source = FakeJobSource([_job("a"), _job("b")])
    reported = []
    run_consumer(source, dry_run=True, reporter=reported.append)
    assert [r.short_id for r in reported] == ["a", "b"]
