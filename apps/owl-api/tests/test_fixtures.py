"""Every fixture must match the contract models, so the mock API never sends a shape the apps do not expect."""

import pytest

from app.models import Answer, CheckResult, Employee, HelpSession, Process, Recording
from app.store import FIXTURES, load_fixture

SHAPES = {
    "employee.json": Employee,
    "process-pick-pack.json": Process,
    "check-ok.json": CheckResult,
    "check-warning.json": CheckResult,
    "check-unsure.json": CheckResult,
    "answer.json": Answer,
    "answer-not-found.json": Answer,
    "help-session.json": HelpSession,
    "recording.json": Recording,
}


@pytest.mark.parametrize("name", sorted(SHAPES))
def test_fixture_matches_model(name):
    SHAPES[name].model_validate(load_fixture(name))


def test_every_fixture_is_covered():
    assert {p.name for p in FIXTURES.glob("*.json")} == set(SHAPES)


def test_fixture_media_exists():
    process = Process.model_validate(load_fixture("process-pick-pack.json"))
    for step in process.steps:
        for url in (step.reference_image_url, step.clip_url):
            if url:
                assert (FIXTURES / url.removeprefix("/")).is_file(), url


def test_say_fits_the_glasses():
    process = Process.model_validate(load_fixture("process-pick-pack.json"))
    for step in process.steps:
        assert len(step.say.split()) <= 25
