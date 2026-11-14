"""Every fixture must match the contract models, so the mock API never sends a shape the apps do not expect."""

import pytest

from app.models import Answer, CheckResult, Employee, HelpSession, Process, Recording
from app.store import FIXTURES, load_fixture

SHAPES = {
    "employee.json": Employee,
    "employee-mikko.json": Employee,
    "employee-amina.json": Employee,
    "employee-leo.json": Employee,
    "employee-ville.json": Employee,
    "employee-noa.json": Employee,
    "process-pick-pack.json": Process,
    "process-pick-pack.fi.json": Process,
    "process-bakery-rye.json": Process,
    "process-bakery-rye.fi.json": Process,
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
    # demo-script.json is not an API shape; tests/test_demo.py checks it. training.json and zones.json: their own tests.
    assert {p.name for p in FIXTURES.glob("*.json")} - {"demo-script.json", "training.json", "zones.json"} == set(SHAPES)


PROCESSES = ["process-pick-pack.json", "process-pick-pack.fi.json", "process-bakery-rye.json", "process-bakery-rye.fi.json"]
TRANSLATIONS = [("process-pick-pack.json", "process-pick-pack.fi.json"), ("process-bakery-rye.json", "process-bakery-rye.fi.json")]


@pytest.mark.parametrize("name", PROCESSES)
def test_fixture_media_exists(name):
    process = Process.model_validate(load_fixture(name))
    for step in process.steps:
        for url in (step.reference_image_url, step.clip_url):
            if url:
                assert (FIXTURES / url.removeprefix("/")).is_file(), url


@pytest.mark.parametrize("name", PROCESSES)
def test_say_fits_the_glasses(name):
    process = Process.model_validate(load_fixture(name))
    for step in process.steps:
        assert len(step.say.split()) <= 25


@pytest.mark.parametrize(("original_name", "finnish_name"), TRANSLATIONS)
def test_translation_keeps_everything_but_the_words(original_name, finnish_name):
    """A translated process is checked by the same engine: same steps, media, check kinds, SKUs and quantities."""
    original = Process.model_validate(load_fixture(original_name))
    finnish = Process.model_validate(load_fixture(finnish_name))
    assert (finnish.id, finnish.language, finnish.status) == (original.id, "fi", original.status)
    assert len(finnish.steps) == len(original.steps)
    for a, b in zip(original.steps, finnish.steps, strict=True):
        assert (a.id, a.index, a.reference_image_url, a.clip_url, a.check.kind) == (b.id, b.index, b.reference_image_url, b.clip_url, b.check.kind)
        assert len(a.check.criteria) == len(b.check.criteria)
        assert [(line.sku, line.qty) for line in a.check.order_lines or []] == [(line.sku, line.qty) for line in b.check.order_lines or []]
        assert b.title != a.title and b.instruction != a.instruction
