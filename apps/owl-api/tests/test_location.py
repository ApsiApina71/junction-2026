"""Location during training (JUN-97): markers, checkpoints that unlock steps, and the limits on tracking."""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import location, main, training
from app.models import Process
from app.progress import Progress
from app.store import TIMEZONE, Store, load_fixture
from app.verifier import Tracker

TODAY = training.today()


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "tracker", Tracker())
    monkeypatch.setattr(main, "progress", Progress())
    monkeypatch.setattr(main, "locations", location.Locations())
    monkeypatch.setattr(main, "API_TOKEN", "")
    monkeypatch.setattr(main, "MOCK_CHECK", True)
    return TestClient(main.app)


def in_training(client, employee="emp-sami", consent=True):
    assert client.put(f"/employees/{employee}/training", json={"starts": TODAY.isoformat()}).status_code == 200
    client.post(f"/employees/{employee}/consent", json={"camera_checks": True, "location": consent})


def test_needs_consent_and_a_training_period(client):
    body = {"employee_id": "emp-sami", "marker": "owl:zone:zone-c"}
    assert client.post("/location", json=body).json()["detail"] == "consent_required"
    client.post("/employees/emp-sami/consent", json={"camera_checks": True, "location": True})
    r = client.post("/location", json=body)
    assert (r.status_code, r.json()["detail"]) == (409, "not_in_training")
    assert client.get("/employees/emp-sami/location").json()["tracking"] is False


def test_zones_and_history(client):
    in_training(client)
    assert client.post("/location", json={"employee_id": "emp-sami", "marker": "owl:zone:zone-a"}).json()["zone"]["name"] == "Aisle A"
    client.post("/location", json={"employee_id": "emp-sami", "marker": "owl:zone:zone-a"})  # same zone: no new visit
    where = client.post("/location", json={"employee_id": "emp-sami", "zone": "zone-pack"}).json()
    assert where["tracking"] is True and where["zone"] == {"id": "zone-pack", "name": "Packing"}
    assert [(v["zone_id"], v["left_at"] is None) for v in where["history"]] == [("zone-a", False), ("zone-pack", True)]
    assert client.post("/location", json={"employee_id": "emp-sami", "marker": "hello"}).status_code == 404
    assert client.post("/location", json={"employee_id": "emp-sami", "zone": "zone-x"}).status_code == 404


def test_a_checkpoint_unlocks_its_step_until_the_step_is_done(client):
    in_training(client)
    step = next(s for s in client.get("/processes/proc-pick-pack").json()["steps"] if s["id"] == "step-2")
    assert step["checkpoint"] == {"zone_id": "zone-c", "label": "Aisle C · Shelf 12"}
    where = client.post("/location", json={"employee_id": "emp-sami", "marker": "owl:cp:proc-pick-pack:step-2"}).json()
    assert where["zone"]["id"] == "zone-c"
    assert where["unlocked"] == [{"process_id": "proc-pick-pack", "step_id": "step-2"}]
    data = {"process_id": "proc-pick-pack", "step_id": "step-2", "run_id": "r1", "employee_id": "emp-sami", "final": "true", "mock": "ok"}
    from tests.test_api import jpeg

    assert client.post("/check", data=data, files={"image": ("f.jpg", jpeg(), "image/jpeg")}).json()["step_done"] is True
    assert client.get("/employees/emp-sami/location").json()["unlocked"] == []


def test_the_trainer_can_unlock_when_the_marker_is_missing(client):
    in_training(client)
    where = client.post("/employees/emp-sami/unlock", json={"process_id": "proc-pick-pack", "step_id": "step-4", "by": "help"}).json()
    assert where["unlocked"] == [{"process_id": "proc-pick-pack", "step_id": "step-4"}]
    assert client.post("/employees/emp-sami/unlock", json={"process_id": "proc-pick-pack", "step_id": "step-1"}).status_code == 404


def test_the_finnish_process_keeps_the_checkpoints(client):
    steps = client.get("/processes/proc-pick-pack?language=fi").json()["steps"]
    assert steps[1]["checkpoint"]["zone_id"] == "zone-c"


def test_history_goes_when_training_ends_or_consent_is_taken_back(client):
    in_training(client)
    client.post("/location", json={"employee_id": "emp-sami", "zone": "zone-c"})
    assert client.get("/locations").json()["trainees"][0]["zone"]["id"] == "zone-c"
    client.post("/employees/emp-sami/consent", json={"camera_checks": True, "location": False})
    assert "emp-sami" not in main.locations.people
    in_training(client)
    client.post("/location", json={"employee_id": "emp-sami", "zone": "zone-c"})
    client.put("/employees/emp-sami/training", json={"starts": None})
    assert client.get("/locations").json()["trainees"] == []
    assert "emp-sami" not in main.locations.people


def test_only_today_is_kept():
    locs = location.Locations()
    yesterday = datetime.now(TIMEZONE) - timedelta(days=1)
    locs.enter("emp-sami", "zone-a", now=yesterday)
    locs.enter("emp-sami", "zone-b", now=yesterday + timedelta(minutes=5))
    locs.enter("emp-sami", "zone-c")
    assert [v.zone_id for v in locs.get("emp-sami").visits] == ["zone-c"]


def test_studio_edits_zones_and_prints_markers(client):
    zone = {"id": "zone-d", "name": "Aisle D", "kind": "aisle", "x": 0.1, "y": 0.7, "w": 0.2, "h": 0.2}
    assert client.put("/zones/zone-d", json=zone).status_code == 200
    assert "zone-d" in [z["id"] for z in client.get("/zones").json()["zones"]]
    markers = client.get("/markers").json()["markers"]
    payloads = [m["payload"] for m in markers]
    assert "owl:zone:zone-d" in payloads and "owl:cp:proc-pick-pack:step-2" in payloads
    assert markers[0]["svg"].startswith("<svg")
    assert client.delete("/zones/zone-d").status_code == 204
    assert client.delete("/zones/zone-d").status_code == 404


def test_fixture_checkpoints_point_at_zones():
    store = Store()
    for process in store.processes.values():
        for step in process.steps:
            if step.checkpoint:
                assert step.checkpoint.zone_id in store.zones
    assert Process.model_validate(load_fixture("process-pick-pack.json")).steps[3].checkpoint.label == "Packing station"
