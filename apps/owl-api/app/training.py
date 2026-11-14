"""Training period with a target level (JUN-96): Owl gives evidence, a person decides.

The company sets per role how many days training lasts and which steps must be verified how many times without
help. Only steps Owl verified count (JUN-57), and a step counts as "without help" only in a run where the worker did
not ask Owl or call for help during it. Mistakes the worker fixed are learning, not minus points.

The worker sees the suggestion first: Studio's list hides it until the glasses report it was shown (seen_at). The
result holds counts only: no camera images, no location, no timing.
"""

from collections.abc import Callable
from datetime import date, datetime, time, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from .models import Employee, TrainingConfirm, TrainingPlan, TrainingStart
from .progress import Progress, Run
from .store import TIMEZONE, Store, load_fixture, now_iso


def today() -> date:
    return datetime.now(TIMEZONE).date()


def plan_for(store: Store, employee: Employee, entry: dict) -> TrainingPlan | None:
    if entry.get("plan_id") in store.training_plans:
        return store.training_plans[entry["plan_id"]]
    role = employee.role.strip().lower()
    return next((p for p in store.training_plans.values() if role and p.role.strip().lower() == role), None)


def window(store: Store, employee_id: str) -> tuple[date, date] | None:
    """The first and the last day of this worker's training, or None when they have no training period."""
    entry = store.trainings.get(employee_id)
    employee = store.employees.get(employee_id)
    if not entry or not entry.get("starts") or employee is None:
        return None
    plan = plan_for(store, employee, entry)
    if plan is None:
        return None
    starts = date.fromisoformat(entry["starts"])
    return starts, starts + timedelta(days=plan.days + entry.get("extra_days", 0) - 1)


def in_training(store: Store, employee_id: str, on: date | None = None) -> bool:
    found = window(store, employee_id)
    return found is not None and found[0] <= (on or today()) <= found[1]


def customer_service(store: Store, employee_id: str) -> bool:
    """JUN-98: the worker's role has customer service mode."""
    employee = store.employees.get(employee_id)
    entry = store.trainings.get(employee_id)
    plan = plan_for(store, employee, entry) if employee and entry else None
    return bool(plan and plan.customer_service)


def summary(store: Store, progress: Progress, employee: Employee, on: date | None = None) -> dict | None:
    """The worker's training: the window, the progress towards the level, and Owl's suggestion."""
    entry = store.trainings.get(employee.id)
    found = window(store, employee.id)
    if entry is None or found is None:
        return None
    plan = plan_for(store, employee, entry)
    assert plan is not None
    on = on or today()
    starts, ends = found
    since = datetime.combine(starts, time.min, TIMEZONE)
    target = []
    for t in plan.target:
        process = store.processes.get(t.process_id)
        if process is None:
            continue
        shown = store.translated(process, employee.language)
        step = next((s for s in shown.steps if s.id == t.step_id), None)
        if step is None:
            continue
        done = progress.without_help(employee.id, t.process_id, t.step_id, since)
        target.append(
            {
                "process_id": t.process_id,
                "step_id": t.step_id,
                "title": step.title,
                "task": shown.title,
                "required": t.required,
                "done_without_help": min(done, t.required),
                "met": done >= t.required,
            }
        )
    practise = [{"process_id": t["process_id"], "step_id": t["step_id"], "title": t["title"]} for t in target if not t["met"]]
    days_left = (ends - on).days
    suggestion = None
    if target and not practise:
        suggestion = "ready"
    elif target and days_left <= 0:
        suggestion = "more_practice"
    return {
        "employee_id": employee.id,
        "plan_id": plan.id,
        "starts": starts.isoformat(),
        "ends": ends.isoformat(),
        "day": max(0, (on - starts).days + 1),
        "days": (ends - starts).days + 1,
        "days_left": max(0, days_left),
        "active": starts <= on <= ends,
        "customer_service": plan.customer_service,
        "target": target,
        "practise": practise,
        "suggestion": suggestion,
        "seen_at": entry.get("seen_at") if suggestion else None,
        "confirmed": entry.get("confirmed"),
    }


def seed_demo(store: Store, progress: Progress, on: date | None = None) -> None:
    """Demo mode: Sami is on the last day of their training week, with four earlier runs (fixtures/training.json).

    The days are counted back from today, so the demo works on any day. A training period set by hand stays.
    """
    on = on or today()
    demo = load_fixture("training.json").get("demo", {})
    with store.lock:
        for employee_id, seed in demo.get("trainings", {}).items():
            current = store.trainings.get(employee_id)
            if employee_id not in store.employees or (current and not current.get("demo")):
                continue
            starts = on - timedelta(days=seed["day"] - 1)
            if current and current.get("starts") == starts.isoformat():
                continue
            store.trainings[employee_id] = {
                "starts": starts.isoformat(),
                "plan_id": seed.get("plan_id"),
                "extra_days": 0,
                "seen_at": None,
                "confirmed": None,
                "demo": True,
            }
    seeded = {r.run_id for r in progress.runs.values() if r.run_id.startswith("demo-seed-")}
    for n, seed in enumerate(demo.get("runs", []), start=1):
        run_id = f"demo-seed-{n}"
        process = store.processes.get(seed["process_id"])
        if run_id in seeded or process is None or seed["employee_id"] not in store.employees:
            continue
        started = datetime.combine(on - timedelta(days=seed["days_ago"]), time(9, 30), TIMEZONE)
        steps = sorted(process.steps, key=lambda s: s.index)
        run = Run(run_id, seed["employee_id"], process.id, process.title, steps[-1].id, started, started + timedelta(seconds=seed["seconds"]))
        run.steps_done = {s.id for s in steps}
        run.helped_steps = set(seed.get("helped_steps", []))
        run.problems_caught = seed.get("problems_caught", 0)
        run.problems_fixed = seed.get("problems_fixed", 0)
        with progress._lock:
            progress.runs[run_id] = run


def router(get_store: Callable[[], Store], get_progress: Callable[[], Progress], auth: Any) -> APIRouter:
    api = APIRouter(dependencies=[auth])

    def get_employee(employee_id: str) -> Employee:
        found = get_store().employees.get(employee_id)
        if found is None:
            raise HTTPException(status_code=404, detail=f"No employee {employee_id}.")
        return found

    def get_summary(employee: Employee) -> dict:
        found = summary(get_store(), get_progress(), employee)
        if found is None:
            raise HTTPException(status_code=404, detail=f"{employee.name} has no training period.")
        return found

    @api.get("/training/plans")
    def plans() -> dict:
        return {"plans": [p.model_dump(mode="json") for p in get_store().training_plans.values()]}

    @api.put("/training/plans/{plan_id}", response_model=TrainingPlan)
    def save_plan(plan_id: str, body: TrainingPlan):
        store = get_store()
        if body.id != plan_id:
            raise HTTPException(status_code=422, detail="The plan id in the address and in the body differ.")
        for t in body.target:
            process = store.processes.get(t.process_id)
            if process is None or not any(s.id == t.step_id for s in process.steps):
                raise HTTPException(status_code=422, detail=f"No step {t.process_id}/{t.step_id}.")
        with store.lock:
            store.training_plans[plan_id] = body
        return body

    @api.delete("/training/plans/{plan_id}", status_code=204)
    def delete_plan(plan_id: str):
        store = get_store()
        with store.lock:
            if store.training_plans.pop(plan_id, None) is None:
                raise HTTPException(status_code=404, detail=f"No plan {plan_id}.")

    @api.get("/training")
    def trainees() -> dict:
        """Studio's list. Owl's suggestion shows only after the worker has seen it on the glasses."""
        store, progress = get_store(), get_progress()
        rows = []
        for employee in store.employees.values():
            found = summary(store, progress, employee)
            if found is None:
                continue
            if not found["seen_at"]:
                found = {**found, "suggestion": None, "waiting_for_worker": found["suggestion"] is not None}
            rows.append({**found, "name": employee.name, "role": employee.role})
        return {"trainees": rows}

    @api.get("/employees/{employee_id}/training")
    def training(employee_id: str) -> dict:
        return get_summary(get_employee(employee_id))

    @api.put("/employees/{employee_id}/training")
    def start_training(employee_id: str, body: TrainingStart, request: Request) -> Any:
        store = get_store()
        employee = get_employee(employee_id)
        if body.plan_id is not None and body.plan_id not in store.training_plans:
            raise HTTPException(status_code=422, detail=f"No plan {body.plan_id}.")
        with store.lock:
            if body.starts is None:
                store.trainings.pop(employee_id, None)
                return {"employee_id": employee_id, "plan_id": None}
            store.trainings[employee_id] = {"starts": body.starts.isoformat(), "plan_id": body.plan_id, "extra_days": 0, "seen_at": None, "confirmed": None}
        if plan_for(store, employee, store.trainings[employee_id]) is None:
            with store.lock:
                store.trainings.pop(employee_id, None)
            raise HTTPException(status_code=422, detail=f"No training plan for the role {employee.role or '(none)'}. Pick a plan.")
        return get_summary(employee)

    @api.post("/employees/{employee_id}/training/seen")
    def seen(employee_id: str) -> dict:
        """The glasses showed the worker Owl's suggestion. Only now does Studio show it."""
        store = get_store()
        employee = get_employee(employee_id)
        found = get_summary(employee)
        if found["suggestion"] and not found["seen_at"]:
            with store.lock:
                store.trainings[employee_id]["seen_at"] = now_iso()
            found = get_summary(employee)
        return found

    @api.post("/employees/{employee_id}/training/confirm")
    def confirm(employee_id: str, body: TrainingConfirm) -> dict:
        store = get_store()
        employee = get_employee(employee_id)
        found = get_summary(employee)
        if not found["suggestion"]:
            raise HTTPException(status_code=409, detail="Owl has no suggestion yet: the training is still going on.")
        if not found["seen_at"]:
            raise HTTPException(status_code=409, detail=f"{employee.name} has not seen the result on the glasses yet.")
        with store.lock:
            entry = store.trainings[employee_id]
            entry["confirmed"] = {"result": body.result, "by": body.by, "at": now_iso(), "note": body.note}
            if body.result == "more_practice":
                # Not a fail: training goes on, and the worker sees the next suggestion first again.
                behind = max(0, (today() - date.fromisoformat(found["ends"])).days)
                entry["extra_days"] = entry.get("extra_days", 0) + behind + body.extend_days
                entry["seen_at"] = None
            entry.pop("demo", None)
        return get_summary(employee)

    return api
