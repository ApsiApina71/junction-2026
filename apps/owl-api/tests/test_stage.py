"""Stage view (JUN-79): the audience sees what the worker sees and what Owl decides."""

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import demo, main, stage
from app.progress import Progress
from app.store import Store
from app.verifier import Tracker


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "tracker", Tracker())
    monkeypatch.setattr(main, "progress", Progress())
    monkeypatch.setattr(main, "stage", stage.Stage())
    monkeypatch.setattr(main, "demo", demo.Demo())
    monkeypatch.setattr(main, "DEMO", True)
    monkeypatch.setattr(main, "MOCK_CHECK", False)
    monkeypatch.setattr(main, "MOCK_ASK", False)
    monkeypatch.setattr(main, "API_TOKEN", "")
    return TestClient(main.app)


def jpeg(size=(1280, 960)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (30, 120, 60)).save(buf, format="JPEG")
    return buf.getvalue()


def test_the_page_is_served(client):
    r = client.get("/stage")
    assert r.status_code == 200 and "text/html" in r.headers["content-type"]
    assert "EventSource" in r.text and "never stored" in r.text


def test_glasses_state_and_frame_show_up(client):
    assert client.get("/stage/state").json()["glasses"] is None
    body = {
        "glasses_id": "glasses-1",
        "employee_id": "emp-sami",
        "language": "en",
        "screen": {"kind": "step", "title": "Pick the items", "text": "Pick every item on the order."},
        "said": "Pick the three items on the order into the box.",
        "step": {"process_id": "proc-pick-pack", "step_id": "step-2", "index": 2, "total": 5},
    }
    assert client.post("/stage", json=body).status_code == 204
    assert client.post("/stage/frame", data={"glasses_id": "glasses-1"}, files={"image": ("f.jpg", jpeg(), "image/jpeg")}).status_code == 204
    state = client.get("/stage/state").json()["glasses"]
    assert state["screen"]["title"] == "Pick the items"
    assert state["employee"]["name"] == "Sami" and state["employee"]["consent"] is False
    assert state["events"][0] == {"at": state["events"][0]["at"], "kind": "said", "text": body["said"]}
    frame = client.get("/stage/frame")
    assert frame.status_code == 200 and frame.headers["cache-control"] == "no-store"
    with Image.open(io.BytesIO(frame.content)) as img:
        assert max(img.size) <= 640


def test_owl_decisions_appear_on_the_timeline_once(client):
    client.post("/employees/emp-sami/consent", json={"camera_checks": True})
    form = {"process_id": "proc-pick-pack", "step_id": "step-2", "run_id": "s", "employee_id": "emp-sami"}
    for _ in range(4):  # checking, warning (spoken), warning (quiet), warning (quiet)
        client.post("/check", data=form, files={"image": ("f.jpg", jpeg((64, 48)), "image/jpeg")})
    client.post("/ask", json={"question": "Where does the label go?", "employee_id": "emp-sami"})
    events = client.get("/stage/state", params={"glasses": "glasses-1"}).json()["glasses"]["events"]
    kinds = [(e["kind"], e.get("status")) for e in events]
    assert kinds == [("ask", None), ("check", "warning"), ("check", "checking")]
    assert events[1]["decided_by"] == "demo" and "0.5 l" in events[1]["text"]
    assert events[0]["source"] == "Kide Logistics: warehouse handbook · Packing"


def test_stage_needs_the_token_but_takes_it_in_the_query(client, monkeypatch):
    monkeypatch.setattr(main, "API_TOKEN", "secret")
    assert client.get("/stage").status_code == 200  # the page itself has no data
    assert client.get("/stage/state").status_code == 401
    assert client.get("/stage/state", params={"token": "secret"}).status_code == 200
    assert client.post("/stage", json={"glasses_id": "g"}).status_code == 401


def test_frames_are_never_written_to_disk(client, tmp_path):
    client.post("/stage/frame", data={"glasses_id": "glasses-1"}, files={"image": ("f.jpg", jpeg(), "image/jpeg")})
    assert not any(p.suffix == ".jpg" for p in tmp_path.rglob("*"))
    assert not (tmp_path / "state.json").exists()  # stage traffic does not save the state either


def test_old_frames_expire(monkeypatch):
    s = stage.Stage()
    s.frame("g", b"jpeg")
    assert s.latest_frame("g") == b"jpeg"
    s.frames["g"] = (b"jpeg", 0.0)
    assert s.latest_frame("g") is None
