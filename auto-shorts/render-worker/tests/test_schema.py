"""The worker validates its wire payloads against the SAME shared JSON Schema the
backend validates against, so a drift between the TypeScript types and the Python
models surfaces here as a failing test."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft7Validator
from jsonschema.exceptions import ValidationError

from .test_models import SPEC_DICT

SCHEMA_PATH = (
    Path(__file__).resolve().parents[2] / "shared" / "schemas" / "contracts.schema.json"
)
CONTRACTS = json.loads(SCHEMA_PATH.read_text())


def _validator(def_name: str) -> Draft7Validator:
    return Draft7Validator({"$ref": f"#/$defs/{def_name}", "$defs": CONTRACTS["$defs"]})


def test_spec_fixture_conforms_to_video_spec_schema():
    _validator("VideoSpec").validate(SPEC_DICT)


def test_render_job_payload_conforms_to_render_job_schema():
    job = {
        "id": "job_1",
        "shortId": "short_1",
        "spec": SPEC_DICT,
        "status": "queued",
        "createdAt": "2026-06-21T00:00:00Z",
    }
    _validator("RenderJob").validate(job)


def test_schema_rejects_bad_aspect_ratio():
    bad = {**SPEC_DICT, "aspectRatio": "16:9"}
    with pytest.raises(ValidationError):
        _validator("VideoSpec").validate(bad)
