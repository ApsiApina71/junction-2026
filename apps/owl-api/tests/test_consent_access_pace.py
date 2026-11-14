"""Consent (JUN-80), inclusive profiles (JUN-81) and the performance budget (JUN-82)."""

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import demo, main, verifier
from app.progress import Progress
from app.store import Store
from app.verifier import Tracker


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "tracker", Tracker())
    monkeypatch.setattr(main, "progress", Progress())
    monkeypatch.setattr(main, "demo", demo.Demo())
    monkeypatch.setattr(main, "DEMO", True)
    monkeypatch.setattr(main, "MOCK_CHECK", False)
    monkeypatch.setattr(main, "MOCK_ASK", False)
    monkeypatch.setattr(main, "API_TOKEN", "")
    return TestClient(main.app)


def jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 48)).save(buf, format="JPEG")
    return buf.getvalue()


def check(client, step_id="step-2", employee_id="emp-sami", run_id="r", final=False):
    data = {"process_id": "proc-pick-pack", "step_id": step_id, "run_id": run_id, "final": str(final).lower()}
    if employee_id:
        data["employee_id"] = employee_id
    return client.post("/check", data=data, files={"image": ("f.jpg", jpeg(), "image/jpeg")})


# Consent


def test_no_frame_is_looked_at_before_consent(client):
    assert client.get("/employees/emp-sami/consent").json() == {"camera_checks": False, "recording": False, "location": False, "at": None}
    r = check(client)
    assert (r.status_code, r.json()["detail"]) == (403, "consent_required")
    given = client.post("/employees/emp-sami/consent", json={"camera_checks": True}).json()
    assert given["camera_checks"] is True and given["at"]
    assert check(client).status_code == 200
    # Taking consent back stops the checks again.
    client.post("/employees/emp-sami/consent", json={"camera_checks": False})
    assert check(client).status_code == 403
    assert client.get("/employees/nobody/consent").status_code == 404


def test_forget_me_erases_only_my_learning_data(client):
    client.post("/employees/emp-sami/consent", json={"camera_checks": True})
    client.post("/employees/emp-mikko/consent", json={"camera_checks": True})
    check(client, step_id="step-1", final=True, run_id="sami")
    client.post(
        "/check",
        data={"process_id": "proc-bakery-rye", "step_id": "step-1", "run_id": "mikko", "employee_id": "emp-mikko", "final": "true"},
        files={"image": ("f.jpg", jpeg(), "image/jpeg")},
    )
    assert client.delete("/employees/emp-sami/progress").status_code == 204
    assert client.get("/employees/emp-sami/progress").json()["runs"] == []
    assert len(client.get("/employees/emp-mikko/progress").json()["runs"]) == 1


# Inclusive profiles


def test_access_profile_is_stored_and_defaults_off(client):
    assert client.get("/employees/emp-sami").json()["access"] == {"audio_first": False, "display_first": False, "easy_language": False}
    eero = client.post("/employees", json={"name": "Eero", "language": "fi", "process_ids": ["proc-pick-pack"], "access": {"easy_language": True}}).json()
    assert eero["access"]["easy_language"] is True
    updated = client.put(f"/employees/{eero['id']}", json={"access": {"audio_first": True}}).json()
    assert updated["access"] == {"audio_first": True, "display_first": False, "easy_language": False}
    assert client.put(f"/employees/{eero['id']}", json={"role": "Packer"}).json()["access"]["audio_first"] is True


def test_easy_language_worker_hears_short_sentences(client):
    eero = client.post("/employees", json={"name": "Eero", "language": "en", "process_ids": ["proc-pick-pack"], "access": {"easy_language": True}}).json()
    client.post(f"/employees/{eero['id']}/consent", json={"camera_checks": True})
    check(client, employee_id=eero["id"], run_id="e")
    warning = check(client, employee_id=eero["id"], run_id="e").json()
    assert warning["say"] == "Wrong one. This is Oat drink 0.5 l. Take Oat drink 1 l."
    answer = client.post("/ask", json={"question": "What is the wifi password?", "employee_id": eero["id"]}).json()
    assert answer["say"] == "It is not in our rules. Ask your boss."


def test_easy_texts_exist_for_every_key():
    for lang in ("en", "fi"):
        assert set(verifier.TEXTS[f"{lang}-easy"]) == set(verifier.TEXTS[lang])
    assert verifier._texts("fi-x-easy")["ok_final"][1] == "Hyvää työtä. Tämä vaihe on valmis."
    assert verifier._texts("uk-x-easy") is verifier.TEXTS["en-easy"]
    assert verifier.easy("fi") == "fi-x-easy" and verifier.easy("fi-x-easy") == "fi-x-easy"


# Performance budget


def test_next_check_follows_the_moment(client):
    client.post("/employees/emp-sami/consent", json={"camera_checks": True})
    assert check(client, run_id="p").json()["next_check_ms"] == 800  # a problem is being confirmed
    assert check(client, run_id="p").json()["next_check_ms"] == 1500  # warned: look again for the fix
    done = check(client, step_id="step-4", run_id="p", final=True).json()
    assert done["step_done"] is True and done["next_check_ms"] is None  # done: not before the next step


def test_per_run_budget_answers_without_a_model_call(monkeypatch):
    t = Tracker()
    monkeypatch.setattr(verifier, "MAX_CHECKS_PER_MINUTE", 3)
    assert [t.allow("r", now=0) for _ in range(4)] == [True, True, True, False]
    assert t.allow("other", now=0) is True
    assert t.allow("r", now=61) is True
