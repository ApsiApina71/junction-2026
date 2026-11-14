"""The Junction volunteer story for the demo video (JUN-102, JUN-105): real engine, story data."""

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import main, persist, story
from app.progress import Progress
from app.store import Store
from app.verifier import Tracker
from app.vision import CriterionSeen, Observation

DAY = date(2026, 11, 14)


@pytest.fixture
def store(tmp_path):
    s = Store(data_dir=tmp_path)
    story.apply(s, "junction", today=DAY)
    return s


@pytest.fixture
def client(store, monkeypatch):
    monkeypatch.setattr(main, "store", store)
    monkeypatch.setattr(main, "tracker", Tracker())
    monkeypatch.setattr(main, "progress", Progress())
    monkeypatch.setattr(main, "API_TOKEN", "")
    monkeypatch.setattr(main, "MOCK_ASSIST", True)
    monkeypatch.setattr(main.training, "today", lambda: DAY)
    return TestClient(main.app)


def test_only_junction_is_left(store):
    assert {e.company for e in store.employees.values()} == {"Junction 2026"}
    assert set(store.employees) == {"emp-jose", "emp-sami", "emp-mika"}
    assert set(store.processes) == {"proc-recycling"}
    assert [doc.title for doc, _ in store.docs.values()] == ["Junction 2026: volunteer handbook"]
    assert set(store.zones) == {"zone-recycling", "zone-info", "zone-hall"}
    assert store.company() == "Junction 2026"


def test_the_people(store):
    jose, mika = store.employees["emp-jose"], store.employees["emp-mika"]
    assert (jose.language, jose.welcome_language, jose.glasses_id, jose.process_ids) == ("en", "es", "glasses-1", ["proc-recycling"])
    assert jose.welcome.startswith("¡Bienvenido") and "emp-jose" in store.custom_welcomes
    assert store.consents["emp-jose"]["camera_checks"] and store.consents["emp-jose"]["location"]
    assert mika.shift_manager and store.on_shift == {"Junction 2026": "emp-mika"}
    assert (store.employees["emp-sami"].role, store.employees["emp-sami"].glasses_id) == ("Crew lead", None)
    assert store.processes["proc-recycling"].expert == "Sami"


def test_jose_is_in_training_with_customer_service(store):
    assert main.training.in_training(store, "emp-jose", DAY)
    assert main.training.customer_service(store, "emp-jose")
    assert not main.training.in_training(store, "emp-sami", DAY)


def test_the_deposit_step(store):
    step = store.processes["proc-recycling"].steps[0]
    assert step.checkpoint and step.checkpoint.label == "Recycling point"
    assert step.check.kind == "visual"
    assert step.check.warning == "That's a deposit can. It goes in the CANS hole."


def test_the_deposit_warning_is_the_script_line(store):
    step = store.processes["proc-recycling"].steps[0]
    obs = Observation(
        visibility="clear",
        hint=None,
        items=[],
        criteria=[CriterionSeen(index=i + 1, criterion=c, met="no" if i == 0 else "unclear", note="") for i, c in enumerate(step.check.criteria)],
        matches_reference="no_reference",
        summary="synthetic",
    )
    tracker = Tracker()
    look = lambda: main.verifier.run_check(step, b"", None, "run-s", False, "en", tracker, observe=lambda *_: obs, jev=lambda *_: None)
    look()
    warned = look()
    assert (warned.status, warned.say) == ("warning", "That's a deposit can. It goes in the CANS hole.")


def test_hint_the_final_deadline(client):
    r = client.post("/assist", json={"employee_id": "emp-jose", "transcript": "Hi! When's the final deadline?"}).json()
    assert r["unsure"] is False
    joined = " ".join(r["bullets"])
    assert "10:00" in joined and "FINAL" in joined and "10:30" in joined
    assert r["sources"] == [{"doc": "Junction 2026: volunteer handbook", "section": "Final deadline"}]


def test_hint_a_found_device_is_not_in_the_handbook(client):
    r = client.post("/assist", json={"employee_id": "emp-jose", "transcript": "Found this under a table. Whose is it?"}).json()
    assert r == {"bullets": ["Not in the handbook. Ask a colleague."], "say": None, "sources": [], "unsure": True}


def test_seeded_once_and_studio_changes_stay(tmp_path):
    s = Store(data_dir=tmp_path)
    story.apply(s, "junction", today=DAY)
    s.assist_sign = "Changed in Studio"
    s.employees["emp-jose"].process_ids.append("proc-sami-recorded")
    persist.save(s, Progress())
    again = Store(data_dir=tmp_path)
    persist.load(again, Progress())
    story.apply(again, "junction", today=DAY)
    assert again.assist_sign == "Changed in Studio"
    assert "proc-sami-recorded" in again.employees["emp-jose"].process_ids


def test_an_older_cast_is_replaced(tmp_path):
    """A server that ran the first version of the story (Laura, and Sami as the volunteer) gets the new cast."""
    s = Store(data_dir=tmp_path)
    story.apply(s, "junction", today=DAY)
    del s.employees["emp-jose"]
    s.employees["emp-laura"] = s.employees["emp-sami"].model_copy(update={"id": "emp-laura", "name": "Laura"})
    s.employees["emp-sami"] = s.employees["emp-sami"].model_copy(update={"glasses_id": "glasses-1", "process_ids": ["proc-recycling"]})
    story.apply(s, "junction", today=DAY)
    assert set(s.employees) == {"emp-jose", "emp-sami", "emp-mika"}
    assert s.employees["emp-jose"].glasses_id == "glasses-1" and s.employees["emp-sami"].glasses_id is None
