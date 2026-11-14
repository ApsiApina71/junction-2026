"""Learning progress (JUN-73): the worker's own, and anonymous totals."""

import io
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import demo, main
from app.models import CheckResult, Process
from app.progress import Progress
from app.store import TIMEZONE, Store, load_fixture
from app.verifier import Tracker

PROCESS = Process.model_validate(load_fixture("process-pick-pack.json"))
T0 = datetime(2026, 11, 14, 9, 0, tzinfo=TIMEZONE)


def result(status, say=None, done=False):
    return CheckResult(status=status, text="", say=say, decided_by="rules", step_done=done)


def run_task(p: Progress, run_id: str, start: datetime, minutes: int, employee="emp-sami", problem=True):
    steps = PROCESS.steps
    p.record(run_id, employee, PROCESS, steps[0], result("ok", done=True), now=start)
    if problem:
        p.record(run_id, employee, PROCESS, steps[1], result("checking"), now=start)
        p.record(run_id, employee, PROCESS, steps[1], result("warning", say="Wrong item"), now=start)
        p.record(run_id, employee, PROCESS, steps[1], result("warning"), now=start)  # same warning, not spoken again
        p.record(run_id, employee, PROCESS, steps[1], result("ok", say="All good"), now=start)
    for step in steps[1:]:
        p.record(run_id, employee, PROCESS, step, result("ok", done=True), now=start + timedelta(minutes=minutes))


def test_a_caught_and_fixed_problem_is_counted_once():
    p = Progress()
    run_task(p, "r1", T0, 6)
    mine = p.for_employee("emp-sami")
    assert (mine["tasks_done"], mine["steps_done"], mine["problems_caught"], mine["problems_fixed"]) == (1, 5, 1, 1)
    assert mine["runs"][0]["seconds"] == 360
    assert mine["faster_than_first"] is None  # only one finished run of this task


def test_faster_than_the_first_time():
    p = Progress()
    run_task(p, "r1", T0, 9)
    run_task(p, "r2", T0 + timedelta(hours=1), 4, problem=False)
    mine = p.for_employee("emp-sami")
    assert mine["tasks_done"] == 2
    assert [r["run_id"] for r in mine["runs"]] == ["r2", "r1"]  # newest first
    assert mine["faster_than_first"] is True


def test_an_unfinished_run_is_not_a_task_done():
    p = Progress()
    p.record("r1", "emp-sami", PROCESS, PROCESS.steps[0], result("ok", done=True), now=T0)
    mine = p.for_employee("emp-sami")
    assert (mine["tasks_done"], mine["steps_done"], mine["runs"][0]["finished_at"]) == (0, 1, None)


def test_stats_are_anonymous():
    p = Progress()
    run_task(p, "r1", T0, 6, employee="emp-sami")
    run_task(p, "r2", T0, 10, employee="emp-aino")
    run_task(p, "r3", T0 + timedelta(hours=2), 3, employee="emp-aino", problem=False)
    stats = p.stats()
    assert stats == {
        "runs": 3,
        "tasks_finished": 3,
        "workers": 2,
        "median_seconds_to_first_finished_task": 480,  # first runs: 6 and 10 minutes
        "problems_caught": 2,
        "problems_fixed": 2,
    }
    assert "emp-" not in str(stats)


# HTTP


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "tracker", Tracker())
    monkeypatch.setattr(main, "progress", Progress())
    # The pick-and-pack story with a zero-second "wrong carton" phase per frame count is hard to time; use a short one.
    script = {
        "steps": {
            "proc-pick-pack:step-2": [
                {"until_seconds": 0.2, "observation": demo.Demo().script["steps"]["proc-pick-pack:step-2"][0]["observation"]},
                {"observation": {}},
            ]
        }
    }
    monkeypatch.setattr(main, "demo", demo.Demo(script))
    monkeypatch.setattr(main, "DEMO", True)
    monkeypatch.setattr(main, "MOCK_CHECK", False)
    monkeypatch.setattr(main, "API_TOKEN", "")
    return TestClient(main.app)


def jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 48)).save(buf, format="JPEG")
    return buf.getvalue()


def test_a_whole_task_over_http(client):
    import time

    def check(step_id, final=False):
        data = {"process_id": "proc-pick-pack", "step_id": step_id, "run_id": "stage", "employee_id": "emp-sami", "final": str(final).lower()}
        return client.post("/check", data=data, files={"image": ("f.jpg", jpeg(), "image/jpeg")}).json()

    assert check("step-1", final=True)["step_done"] is True
    assert check("step-2")["status"] == "checking"
    assert check("step-2")["status"] == "warning"
    time.sleep(0.25)
    assert check("step-2", final=True)["step_done"] is True
    for step in ("step-3", "step-4", "step-5"):
        assert check(step, final=True)["step_done"] is True

    mine = client.get("/employees/emp-sami/progress").json()
    assert (mine["tasks_done"], mine["steps_done"], mine["problems_caught"], mine["problems_fixed"]) == (1, 5, 1, 1)
    assert client.get("/employees/nobody/progress").status_code == 404
    assert client.get("/stats").json()["problems_fixed"] == 1
