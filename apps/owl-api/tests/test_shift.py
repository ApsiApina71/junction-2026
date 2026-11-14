"""Help from the shift manager's own glasses (JUN-100): the call rings, the manager sees the live view and talks."""

import io
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main, shift
from app.progress import Progress
from app.store import TIMEZONE, Store


def jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 48), (90, 120, 200)).save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "progress", Progress())
    monkeypatch.setattr(main, "API_TOKEN", "")
    return TestClient(main.app)


def on_shift(client, employee_id="emp-mika"):
    return client.put("/shift", json={"company": "Kide Logistics", "employee_id": employee_id})


def call(client, to="manager", employee_id="emp-sami", help_id=""):
    data = {"employee_id": employee_id, "process_id": "proc-pick-pack", "step_id": "step-2", "to": to, "help_id": help_id}
    return client.post("/help/frames", data=data, files={"image": ("f.jpg", jpeg(), "image/jpeg")})


def test_who_is_on_shift(client):
    assert client.get("/shift/manager", params={"employee_id": "emp-sami"}).status_code == 404
    assert on_shift(client).json() == {"on_shift": [{"company": "Kide Logistics", "employee_id": "emp-mika", "name": "Mika"}]}
    assert client.get("/shift/manager", params={"employee_id": "emp-sami"}).json() == {"employee_id": "emp-mika", "name": "Mika"}
    # Another company's worker does not get Kide's manager, and a manager does not call themselves.
    assert client.get("/shift/manager", params={"employee_id": "emp-mikko"}).status_code == 404
    assert client.get("/shift/manager", params={"employee_id": "emp-mika"}).status_code == 404
    # Only a shift manager can be on shift.
    assert on_shift(client, "emp-leo").status_code == 422
    assert client.put("/shift", json={"company": "Kide Logistics", "employee_id": None}).json() == {"on_shift": []}


def test_the_manager_answers_on_their_glasses(client):
    on_shift(client)
    session = call(client).json()
    assert (session["status"], session["routed"], session["assignee"], session["assignee_name"]) == ("ringing", "manager", "emp-mika", "Mika")

    incoming = client.get("/help/incoming", params={"employee_id": "emp-mika"}).json()["sessions"]
    assert [s["id"] for s in incoming] == [session["id"]]
    assert (incoming[0]["employee_name"], incoming[0]["process_title"], incoming[0]["step_index"], incoming[0]["step_title"]) == (
        "Sami",
        "Pick and pack an order",
        2,
        "Pick the items",
    )
    assert client.get("/help/incoming", params={"employee_id": "emp-leo"}).json()["sessions"] == []

    assert client.post(f"/help/{session['id']}/accept", json={"employee_id": "emp-leo"}).status_code == 409
    accepted = client.post(f"/help/{session['id']}/accept", json={"employee_id": "emp-mika"}).json()
    assert accepted["status"] == "accepted"

    # The live view: the worker's newest frame, a new address for each one.
    first = accepted["latest_frame_url"]
    call(client, help_id=session["id"])
    live = client.get(f"/help/{session['id']}").json()
    assert live["latest_frame_url"] != first and (live["process_id"], live["step_id"]) == ("proc-pick-pack", "step-2")
    assert client.get(live["latest_frame_url"].removeprefix("http://testserver")).status_code == 200

    # Talking both ways.
    client.post(f"/help/{session['id']}/say", json={"from": "manager", "text": "Take the 1 litre carton, top shelf."})
    talk = client.post(f"/help/{session['id']}/say", json={"from": "worker", "text": "Got it."}).json()
    assert [(m["from"], m["text"]) for m in talk["messages"]] == [("manager", "Take the 1 litre carton, top shelf."), ("worker", "Got it.")]
    assert talk["status"] == "accepted"

    ended = client.post(f"/help/{session['id']}/end").json()
    assert ended["status"] == "ended" and ended["latest_frame_url"] is None
    assert client.get(live["latest_frame_url"].removeprefix("http://testserver")).status_code == 404  # the frames are gone
    assert client.get("/help/incoming", params={"employee_id": "emp-mika"}).json()["sessions"] == []
    # The worker's glasses learn that the call ended from the next frame: keep this 409, the glasses rely on it.
    late = call(client, help_id=session["id"])
    assert (late.status_code, late.json()["detail"]) == (409, "This help session has ended.")


def test_no_answer_in_30_seconds_goes_to_studio(client):
    on_shift(client)
    session = call(client).json()
    main.store.help[session["id"]].rang_at = (datetime.now(TIMEZONE) - timedelta(seconds=31)).isoformat(timespec="seconds")
    moved = client.get(f"/help/{session['id']}").json()
    assert (moved["status"], moved["routed"], moved["assignee"], moved["fallback"], moved["assignee_name"]) == ("waiting", "studio", None, "no_answer", "Mika")
    assert client.post(f"/help/{session['id']}/accept", json={"employee_id": "emp-mika"}).status_code == 409
    assert [s["id"] for s in client.get("/help").json()["sessions"] if s["status"] == "waiting"] == [session["id"]]


def test_later_goes_to_studio(client):
    on_shift(client)
    session = call(client).json()
    later = client.post(f"/help/{session['id']}/later", json={"employee_id": "emp-mika"}).json()
    assert (later["status"], later["routed"], later["fallback"]) == ("waiting", "studio", "later")
    # The Studio expert takes it from there.
    assert client.post(f"/help/{session['id']}/say", json={"text": "I'm here."}).json()["status"] == "connected"


def test_no_one_on_shift_goes_straight_to_studio(client):
    session = call(client).json()
    assert (session["status"], session["routed"], session["fallback"]) == ("waiting", "studio", "no_manager")


def test_studio_help_is_as_before(client):
    on_shift(client)
    session = call(client, to="studio").json()
    assert (session["status"], session["routed"], session["assignee"], session["fallback"]) == ("waiting", "studio", None, None)


def test_a_manager_who_stops_being_one_leaves_the_shift(client):
    on_shift(client)
    assert client.put("/employees/emp-mika", json={"shift_manager": False}).status_code == 200
    assert client.get("/shift").json() == {"on_shift": []}


def test_settle_keeps_a_fresh_call_ringing():
    from app.models import HelpSession

    session = HelpSession(id="h", status="ringing", updated_at="x", rang_at=datetime.now(TIMEZONE).isoformat())
    assert shift.settle(session).status == "ringing"
