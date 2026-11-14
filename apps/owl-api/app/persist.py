"""MVP reliability (JUN-78): owl-api keeps its state across restarts.

One JSON snapshot in DATA_DIR/state.json, written atomically after every change and loaded on start on top of the
fixtures. Help sessions and their frames are left out on purpose: they are deleted when a session ends (privacy).
"""

import json
import logging
import os
import threading
from datetime import datetime
from pathlib import Path

from .models import Employee, Process, Recording, TrainingPlan, Zone
from .progress import Progress, Run
from .store import Store

log = logging.getLogger("owl.persist")
STATE_FILE = "state.json"
VERSION = 1
_lock = threading.Lock()


def _run_to_state(run: Run) -> dict:
    return {
        "run_id": run.run_id,
        "employee_id": run.employee_id,
        "process_id": run.process_id,
        "title": run.title,
        "last_step_id": run.last_step_id,
        "started_at": run.started_at.isoformat(),
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "steps_done": sorted(run.steps_done),
        "problems_caught": run.problems_caught,
        "problems_fixed": run.problems_fixed,
        "open_problems": sorted(run.open_problems),
        "helped_steps": sorted(run.helped_steps),
    }


def _run_from_state(data: dict) -> Run:
    return Run(
        run_id=data["run_id"],
        employee_id=data["employee_id"],
        process_id=data["process_id"],
        title=data["title"],
        last_step_id=data["last_step_id"],
        started_at=datetime.fromisoformat(data["started_at"]),
        finished_at=datetime.fromisoformat(data["finished_at"]) if data["finished_at"] else None,
        steps_done=set(data["steps_done"]),
        problems_caught=data["problems_caught"],
        problems_fixed=data["problems_fixed"],
        open_problems=set(data["open_problems"]),
        helped_steps=set(data.get("helped_steps", [])),
    )


def snapshot(store: Store, progress: Progress) -> dict:
    with store.lock:
        state = {
            "version": VERSION,
            "counter": store._counter,
            "employees": [e.model_dump(mode="json") for e in store.employees.values()],
            "processes": [p.model_dump(mode="json") for p in store.processes.values()],
            "translations": [{"process_id": pid, "lang": lang, "process": p.model_dump(mode="json")} for (pid, lang), p in store.translations.items()],
            "recordings": [r.model_dump(mode="json") for r in store.recordings.values()],
            "custom_welcomes": sorted(store.custom_welcomes),
            "consents": store.consents,
            "training_plans": [p.model_dump(mode="json") for p in store.training_plans.values()],
            "trainings": store.trainings,
            "zones": [z.model_dump(mode="json") for z in store.zones.values()],
            "assist_sign": store.assist_sign,
        }
    with progress._lock:
        state["runs"] = [_run_to_state(r) for r in progress.runs.values()]
    return state


def save(store: Store, progress: Progress) -> None:
    """Writes the snapshot atomically: a crash mid-write never leaves a half file."""
    data = json.dumps(snapshot(store, progress), ensure_ascii=False, separators=(",", ":"))
    path = Path(store.data_dir) / STATE_FILE
    with _lock:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(data, encoding="utf-8")
        os.replace(tmp, path)


def load(store: Store, progress: Progress) -> bool:
    """Loads the snapshot on top of the fixtures. A missing file is a clean start; a broken one is logged and skipped."""
    path = Path(store.data_dir) / STATE_FILE
    if not path.is_file():
        return False
    try:
        state = json.loads(path.read_text(encoding="utf-8"))
        employees = [Employee.model_validate(e) for e in state.get("employees", [])]
        processes = [Process.model_validate(p) for p in state.get("processes", [])]
        translations = [(t["process_id"], t["lang"], Process.model_validate(t["process"])) for t in state.get("translations", [])]
        recordings = [Recording.model_validate(r) for r in state.get("recordings", [])]
        runs = [_run_from_state(r) for r in state.get("runs", [])]
        plans = [TrainingPlan.model_validate(p) for p in state.get("training_plans", [])]
        zones = [Zone.model_validate(z) for z in state.get("zones", [])]
    except (OSError, ValueError, KeyError, TypeError) as e:
        log.error("owl-api state in %s cannot be read, starting from the fixtures: %s", path, e)
        return False
    with store.lock:
        store.employees.update({e.id: e for e in employees})
        store.processes.update({p.id: p for p in processes})
        store.translations.update({(pid, lang): p for pid, lang, p in translations})
        store.recordings.update({r.id: r for r in recordings})
        store.custom_welcomes |= set(state.get("custom_welcomes", []))
        store.consents.update(state.get("consents", {}))
        if "training_plans" in state:  # Studio may have deleted a fixture plan
            store.training_plans = {p.id: p for p in plans}
        store.trainings.update(state.get("trainings", {}))
        if "zones" in state:
            store.zones = {z.id: z for z in zones}
        store.assist_sign = state.get("assist_sign", store.assist_sign)
        store._counter = max(store._counter, int(state.get("counter", 0)))
    with progress._lock:
        progress.runs.update({r.run_id: r for r in runs})
    log.info("owl-api state loaded from %s", path)
    return True
