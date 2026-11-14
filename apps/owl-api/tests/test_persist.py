"""MVP reliability (JUN-78): the state survives a restart; a broken file never crashes owl-api."""

import io
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main, persist
from app.progress import Progress
from app.store import Store
from app.verifier import Tracker


@pytest.fixture
def server(tmp_path, monkeypatch):
    def start():
        """A fresh "process": a new store and progress that load what the last one saved."""
        store, progress = Store(data_dir=tmp_path), Progress()
        persist.load(store, progress)
        monkeypatch.setattr(main, "store", store)
        monkeypatch.setattr(main, "progress", progress)
        monkeypatch.setattr(main, "tracker", Tracker())
        return TestClient(main.app)

    monkeypatch.setattr(main, "API_TOKEN", "")
    monkeypatch.setattr(main, "MOCK_CHECK", True)
    monkeypatch.setattr(main, "MOCK_RECORD", True)
    return start


def jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (320, 240), (90, 90, 90)).save(buf, format="JPEG")
    return buf.getvalue()


def test_everything_added_survives_a_restart(server, tmp_path):
    client = server()
    aino = client.post("/employees", json={"name": "Aino", "language": "fi", "process_ids": ["proc-pick-pack"], "glasses_id": "glasses-3"}).json()
    rec = client.post("/record", json={"title": "Seal the box", "expert": "Laura"}).json()
    client.post(f"/record/{rec['id']}/steps", data={"narration": "Tape the box shut."}, files={"photo": ("p.jpg", jpeg(), "image/jpeg")})
    client.post(f"/record/{rec['id']}/finish")
    process_id = client.get(f"/record/{rec['id']}").json()["process_id"]
    client.post(f"/employees/{aino['id']}/consent", json={"camera_checks": True})
    form = {"process_id": "proc-pick-pack", "step_id": "step-1", "run_id": "r1", "employee_id": aino["id"], "final": "true"}
    client.post("/check", data=form, files={"image": ("f.jpg", jpeg(), "image/jpeg")})
    assert (tmp_path / "state.json").is_file()

    client = server()  # restart
    assert client.get(f"/employees/{aino['id']}").json()["glasses_id"] == "glasses-3"
    assert client.get("/glasses/glasses-3/employee").json()["id"] == aino["id"]
    assert client.get(f"/processes/{process_id}").json()["status"] == "draft"
    assert client.get(f"/record/{rec['id']}").json()["status"] == "done"
    assert client.get(f"/employees/{aino['id']}/progress").json()["steps_done"] == 1
    assert client.get(f"/employees/{aino['id']}/consent").json()["camera_checks"] is True
    # New ids do not collide with the ones from before the restart.
    assert client.post("/record", json={"title": "Next"}).json()["id"] != rec["id"]


def test_help_sessions_are_not_kept(server):
    client = server()
    client.post("/help/frames", data={"employee_id": "emp-sami"}, files={"image": ("f.jpg", jpeg(), "image/jpeg")})
    assert client.get("/help").json()["sessions"]
    assert server().get("/help").json()["sessions"] == []


def test_a_broken_state_file_starts_from_the_fixtures(tmp_path, caplog):
    (tmp_path / "state.json").write_text("{not json", encoding="utf-8")
    store, progress = Store(data_dir=tmp_path), Progress()
    assert persist.load(store, progress) is False
    assert "emp-sami" in store.employees
    assert "cannot be read" in caplog.text


def test_the_write_is_atomic(tmp_path):
    store, progress = Store(data_dir=tmp_path), Progress()
    persist.save(store, progress)
    assert not (tmp_path / "state.tmp").exists()
    assert json.loads((tmp_path / "state.json").read_text())["version"] == persist.VERSION


def test_reads_never_write(server, tmp_path):
    client = server()
    client.get("/processes")
    client.get("/employees/emp-sami")
    assert not (tmp_path / "state.json").exists()
