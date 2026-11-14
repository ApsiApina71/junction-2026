import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main
from app.store import FIXTURES, Store


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "API_TOKEN", "")
    monkeypatch.setattr(main, "PUBLIC_BASE_URL", "")
    monkeypatch.setattr(main, "MOCK_CHECK", True)  # the real engine is tested in test_check_engine.py
    monkeypatch.setattr(main, "MOCK_ASK", True)  # and in test_ask.py
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
    process = next(p for p in client.get("/processes").json()["processes"] if p["id"] == "proc-pick-pack")
    step = process["steps"][0]
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
    seeded = len(client.get("/docs").json()["docs"])
    assert "Kide Logistics: warehouse handbook" in [d["title"] for d in client.get("/docs").json()["docs"]]
    r = client.post("/docs", files={"file": ("Oven rules.md", b"# Oven rules\n\nNever open the oven door during the first 10 minutes.", "text/markdown")})
    assert r.status_code == 200
    assert r.json()["title"] == "Oven rules"
    assert r.json()["filename"] == "oven-rules.md"
    assert len(client.get("/docs").json()["docs"]) == seeded + 1
    assert client.post("/docs", files={"file": ("x.exe", b"MZ", "application/octet-stream")}).status_code == 415


def test_record_flow(client, monkeypatch):
    monkeypatch.setattr(main, "MOCK_RECORD", True)  # the model draft is tested in test_record.py
    rec = client.post("/record", json={"title": "Pick and pack", "expert": "Laura"}).json()
    assert rec["status"] == "recording"
    assert client.post(f"/record/{rec['id']}/finish").status_code == 409
    clip = (FIXTURES / "media/proc-pick-pack/step-2.mp4").read_bytes()
    r = client.post(
        f"/record/{rec['id']}/steps",
        data={"narration": "Take a medium box. It fits five items."},
        files={"photo": ("p.jpg", jpeg((1200, 900)), "image/jpeg"), "clip": ("c.mp4", clip, "video/mp4")},
    )
    assert r.status_code == 200
    step = r.json()["steps"][0]
    assert step["photo_url"].endswith(f"/media/{rec['id']}/1.jpg")
    assert step["clip_url"].endswith(f"/media/{rec['id']}/1.mp4")
    with Image.open(io.BytesIO(client.get(step["photo_url"]).content)) as img:
        assert max(img.size) <= 600
    bad = client.post(
        f"/record/{rec['id']}/steps", data={"narration": "x"}, files={"photo": ("p.jpg", jpeg(), "image/jpeg"), "clip": ("c.mp4", b"junk", "video/mp4")}
    )
    assert bad.status_code == 400
    # TestClient runs the background task before it returns, so the draft is already written.
    assert client.post(f"/record/{rec['id']}/finish").json()["status"] == "processing"
    done = client.get(f"/record/{rec['id']}").json()
    assert done["status"] == "done"
    process = client.get(f"/processes/{done['process_id']}").json()
    assert process["status"] == "draft"
    assert process["steps"][0]["title"] == "Take a medium box."
    assert process["steps"][0]["clip_url"] == step["clip_url"]
    assert client.post(f"/record/{rec['id']}/finish").status_code == 409
    second = client.post("/record", json={"title": "Second"}).json()
    assert [r["id"] for r in client.get("/record").json()["recordings"]] == [second["id"], rec["id"]]


def test_a_recorded_step_without_narration_is_kept(client, monkeypatch):
    """The glasses send an empty narration when the expert said nothing or speech recognition heard nothing.

    The step was lost with a 422 before; now it is a draft step that a person has to write and review.
    """
    monkeypatch.setattr(main, "MOCK_RECORD", True)
    rec = client.post("/record", json={"title": "Seal the box", "expert": "Laura"}).json()
    files = {"photo": ("p.jpg", jpeg(), "image/jpeg")}
    assert client.post(f"/record/{rec['id']}/steps", data={"narration": "Tape the box shut."}, files=files).status_code == 200
    silent = client.post(f"/record/{rec['id']}/steps", data={"narration": ""}, files=files)
    assert silent.status_code == 200
    assert silent.json()["steps"][1]["narration"] == ""
    assert client.post(f"/record/{rec['id']}/steps", files=files).status_code == 200  # no narration field at all
    client.post(f"/record/{rec['id']}/finish")
    done = client.get(f"/record/{rec['id']}").json()
    process = client.get(f"/processes/{done['process_id']}").json()
    assert [s["title"] for s in process["steps"]] == ["Tape the box shut.", "Step 2", "Step 3"]
    assert process["steps"][1]["source"] is None  # nothing was said, so there is no quote to show the reviewer
    assert all(s["reviewed"] is False for s in process["steps"])
    # A step nobody has written cannot reach a learner: publishing is refused until a person has reviewed it.
    assert client.put(f"/processes/{process['id']}", json={**process, "status": "published"}).status_code == 422


def test_a_given_up_step_upload_is_taken_back(client, monkeypatch):
    """The expert cancels a slow upload on the glasses, and the glasses say "Step not saved".

    That has to be true whether the upload had already arrived or arrives afterwards.
    """
    monkeypatch.setattr(main, "MOCK_RECORD", True)
    rec = client.post("/record", json={"title": "Seal the box", "expert": "Laura"}).json()
    steps = f"/record/{rec['id']}/steps"
    files = {"photo": ("p.jpg", jpeg(), "image/jpeg")}
    assert client.post(steps, data={"narration": "Fold the flaps.", "key": "step-a"}, files=files).status_code == 200

    # It arrived before the glasses gave up: the step and its picture are removed.
    arrived = client.post(steps, data={"narration": "Wrong take.", "key": "step-b"}, files=files).json()["steps"][1]
    assert client.get(arrived["photo_url"]).status_code == 200
    after = client.delete(f"{steps}/step-b")
    assert after.status_code == 200
    assert [s["narration"] for s in after.json()["steps"]] == ["Fold the flaps."]
    assert client.get(arrived["photo_url"]).status_code == 404

    # It arrives after the glasses gave up: nothing of it is kept.
    assert client.delete(f"{steps}/step-c").status_code == 200
    late = client.post(steps, data={"narration": "Late take.", "key": "step-c"}, files=files)
    assert late.status_code == 200
    assert [s["narration"] for s in late.json()["steps"]] == ["Fold the flaps."]

    # The next step is step 2, and its picture never replaces a picture that is still in use.
    again = client.post(steps, data={"narration": "Tape it shut.", "key": "step-d"}, files=files).json()["steps"]
    assert [(s["index"], s["narration"]) for s in again] == [(1, "Fold the flaps."), (2, "Tape it shut.")]
    assert len({s["photo_url"] for s in again}) == 2
    assert all(client.get(s["photo_url"]).status_code == 200 for s in again)

    assert client.delete(f"{steps}/not%20a%20key").status_code == 422
    assert client.delete("/record/rec-999/steps/step-a").status_code == 404
    client.post(f"/record/{rec['id']}/finish")
    assert client.delete(f"{steps}/step-a").status_code == 409  # a finished recording is not changed any more
    process = client.get(f"/processes/proc-{rec['id']}").json()
    assert [s["title"] for s in process["steps"]] == ["Fold the flaps.", "Tape it shut."]


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
