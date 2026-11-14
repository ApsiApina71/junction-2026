"""Hire anyone (JUN-72): Owl translates a process into the worker's language, with a stand-in for the model."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import main, translate
from app.models import Process
from app.store import Store, load_fixture
from app.translate import TranslatedProcess, TranslatedStep, TranslationError

PROCESS = Process.model_validate(load_fixture("process-pick-pack.json"))


def ukrainian(process=PROCESS, drop_criterion=False, long=False):
    steps = []
    for s in process.steps:
        criteria = [f"uk: {c}" for c in s.check.criteria]
        if drop_criterion and criteria:
            criteria = criteria[1:]
        steps.append(
            TranslatedStep(
                id=s.id,
                title=("Дуже довга назва кроку " * 3) if long else f"uk {s.index}",
                instruction=f"uk instruction {s.index}",
                say="uk say " * (20 if long else 1),
                criteria=criteria,
            )
        )
    return TranslatedProcess(title="Зібрати і запакувати замовлення", summary="uk summary", steps=steps)


def test_apply_keeps_everything_but_the_words():
    t = translate.apply(PROCESS, ukrainian(long=True), "uk")
    assert t.language == "uk"
    for a, b in zip(PROCESS.steps, t.steps, strict=True):
        assert (a.id, a.index, a.clip_url, a.reference_image_url, a.check.kind) == (b.id, b.index, b.clip_url, b.reference_image_url, b.check.kind)
        assert a.check.order_lines == b.check.order_lines  # names stay as printed on the order and the shelf
        assert len(b.title) <= 32 and len(b.say.split()) <= 25
        assert len(b.check.criteria) == len(a.check.criteria)


def test_apply_refuses_a_translation_that_does_not_fit():
    wrong_order = ukrainian().model_copy(update={"steps": list(reversed(ukrainian().steps))})
    with pytest.raises(TranslationError):
        translate.apply(PROCESS, wrong_order, "uk")
    with pytest.raises(TranslationError):
        translate.apply(PROCESS, ukrainian(drop_criterion=True), "uk")


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "DEMO", False)
    monkeypatch.setattr(main, "MOCK_RECORD", False)
    monkeypatch.setattr(main, "API_TOKEN", "")
    return TestClient(main.app)


def fake_model(monkeypatch, result):
    calls = []

    def parse(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(parsed_output=result, stop_reason="end_turn")

    monkeypatch.setattr(translate, "client", lambda: SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(parse=parse))))
    return calls


def test_translate_stores_the_translation(client, monkeypatch):
    calls = fake_model(monkeypatch, ukrainian())
    r = client.post("/processes/proc-pick-pack/translate", json={"language": "uk"})
    assert r.status_code == 200
    assert r.json()["language"] == "uk" and r.json()["steps"][0]["title"] == "uk 1"
    assert "Translate into: uk" in calls[0]["messages"][0]["content"]
    # Stored: the glasses get it with ?language=uk, and the original does not change.
    assert client.get("/processes/proc-pick-pack", params={"language": "uk"}).json()["title"] == "Зібрати і запакувати замовлення"
    assert client.get("/processes/proc-pick-pack").json()["title"] == PROCESS.title


def test_translate_to_the_same_language_returns_the_process(client, monkeypatch):
    monkeypatch.setattr(translate, "client", lambda: pytest.fail("no model call"))
    assert client.post("/processes/proc-pick-pack/translate", json={"language": "en-GB"}).json()["title"] == PROCESS.title


def test_translate_needs_the_model(client, monkeypatch):
    monkeypatch.setattr(main, "DEMO", True)
    r = client.post("/processes/proc-pick-pack/translate", json={"language": "uk"})
    assert (r.status_code, r.json()["detail"]) == (503, "Translation needs the model.")


def test_no_api_key_is_a_clear_503(client, monkeypatch):
    def no_key(**_):
        raise TypeError("Could not resolve authentication method. Expected one of api_key, auth_token, or credentials to be set.")

    monkeypatch.setattr(translate, "client", lambda: SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(parse=no_key))))
    r = client.post("/processes/proc-pick-pack/translate", json={"language": "uk"})
    assert (r.status_code, r.json()["detail"]) == (503, "The model is not set up on this server yet.")


def test_bad_requests(client, monkeypatch):
    fake_model(monkeypatch, ukrainian(drop_criterion=True))
    assert client.post("/processes/proc-pick-pack/translate", json={"language": "uk"}).status_code == 502
    assert client.post("/processes/proc-nope/translate", json={"language": "uk"}).status_code == 404
    assert client.post("/processes/proc-pick-pack/translate", json={"language": "not a tag!"}).status_code == 422
