"""Location during training (JUN-97): Owl recognises a step's place in the camera picture, and the limits on tracking."""

import io
from datetime import datetime, timedelta

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import location, main, place, training
from app.models import Process
from app.progress import Progress
from app.store import TIMEZONE, Store, load_fixture
from app.verifier import Tracker

TODAY = training.today()


def jpeg(colour=(200, 100, 50)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), colour).save(buf, format="JPEG")
    return buf.getvalue()


class ColourEmbedder:
    """A stand-in for DINOv2: the picture's mean colour. Same colour, same place."""

    name = "dinov2"

    def embed(self, image: Image.Image) -> np.ndarray:
        v = np.asarray(image.convert("RGB"), dtype=np.float32).mean(axis=(0, 1)) + 1.0
        return v / np.linalg.norm(v)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "tracker", Tracker())
    monkeypatch.setattr(main, "progress", Progress())
    monkeypatch.setattr(main, "locations", location.Locations())
    monkeypatch.setattr(main, "places", place.Places(ColourEmbedder()))
    monkeypatch.setattr(main, "API_TOKEN", "")
    monkeypatch.setattr(main, "MOCK_CHECK", True)
    monkeypatch.setattr(main, "DEMO", False)
    return TestClient(main.app)


def in_training(client, employee="emp-sami", consent=True):
    assert client.put(f"/employees/{employee}/training", json={"starts": TODAY.isoformat()}).status_code == 200
    client.post(f"/employees/{employee}/consent", json={"camera_checks": True, "location": consent})


def look(client, image: bytes, step_id="step-2", employee="emp-sami"):
    data = {"employee_id": employee, "process_id": "proc-pick-pack", "step_id": step_id}
    return client.post("/location/frame", data=data, files={"image": ("f.jpg", image, "image/jpeg")})


def photo_of(client, step_id: str) -> bytes:
    """The expert's photo of a step, as the fixture serves it: the worker standing exactly where the expert stood."""
    return client.get(f"/media/proc-pick-pack/{step_id}.jpg").content


def test_needs_consent_and_a_training_period(client):
    r = look(client, jpeg())
    assert (r.status_code, r.json()["detail"]) == (403, "consent_required")
    client.post("/employees/emp-sami/consent", json={"camera_checks": True, "location": True})
    r = look(client, jpeg())
    assert (r.status_code, r.json()["detail"]) == (409, "not_in_training")
    assert client.get("/employees/emp-sami/location").json()["tracking"] is False


def test_two_looks_at_the_place_open_the_step(client):
    in_training(client)
    shelf = photo_of(client, "step-2")
    first = look(client, shelf).json()
    assert first["match"]["step_id"] == "step-2" and first["match"]["decided_by"] == "model"
    assert first["can_recognize"] is True and first["next_check_ms"] == 2000
    assert first["unlocked"] == []  # one look is not enough
    second = look(client, shelf).json()
    assert second["unlocked"] == [{"process_id": "proc-pick-pack", "step_id": "step-2"}]
    assert second["zone"] == {"id": "zone-c", "name": "Aisle C"}


def test_another_place_does_not_open_it(client):
    in_training(client)
    packing = photo_of(client, "step-4")  # the packing station, while the step needs the shelf
    for _ in range(3):
        r = look(client, packing).json()
        assert r["match"] is None and r["unlocked"] == []


def test_a_look_elsewhere_breaks_the_run(client):
    in_training(client)
    look(client, photo_of(client, "step-2"))
    look(client, photo_of(client, "step-4"))
    assert look(client, photo_of(client, "step-2")).json()["unlocked"] == []


def test_a_step_without_a_place_is_a_404(client):
    in_training(client)
    assert look(client, jpeg(), step_id="step-1").status_code == 404


def test_demo_mode_opens_on_the_second_look(client, monkeypatch):
    monkeypatch.setattr(main, "DEMO", True)
    in_training(client)
    assert look(client, jpeg()).json()["match"]["decided_by"] == "demo"
    assert look(client, jpeg()).json()["unlocked"] == [{"process_id": "proc-pick-pack", "step_id": "step-2"}]


def test_the_unlock_is_used_up_when_the_step_is_done(client):
    in_training(client)
    client.post("/employees/emp-sami/unlock", json={"process_id": "proc-pick-pack", "step_id": "step-2"})
    data = {"process_id": "proc-pick-pack", "step_id": "step-2", "run_id": "r1", "employee_id": "emp-sami", "final": "true", "mock": "ok"}
    assert client.post("/check", data=data, files={"image": ("f.jpg", jpeg(), "image/jpeg")}).json()["step_done"] is True
    assert client.get("/employees/emp-sami/location").json()["unlocked"] == []


def test_the_trainer_can_open_a_step_by_hand(client):
    in_training(client)
    where = client.post("/employees/emp-sami/unlock", json={"process_id": "proc-pick-pack", "step_id": "step-4", "by": "help"}).json()
    assert where["unlocked"] == [{"process_id": "proc-pick-pack", "step_id": "step-4"}]
    assert client.post("/employees/emp-sami/unlock", json={"process_id": "proc-pick-pack", "step_id": "step-1"}).status_code == 404


def test_place_photos_from_studio(client):
    in_training(client)
    r = client.post("/processes/proc-pick-pack/steps/step-2/place-photos", files={"image": ("p.jpg", jpeg((10, 200, 10)), "image/jpeg")})
    assert r.status_code == 200
    urls = r.json()["steps"][1]["checkpoint"]["photo_urls"]
    assert len(urls) == 1 and urls[0].startswith("http://testserver/media/places/proc-pick-pack-")
    assert client.get(urls[0].removeprefix("http://testserver")).status_code == 200
    # A green picture now looks like the shelf too.
    look(client, jpeg((10, 200, 10)))
    assert look(client, jpeg((10, 200, 10))).json()["unlocked"][0]["step_id"] == "step-2"
    # Studio sends the absolute address back on save; the server keeps the path.
    process = client.get("/processes/proc-pick-pack").json()
    assert client.put("/processes/proc-pick-pack", json=process).status_code == 200
    assert main.store.processes["proc-pick-pack"].steps[1].checkpoint.photo_urls[0].startswith("/media/places/")
    assert client.post("/processes/proc-pick-pack/steps/step-1/place-photos", files={"image": ("p.jpg", jpeg(), "image/jpeg")}).status_code == 422


def test_the_finnish_process_keeps_the_places(client):
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


def test_zone_reports_without_the_camera(client):
    in_training(client)
    where = client.post("/location", json={"employee_id": "emp-sami", "zone": "zone-a"}).json()
    assert where["zone"]["name"] == "Aisle A"
    where = client.post("/location", json={"employee_id": "emp-sami", "checkpoint": {"process_id": "proc-pick-pack", "step_id": "step-4"}}).json()
    assert [(v["zone_id"], v["left_at"] is None) for v in where["history"]] == [("zone-a", False), ("zone-pack", True)]
    assert client.post("/location", json={"employee_id": "emp-sami", "zone": "zone-x"}).status_code == 404


def test_only_today_is_kept():
    locs = location.Locations()
    yesterday = datetime.now(TIMEZONE) - timedelta(days=1)
    locs.enter("emp-sami", "zone-a", now=yesterday)
    locs.enter("emp-sami", "zone-b", now=yesterday + timedelta(minutes=5))
    locs.enter("emp-sami", "zone-c")
    assert [v.zone_id for v in locs.get("emp-sami").visits] == ["zone-c"]


def test_a_streak_needs_looks_close_in_time():
    places = place.Places(ColourEmbedder())
    assert places.count("w", "p:s", True, now=0.0) is False
    assert places.count("w", "p:s", True, now=30.0) is False  # too long after the first: starts over
    assert places.count("w", "p:s", True, now=32.0) is True


def test_studio_edits_zones(client):
    zone = {"id": "zone-d", "name": "Aisle D", "kind": "aisle", "x": 0.1, "y": 0.7, "w": 0.2, "h": 0.2}
    assert client.put("/zones/zone-d", json=zone).status_code == 200
    assert "zone-d" in [z["id"] for z in client.get("/zones").json()["zones"]]
    assert client.delete("/zones/zone-d").status_code == 204
    assert client.delete("/zones/zone-d").status_code == 404
    assert client.get("/markers").status_code == 404  # no QR markers any more


def test_fixture_places_point_at_zones():
    store = Store()
    for process in store.processes.values():
        for step in process.steps:
            if step.checkpoint:
                assert step.checkpoint.zone_id in store.zones
                assert place.place_photos(step), f"{step.id} has no picture of its place"
    assert Process.model_validate(load_fixture("process-pick-pack.json")).steps[3].checkpoint.label == "Packing station"


def test_the_baseline_tells_two_rooms_apart():
    base = place.BaselineEmbedder()
    red, red2, blue = (Image.new("RGB", (64, 48), c) for c in ((200, 30, 30), (190, 40, 35), (30, 30, 200)))
    assert float(np.dot(base.embed(red), base.embed(red2))) > float(np.dot(base.embed(red), base.embed(blue)))
