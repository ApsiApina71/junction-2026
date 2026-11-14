"""Training period with a target level (JUN-96): Owl suggests, the worker sees it first, a person confirms."""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import main, training
from app.models import CheckResult, Process
from app.progress import Progress
from app.store import TIMEZONE, Store, load_fixture
from app.verifier import Tracker

PROCESS = Process.model_validate(load_fixture("process-pick-pack.json"))


def done(p: Progress, run_id: str, step_ids=None, helped=(), employee="emp-sami", at=None):
    at = at or datetime.now(TIMEZONE)
    for step in PROCESS.steps:
        if step_ids is None or step.id in step_ids:
            if step.id in helped:
                p.helped(employee, PROCESS.id, step.id)
            p.record(run_id, employee, PROCESS, step, CheckResult(status="ok", text="", decided_by="rules", step_done=True), now=at)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "tracker", Tracker())
    monkeypatch.setattr(main, "progress", Progress())
    monkeypatch.setattr(main, "API_TOKEN", "")
    monkeypatch.setattr(main, "MOCK_ASK", True)
    return TestClient(main.app)


def test_no_training_period_is_a_404(client):
    assert client.get("/employees/emp-sami/training").status_code == 404
    assert client.get("/employees/nobody/training").status_code == 404


def test_progress_towards_the_level(client):
    today = training.today()
    r = client.put("/employees/emp-sami/training", json={"starts": (today - timedelta(days=1)).isoformat()})
    assert r.status_code == 200
    t = r.json()
    assert (t["plan_id"], t["day"], t["days"], t["days_left"], t["active"]) == ("plan-warehouse-picker", 2, 5, 3, True)
    assert t["suggestion"] is None and len(t["target"]) == 5

    done(main.progress, "r1", helped=("step-4",))
    done(main.progress, "r2")
    t = client.get("/employees/emp-sami/training").json()
    rows = {row["step_id"]: row for row in t["target"]}
    assert rows["step-1"]["done_without_help"] == 2 and rows["step-1"]["title"] == "Take a medium box"
    assert rows["step-4"]["done_without_help"] == 1  # asked Owl in r1
    assert [p["step_id"] for p in t["practise"]] == ["step-1", "step-2", "step-3", "step-4", "step-5"]


def test_asking_owl_during_a_step_is_help(client):
    client.put("/employees/emp-sami/training", json={"starts": training.today().isoformat()})
    main.progress.record("r1", "emp-sami", PROCESS, PROCESS.steps[0], CheckResult(status="checking", text="", decided_by="rules"))
    client.post("/ask", json={"question": "Which box?", "employee_id": "emp-sami", "process_id": "proc-pick-pack", "step_id": "step-1"})
    done(main.progress, "r1")
    rows = {row["step_id"]: row for row in client.get("/employees/emp-sami/training").json()["target"]}
    assert rows["step-1"]["done_without_help"] == 0
    assert rows["step-2"]["done_without_help"] == 1


def test_runs_before_the_training_period_do_not_count(client):
    client.put("/employees/emp-sami/training", json={"starts": training.today().isoformat()})
    done(main.progress, "old", at=datetime.now(TIMEZONE) - timedelta(days=3))
    assert client.get("/employees/emp-sami/training").json()["target"][0]["done_without_help"] == 0


def test_the_worker_sees_it_first_then_a_person_confirms(client):
    client.put("/employees/emp-sami/training", json={"starts": (training.today() - timedelta(days=4)).isoformat()})
    for n in range(3):
        done(main.progress, f"r{n}", helped=("step-4",) if n == 0 else ())
    t = client.get("/employees/emp-sami/training").json()
    assert (t["days_left"], t["suggestion"]) == (0, "more_practice")
    assert [p["title"] for p in t["practise"]] == ["Pack heavy items first"]

    listed = client.get("/training").json()["trainees"][0]
    assert listed["suggestion"] is None and listed["waiting_for_worker"] is True
    confirm = {"result": "more_practice", "by": "Laura"}
    assert client.post("/employees/emp-sami/training/confirm", json=confirm).status_code == 409

    assert client.post("/employees/emp-sami/training/seen").json()["seen_at"]
    assert client.get("/training").json()["trainees"][0]["suggestion"] == "more_practice"
    t = client.post("/employees/emp-sami/training/confirm", json=confirm | {"extend_days": 2}).json()
    assert t["confirmed"]["result"] == "more_practice" and t["confirmed"]["by"] == "Laura"
    assert (t["days_left"], t["suggestion"], t["seen_at"]) == (2, None, None)  # training goes on

    done(main.progress, "r3")
    t = client.get("/employees/emp-sami/training").json()
    assert t["suggestion"] == "ready" and t["seen_at"] is None


def test_finnish_titles_for_a_finnish_worker(client):
    client.put("/employees/emp-ville/training", json={"starts": training.today().isoformat()})
    t = client.get("/employees/emp-ville/training").json()
    assert t["plan_id"] == "plan-varastotyontekija"
    assert t["target"][0]["task"] != PROCESS.title  # the Finnish task name


def test_a_role_without_a_plan_needs_a_plan(client):
    client.put("/employees/emp-leo", json={"role": "Driver"})
    assert client.put("/employees/emp-leo/training", json={"starts": training.today().isoformat()}).status_code == 422
    r = client.put("/employees/emp-leo/training", json={"starts": training.today().isoformat(), "plan_id": "plan-warehouse-picker"})
    assert r.status_code == 200
    assert client.put("/employees/emp-leo/training", json={"starts": None}).status_code == 200
    assert client.get("/employees/emp-leo/training").status_code == 404


def test_plans_are_edited_in_studio(client):
    plan = {"id": "plan-packer", "role": "Packer", "days": 3, "target": [{"process_id": "proc-pick-pack", "step_id": "step-4", "required": 2}]}
    assert client.put("/training/plans/plan-packer", json=plan).status_code == 200
    assert "plan-packer" in [p["id"] for p in client.get("/training/plans").json()["plans"]]
    bad = plan | {"target": [{"process_id": "proc-pick-pack", "step_id": "step-9"}]}
    assert client.put("/training/plans/plan-packer", json=bad).status_code == 422
    assert client.delete("/training/plans/plan-packer").status_code == 204
    assert client.delete("/training/plans/plan-packer").status_code == 404


def test_forget_me_also_drops_the_result(client):
    client.put("/employees/emp-sami/training", json={"starts": (training.today() - timedelta(days=4)).isoformat()})
    done(main.progress, "r1")
    client.post("/employees/emp-sami/training/seen")
    assert client.delete("/employees/emp-sami/progress").status_code == 204
    t = client.get("/employees/emp-sami/training").json()
    assert t["target"][0]["done_without_help"] == 0 and t["seen_at"] is None


def test_demo_seed_puts_sami_on_the_last_day(tmp_path):
    store, progress = Store(data_dir=tmp_path), Progress()
    training.seed_demo(store, progress)
    training.seed_demo(store, progress)  # twice changes nothing
    assert len([r for r in progress.runs if r.startswith("demo-seed-")]) == 4
    t = training.summary(store, progress, store.employees["emp-sami"])
    assert (t["day"], t["days_left"], t["suggestion"]) == (5, 0, "more_practice")
    assert [p["step_id"] for p in t["practise"]] == ["step-4"]
    rows = {row["step_id"]: row["done_without_help"] for row in t["target"]}
    assert rows == {"step-1": 3, "step-2": 3, "step-3": 3, "step-4": 2, "step-5": 3}

    done(progress, "live")  # one more run without help: ready
    assert training.summary(store, progress, store.employees["emp-sami"])["suggestion"] == "ready"


def test_the_fixture_plans_point_at_real_steps():
    store = Store()
    for plan in store.training_plans.values():
        for t in plan.target:
            assert any(s.id == t.step_id for s in store.processes[t.process_id].steps), (plan.id, t)


def test_training_survives_a_restart(tmp_path):
    from app import persist

    store, progress = Store(data_dir=tmp_path), Progress()
    training.seed_demo(store, progress)
    progress.helped("emp-sami", "proc-pick-pack", "step-1")
    persist.save(store, progress)
    store2, progress2 = Store(data_dir=tmp_path), Progress()
    assert persist.load(store2, progress2)
    assert store2.trainings == store.trainings
    assert progress2.runs["demo-seed-1"].helped_steps == {"step-2", "step-4"}
    assert training.summary(store2, progress2, store2.employees["emp-sami"])["suggestion"] == "more_practice"
