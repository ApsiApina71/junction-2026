"""Employees and glasses (JUN-41), process languages, document delete (JUN-38) and Help privacy and marks (JUN-33, JUN-59, JUN-60)."""

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
    return TestClient(main.app)


def jpeg(size=(200, 120), color=(40, 60, 80)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="JPEG")
    return buf.getvalue()


def start_help(client) -> dict:
    data = {"employee_id": "emp-sami", "process_id": "proc-pick-pack", "step_id": "step-2"}
    return client.post("/help/frames", data=data, files={"image": ("f.jpg", jpeg(), "image/jpeg")}).json()


# Employees and glasses


def test_employees_list_has_the_seeded_worker_and_his_glasses(client):
    employees = client.get("/employees").json()["employees"]
    assert [(e["id"], e["glasses_id"]) for e in employees] == [("emp-sami", "glasses-1")]
    assert client.get("/employees/emp-sami").json()["glasses_id"] == "glasses-1"


def test_add_employee_writes_id_company_and_welcome(client):
    r = client.post("/employees", json={"name": " Aino Mäkelä ", "language": "en", "role": "Packer", "process_ids": ["proc-pick-pack"]})
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "emp-aino-makela"
    assert body["name"] == "Aino Mäkelä"
    assert body["company"] == "Kide Logistics"
    assert body["glasses_id"] is None
    assert body["welcome"] == "Welcome to Kide Logistics, Aino Mäkelä! Today's task: Pick and pack an order. I'm Owl. I'll show you each step."
    assert client.get("/employees/emp-aino-makela").json() == body
    assert len(client.get("/employees").json()["employees"]) == 2


def test_welcome_is_in_the_employees_language(client):
    finnish = client.post("/employees", json={"name": "Aino", "language": "fi-FI", "process_ids": ["proc-pick-pack"]}).json()
    assert finnish["welcome"] == (
        "Tervetuloa, Aino! Olet nyt osa yritystä Kide Logistics. Tämän päivän tehtävä: Kerää ja pakkaa tilaus. Olen Owl ja näytän sinulle jokaisen vaiheen."
    )
    no_task = client.post("/employees", json={"name": "Olena", "language": "uk"}).json()  # no Ukrainian template: English
    assert no_task["welcome"] == "Welcome to Kide Logistics, Olena! I'm Owl. I'll show you each step."
    assert no_task["role"] == ""
    assert no_task["process_ids"] == []


def test_employee_ids_never_clash(client):
    ids = [client.post("/employees", json={"name": name, "language": "en"}).json()["id"] for name in ("Sami", "Sami", "Олена", "Олена")]
    assert ids[:2] == ["emp-sami-2", "emp-sami-3"]
    assert len(set(ids)) == 4
    assert all(i.startswith("emp-") for i in ids)


def test_add_employee_rejects_bad_input(client):
    assert client.post("/employees", json={"name": "Aino", "language": "en", "process_ids": ["proc-nope"]}).status_code == 422
    assert client.post("/employees", json={"name": "   ", "language": "en"}).status_code == 422
    assert client.post("/employees", json={"name": "Aino", "language": "finnish language"}).status_code == 422
    assert client.post("/employees", json={"name": "Aino", "language": "en", "glasses_id": "pair/1"}).status_code == 422
    assert client.post("/employees", json={"language": "en"}).status_code == 422


def test_template_welcome_follows_the_employee_and_a_custom_one_stays(client):
    seeded = client.get("/employees/emp-sami").json()["welcome"]
    # A change that is not the name, the language or the tasks leaves the welcome alone.
    assert client.put("/employees/emp-sami", json={"role": "Packer"}).json()["welcome"] == seeded
    # The seeded welcome counts as written by Owl: it follows the language.
    finnish = client.put("/employees/emp-sami", json={"language": "fi"}).json()
    assert finnish["language"] == "fi"
    assert finnish["welcome"].startswith("Tervetuloa, Sami!")
    assert "Kerää ja pakkaa tilaus" in finnish["welcome"]

    custom = client.put("/employees/emp-sami", json={"welcome": "Moi Sami, kiva kun tulit!"}).json()
    assert custom["welcome"] == "Moi Sami, kiva kun tulit!"
    assert client.put("/employees/emp-sami", json={"name": "Sami K", "language": "en"}).json()["welcome"] == "Moi Sami, kiva kun tulit!"
    # An empty welcome hands it back to Owl.
    again = client.put("/employees/emp-sami", json={"welcome": ""}).json()
    assert again["welcome"] == "Welcome to Kide Logistics, Sami K! Today's task: Pick and pack an order. I'm Owl. I'll show you each step."


def test_custom_welcome_on_create_stays(client):
    created = client.post("/employees", json={"name": "Aino", "language": "en", "welcome": "Hi Aino, glad you're here."}).json()
    assert created["welcome"] == "Hi Aino, glad you're here."
    assert client.put(f"/employees/{created['id']}", json={"language": "fi"}).json()["welcome"] == "Hi Aino, glad you're here."


def test_update_employee_rejects_bad_input(client):
    assert client.put("/employees/nobody", json={"name": "X"}).status_code == 404
    assert client.put("/employees/emp-sami", json={"process_ids": ["proc-nope"]}).status_code == 422
    assert client.get("/employees/emp-sami").json()["process_ids"] == ["proc-pick-pack"]


def test_a_pair_of_glasses_has_one_worker(client):
    assert client.get("/glasses/glasses-1/employee").json()["id"] == "emp-sami"
    aino = client.post("/employees", json={"name": "Aino", "language": "fi", "glasses_id": "glasses-1"}).json()
    assert aino["glasses_id"] == "glasses-1"
    assert client.get("/glasses/glasses-1/employee").json()["id"] == aino["id"]
    assert client.get("/employees/emp-sami").json()["glasses_id"] is None

    # Handing the pair back to Sami takes it from Aino.
    assert client.put("/employees/emp-sami", json={"glasses_id": "glasses-1"}).json()["glasses_id"] == "glasses-1"
    assert client.get(f"/employees/{aino['id']}").json()["glasses_id"] is None

    # null takes the glasses away; leaving the field out does not.
    assert client.put("/employees/emp-sami", json={"role": "Picker"}).json()["glasses_id"] == "glasses-1"
    assert client.put("/employees/emp-sami", json={"glasses_id": None}).json()["glasses_id"] is None
    r = client.get("/glasses/glasses-1/employee")
    assert r.status_code == 404
    assert r.json() == {"detail": "These glasses are not assigned to anyone yet."}


def test_new_endpoints_need_the_token(client, monkeypatch):
    monkeypatch.setattr(main, "API_TOKEN", "secret")
    ok = {"X-Api-Token": "secret"}
    assert client.get("/employees").status_code == 401
    assert client.get("/employees", headers=ok).status_code == 200
    assert client.post("/employees", json={"name": "Aino", "language": "en"}).status_code == 401
    assert client.put("/employees/emp-sami", json={"role": "X"}).status_code == 401
    assert client.get("/glasses/glasses-1/employee").status_code == 401
    assert client.get("/glasses/glasses-1/employee", headers=ok).status_code == 200
    assert client.delete("/docs/doc-warehouse-handbook").status_code == 401


# Process languages


def test_process_in_the_workers_language(client):
    original = client.get("/processes/proc-pick-pack").json()
    finnish = client.get("/processes/proc-pick-pack", params={"language": "fi"}).json()
    assert (finnish["language"], finnish["title"]) == ("fi", "Kerää ja pakkaa tilaus")
    assert [s["id"] for s in finnish["steps"]] == [s["id"] for s in original["steps"]]
    assert finnish["steps"][1]["clip_url"] == "http://testserver/media/proc-pick-pack/step-2.mp4"
    assert finnish["steps"][1]["check"]["order_lines"][0] == {"sku": "OAT-1L", "name": "Kaurajuoma 1 l", "qty": 2}

    assert client.get("/processes", params={"language": "fi-FI"}).json()["processes"][0]["title"] == "Kerää ja pakkaa tilaus"
    # No translation: the process as it is. A translation is never listed as a process of its own.
    assert client.get("/processes", params={"language": "sv"}).json()["processes"] == [original]
    assert client.get("/processes").json()["processes"] == [original]
    assert client.get("/processes/proc-pick-pack", params={"language": "en"}).json() == original


def test_translation_follows_publishing_and_goes_stale_with_the_words(client):
    body = client.get("/processes/proc-pick-pack").json()
    body["status"] = "draft"
    assert client.put("/processes/proc-pick-pack", json=body).status_code == 200
    finnish = client.get("/processes/proc-pick-pack", params={"language": "fi"}).json()
    assert (finnish["title"], finnish["status"]) == ("Kerää ja pakkaa tilaus", "draft")

    body["steps"][0]["instruction"] = "Take a large box (L)."
    assert client.put("/processes/proc-pick-pack", json=body).status_code == 200
    stale = client.get("/processes/proc-pick-pack", params={"language": "fi"}).json()
    assert (stale["language"], stale["steps"][0]["instruction"]) == ("en", "Take a large box (L).")


def test_put_in_another_language_is_stored_as_a_translation(client):
    original = client.get("/processes/proc-pick-pack").json()
    swedish = {**original, "language": "sv", "title": "Plocka och packa en order", "status": "draft"}
    r = client.put("/processes/proc-pick-pack", json=swedish)
    assert r.status_code == 200
    assert (r.json()["title"], r.json()["status"]) == ("Plocka och packa en order", "published")  # publishing stays with the original
    assert client.get("/processes/proc-pick-pack").json() == original
    assert client.get("/processes/proc-pick-pack", params={"language": "sv"}).json()["title"] == "Plocka och packa en order"
    assert client.get("/processes/proc-pick-pack", params={"language": "fi"}).json()["title"] == "Kerää ja pakkaa tilaus"

    fewer = {**swedish, "steps": swedish["steps"][:3]}
    assert client.put("/processes/proc-pick-pack", json=fewer).status_code == 422


def test_put_renumbers_steps_and_keeps_their_ids(client):
    body = client.get("/processes/proc-pick-pack").json()
    steps = body["steps"]
    body["steps"] = [steps[1], steps[0], steps[4]]  # reordered, two deleted, indexes left as they were
    r = client.put("/processes/proc-pick-pack", json=body)
    assert r.status_code == 200
    assert [(s["id"], s["index"]) for s in r.json()["steps"]] == [("step-2", 1), ("step-1", 2), ("step-5", 3)]
    assert [(s.id, s.index) for s in main.store.processes["proc-pick-pack"].steps] == [("step-2", 1), ("step-1", 2), ("step-5", 3)]

    body["steps"] = [steps[0], steps[0]]
    r = client.put("/processes/proc-pick-pack", json=body)
    assert r.status_code == 422
    assert r.json() == {"detail": "Two steps have the same id."}


# Documents


def test_delete_an_uploaded_document(client, tmp_path):
    doc = client.post("/docs", files={"file": ("Oven rules.md", b"# Oven rules\n\nNever open the oven door early.", "text/markdown")}).json()
    stored = tmp_path / "docs" / "oven-rules.md"
    assert stored.is_file()
    r = client.delete(f"/docs/{doc['id']}")
    assert r.status_code == 204
    assert r.content == b""
    assert not stored.exists()
    assert [d["id"] for d in client.get("/docs").json()["docs"]] == ["doc-warehouse-handbook"]
    assert client.delete(f"/docs/{doc['id']}").status_code == 404


def test_delete_a_seeded_document_only_forgets_it(client):
    assert client.delete("/docs/doc-warehouse-handbook").status_code == 204
    assert client.get("/docs").json()["docs"] == []
    assert (FIXTURES / "docs" / "warehouse-handbook.md").is_file()


# Help


def test_help_frame_url_cannot_be_guessed_and_has_its_time(client):
    session = start_help(client)
    assert session["frame_at"] == session["updated_at"]
    folder = session["latest_frame_url"].split("/media/help/")[1].split("/")[0]
    assert folder.startswith(f"{session['id']}-")
    assert len(folder) >= len(session["id"]) + 1 + 16
    assert client.get(f"/media/help/{session['id']}/latest.jpg").status_code == 404
    # A message moves updated_at; frame_at stays the time of the picture.
    said = client.post(f"/help/{session['id']}/say", json={"from": "worker", "text": "Which one?"}).json()
    assert said["frame_at"] == session["frame_at"]
    assert said["messages"][0]["image_url"] is None


def test_ending_help_deletes_its_frames(client, tmp_path):
    session = start_help(client)
    old_url = session["latest_frame_url"]
    marked = client.post(f"/help/{session['id']}/say", json={"text": "This one.", "mark": {"x": 0.5, "y": 0.5}}).json()
    mark_url = marked["messages"][0]["image_url"]
    assert client.get(old_url).status_code == 200
    assert client.get(mark_url).status_code == 200

    ended = client.post(f"/help/{session['id']}/end").json()
    assert ended["status"] == "ended"
    assert ended["latest_frame_url"] is None
    assert [m["image_url"] for m in ended["messages"]] == [None]
    assert client.get(old_url).status_code == 404
    assert client.get(mark_url).status_code == 404
    assert not list(tmp_path.rglob("*.jpg"))
    assert not (tmp_path / "media" / "help").exists() or not any((tmp_path / "media" / "help").iterdir())
    # Ending twice is harmless, and the listing shows no picture either.
    assert client.post(f"/help/{session['id']}/end").status_code == 200
    assert client.get("/help").json()["sessions"][0]["latest_frame_url"] is None


def test_ending_help_with_a_token_set_revokes_the_frame_url(tmp_path, monkeypatch):
    """Codex's retention check: after the end, the URL the console already has must stop working."""
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "API_TOKEN", "regression-test-token")
    monkeypatch.setattr(main, "PUBLIC_BASE_URL", "")
    headers = {"X-Api-Token": "regression-test-token"}
    with TestClient(main.app) as client:
        started = client.post(
            "/help/frames",
            headers=headers,
            data={"employee_id": "emp-sami", "process_id": "proc-pick-pack", "step_id": "step-2"},
            files={"image": ("synthetic.jpg", jpeg((64, 48)), "image/jpeg")},
        )
        assert started.status_code == 200
        session = started.json()
        old_url = session["latest_frame_url"]
        assert client.get(old_url, headers=headers).status_code == 200
        ended = client.post(f"/help/{session['id']}/end", headers=headers)
        assert ended.status_code == 200
        assert ended.json()["status"] == "ended"
        assert client.get(old_url, headers=headers).status_code in (404, 410)
        assert not list(tmp_path.rglob("*.jpg"))


def test_expert_mark_draws_a_ring_on_the_workers_view(client):
    session = start_help(client)
    r = client.post(f"/help/{session['id']}/say", json={"from": "expert", "text": "The blue carton.", "mark": {"x": 0.25, "y": 0.5}})
    assert r.status_code == 200
    message = r.json()["messages"][0]
    assert message["image_url"].endswith("/mark-1.jpg")
    assert message["image_url"].startswith(session["latest_frame_url"].rsplit("/", 1)[0])

    with Image.open(io.BytesIO(client.get(message["image_url"]).content)) as img:
        assert img.size == (200, 120)
        radius = round(120 * 0.09)
        ring = img.getpixel((50 + radius, 60))  # on the ring, right of the centre
        centre = img.getpixel((50, 60))
        far = img.getpixel((180, 20))
    assert ring[0] > 200 and ring[1] > 160 and ring[2] < 110  # bright yellow
    for untouched in (centre, far):  # the spot itself and the rest of the view stay as the worker sees them
        assert all(abs(a - b) < 25 for a, b in zip(untouched, (40, 60, 80), strict=True))


def test_mark_needs_an_expert_a_frame_and_valid_coordinates(client, tmp_path):
    session = start_help(client)
    # The worker cannot mark; the text still arrives.
    worker = client.post(f"/help/{session['id']}/say", json={"from": "worker", "text": "Here?", "mark": {"x": 0.5, "y": 0.5}}).json()
    assert worker["messages"][0]["image_url"] is None
    assert client.post(f"/help/{session['id']}/say", json={"text": "There.", "mark": {"x": 1.2, "y": 0.5}}).status_code == 422

    # No frame on disk: the message is saved without a picture.
    for frame in tmp_path.rglob("latest.jpg"):
        frame.unlink()
    no_frame = client.post(f"/help/{session['id']}/say", json={"text": "Top shelf.", "mark": {"x": 0.5, "y": 0.5}}).json()
    assert [(m["id"], m["text"], m["image_url"]) for m in no_frame["messages"]] == [(1, "Here?", None), (2, "Top shelf.", None)]


def test_leftover_help_frames_are_deleted_at_start(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    leftover = tmp_path / "media" / "help" / "help-1-old" / "latest.jpg"
    leftover.parent.mkdir(parents=True)
    leftover.write_bytes(jpeg())
    recorded = tmp_path / "media" / "rec-1" / "1.jpg"
    recorded.parent.mkdir(parents=True)
    recorded.write_bytes(jpeg())
    with TestClient(main.app) as client:
        assert client.get("/health").status_code == 200
    assert not leftover.exists()
    assert recorded.is_file()  # recorded reference photos are the company's and stay
