"""The Junction volunteer story for the demo video (JUN-102, JUN-105), without demo mode.

`OWL_STORY=junction` turns this server into the Junction 2026 volunteer crew: Sami (crew lead, the expert), Jose (a new
volunteer in training, Owl's lines in English and his welcome in Spanish), Mika (the shift manager on shift), the volunteer handbook, the recycling round and the venue's
areas. The other demo companies are removed, so Studio shows only Junction.

Only the data changes: vision, the rules, Hint and Help are the real engine, unlike `OWL_DEMO=1`, which scripts what
the camera sees. The story is seeded once: what Studio changes afterwards (Sami's recorded task, a place photo,
the training) is kept across restarts. `OWL_RESET=1` seeds it again from scratch.
"""

import json
from datetime import date

from .models import Employee, Process, TrainingPlan, Zone
from .store import FIXTURES, Store, now_iso
from .training import today as training_today

STORY_DIR = FIXTURES / "stories"


def _load(name: str) -> dict:
    return json.loads((STORY_DIR / name / "story.json").read_text(encoding="utf-8"))


def _employee(data: dict) -> Employee:
    # A field the model does not know yet (welcome_language comes with JUN-108) is left out, not an error.
    return Employee.model_validate({k: v for k, v in data.items() if k in Employee.model_fields})


def apply(store: Store, name: str = "junction", today: date | None = None) -> None:
    folder = STORY_DIR / name
    story = _load(name)
    company = story["company"]
    with store.lock:
        # The handbook lives with the story, not in fixtures/docs, so other demos never answer from it.
        for path in sorted(folder.glob("*.md")):
            if f"doc-{path.stem}" not in store.docs:
                store._add_doc(path.name, path.read_text(encoding="utf-8"), path.stat().st_mtime)
        for path in sorted(folder.glob("process-*.json")):
            process = Process.model_validate_json(path.read_text(encoding="utf-8"))
            store.processes.setdefault(process.id, process)
        seeded = story["employees"][0]["id"]  # the volunteer in training: the story's first person
        if seeded in store.employees and store.employees[seeded].company == company:
            return  # seeded on an earlier start; keep what Studio changed since

        # Only the story's people, and only Junction's tasks, plans and documents. A cast from an older version of
        # the story (Laura and Sami as the volunteer, before JUN-102 changed it) goes too.
        ours = {e["id"] for e in story["employees"]}
        for employee_id in [k for k in store.employees if k not in ours]:
            del store.employees[employee_id]
            store.consents.pop(employee_id, None)
        for process_id in [k for k, p in store.processes.items() if p.company != company]:
            del store.processes[process_id]
            store.drop_translations(process_id)
        for doc_id in [k for k, (doc, _) in store.docs.items() if doc.title.split(":")[0].strip() != company]:
            del store.docs[doc_id]
        store.trainings.clear()
        store.on_shift.clear()

        for data in story["employees"]:
            employee = _employee(data)
            store.employees[employee.id] = employee
            store.custom_welcomes.add(employee.id)  # the story's welcome stays as written
        for employee_id, consent in story.get("consents", {}).items():
            store.consents[employee_id] = {**consent, "at": now_iso()}
        plan = TrainingPlan.model_validate(story["plan"])
        store.training_plans = {plan.id: plan}
        starts = (today or training_today()).isoformat()
        for employee_id, plan_id in story.get("trainings", {}).items():
            store.trainings[employee_id] = {"starts": starts, "plan_id": plan_id, "extra_days": 0, "seen_at": None, "confirmed": None}
        store.on_shift[company] = story["on_shift"]
        store.zones = {z.id: z for z in (Zone.model_validate(z) for z in story["zones"])}
        store.assist_sign = story["sign"]
