import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main
from app.store import Store


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "API_TOKEN", "")
    monkeypatch.setattr(main, "PUBLIC_BASE_URL", "")
    return TestClient(main.app)


def jpeg(size=(64, 48)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (200, 100, 50)).save(buf, format="JPEG")
    return buf.getvalue()


def check(client, step_id="step-2", **form):
    data = {"process_id": "proc-pick-pack", "step_id": step_id, "run_id": "run-1", **form}
    return client.post("/check", data=data, files={"image": ("f.jpg", jpeg(), "image/jpeg")})


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_token_required_when_set(client, monkeypatch):
    monkeypatch.setattr(main, "API_TOKEN", "secret")
    assert client.get("/processes").status_code == 401
    assert client.get("/processes", headers={"X-Api-Token": "secret"}).status_code == 200
    assert client.get("/health").status_code == 200


def test_employee(client):
    r = client.get("/employees/emp-sami")
    assert r.status_code == 200
    assert r.json()["process_ids"] == ["proc-pick-pack"]
    assert client.get("/employees/nobody").status_code == 404


def test_process_urls_are_absolute(client):
    steps = client.get("/processes/proc-pick-pack").json()["steps"]
    assert len(steps) == 5
    assert steps[1]["clip_url"] == "http://testserver/media/proc-pick-pack/step-2.mp4"
    assert steps[1]["check"]["order_lines"][0]["name"] == "Oat drink 1 l"


def test_public_base_url_is_used_for_media(client, monkeypatch):
    monkeypatch.setattr(main, "PUBLIC_BASE_URL", "https://owl.example")
    step = client.get("/processes").json()["processes"][0]["steps"][0]
    assert step["reference_image_url"] == "https://owl.example/media/proc-pick-pack/step-1.jpg"


def test_media_is_served_and_cannot_escape(client):
    r = client.get("/media/proc-pick-pack/step-2.mp4")
    assert r.status_code == 200
    assert r.headers["content-type"] == "video/mp4"
    assert client.head("/media/proc-pick-pack/step-2.mp4").status_code == 200
    assert client.get("/media/proc-pick-pack/step-2.mp4", headers={"Range": "bytes=0-99"}).status_code == 206
    assert client.get("/media/../fixtures/employee.json").status_code == 404
    assert client.get("/media/%2e%2e/%2e%2e/pyproject.toml").status_code == 404


def test_update_process_keeps_media_paths(client):
    body = client.get("/processes/proc-pick-pack").json()
    body["status"] = "draft"
    body["steps"][0]["title"] = "Take a box"
    r = client.put("/processes/proc-pick-pack", json=body)
    assert r.status_code == 200
    assert main.store.processes["proc-pick-pack"].steps[0].reference_image_url == "/media/proc-pick-pack/step-1.jpg"
    assert r.json()["steps"][0]["title"] == "Take a box"


def test_check_mock_ok_and_final(client):
    r = check(client)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["step_done"] is False
    assert check(client, final="true").json()["step_done"] is True


def test_check_mock_warning_is_never_done(client):
    body = check(client, mock="warning", final="true").json()
    assert body["status"] == "warning"
    assert body["problem"] == "wrong_item"
    assert body["step_done"] is False


def test_check_mock_checking_stays_quiet(client):
    body = check(client, mock="checking").json()
    assert body["status"] == "checking"
    assert body["say"] is None


def test_check_visual_step_has_no_lines(client):
    body = check(client, step_id="step-4", mock="warning").json()
    assert body["lines"] is None
    assert body["problem"] == "not_matching"


def test_check_rejects_bad_input(client):
    assert check(client, step_id="step-9").status_code == 404
    r = client.post(
        "/check",
        data={"process_id": "proc-pick-pack", "step_id": "step-2", "run_id": "r"},
        files={"image": ("f.jpg", b"not an image", "image/jpeg")},
    )
    assert r.status_code == 400
    r = client.post("/check", data={"process_id": "proc-pick-pack", "step_id": "step-2", "run_id": "r"}, files={"image": ("f.txt", b"x", "text/plain")})
    assert r.status_code == 415


def test_ask(client):
    r = client.post("/ask", json={"question": "What if an item is out of stock?"})
    assert r.status_code == 200
    assert r.json()["sources"][0]["doc"] == "Warehouse handbook"
    assert client.post("/ask", json={"question": ""}).status_code == 422


def test_docs_list_and_upload(client):
    assert [d["title"] for d in client.get("/docs").json()["docs"]] == ["Kide Logistics: warehouse handbook"]
    r = client.post("/docs", files={"file": ("Oven rules.md", b"# Oven rules\n\nNever open the oven door during the first 10 minutes.", "text/markdown")})
    assert r.status_code == 200
    assert r.json()["title"] == "Oven rules"
    assert r.json()["filename"] == "oven-rules.md"
    assert len(client.get("/docs").json()["docs"]) == 2
    assert client.post("/docs", files={"file": ("x.exe", b"MZ", "application/octet-stream")}).status_code == 415


def test_record_flow(client):
    rec = client.post("/record", json={"title": "Pick and pack", "expert": "Laura"}).json()
    assert rec["status"] == "recording"
    assert client.post(f"/record/{rec['id']}/finish").status_code == 409
    r = client.post(
        f"/record/{rec['id']}/steps",
        data={"narration": "Take a medium box."},
        files={"photo": ("p.jpg", jpeg((1200, 900)), "image/jpeg"), "clip": ("c.mp4", b"\x00\x00\x00\x18ftypmp42", "video/mp4")},
    )
    assert r.status_code == 200
    step = r.json()["steps"][0]
    assert step["photo_url"].endswith(f"/media/{rec['id']}/1.jpg")
    with Image.open(io.BytesIO(client.get(step["photo_url"]).content)) as img:
        assert max(img.size) <= 600
    done = client.post(f"/record/{rec['id']}/finish").json()
    assert done["status"] == "done"
    assert done["process_id"] == "proc-pick-pack"
    assert client.get(f"/record/{rec['id']}").json()["status"] == "done"


def test_help_flow(client):
    files = {"image": ("f.jpg", jpeg(), "image/jpeg")}
    session = client.post("/help/frames", data={"employee_id": "emp-sami", "process_id": "proc-pick-pack", "step_id": "step-2"}, files=files).json()
    assert session["status"] == "waiting"
    assert client.get(session["latest_frame_url"]).status_code == 200

    again = client.post("/help/frames", data={"help_id": session["id"]}, files={"image": ("f.jpg", jpeg(), "image/jpeg")}).json()
    assert again["id"] == session["id"]
    assert again["step_id"] == "step-2"

    client.post(f"/help/{session['id']}/say", json={"from": "worker", "text": "Which oat drink?"})
    r = client.post(f"/help/{session['id']}/say", json={"from": "expert", "text": "The blue carton."})
    body = r.json()
    assert body["status"] == "connected"
    assert [(m["id"], m["from"]) for m in body["messages"]] == [(1, "worker"), (2, "expert")]

    assert client.get("/help").json()["sessions"][0]["id"] == session["id"]
    assert client.post(f"/help/{session['id']}/end").json()["status"] == "ended"
    assert client.post(f"/help/{session['id']}/say", json={"text": "hi"}).status_code == 409
    assert client.get("/help/help-999").status_code == 404
