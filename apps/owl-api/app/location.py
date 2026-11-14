"""Location during training (JUN-97): Owl follows which area the worker is in, and a step unlocks at the right spot.

GPS does not work indoors, so the glasses read printed QR markers ("owl:zone:<zone>", "owl:cp:<process>:<step>").

Rules, enforced here:
- Only during the worker's training period (JUN-96), and only after they agreed (`Consent.location`).
- Today's history only, kept in memory: never written to disk, gone on restart, and dropped as soon as the training
  period is over.
- An unlock is used up when Owl verifies the step, so the next run of the task asks for the spot again.
"""

import io
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import segno
from fastapi import APIRouter, HTTPException

from . import training
from .models import Employee, LocationReport, StepRef, Unlock, Zone
from .store import TIMEZONE, Store

ZONE_PREFIX = "owl:zone:"
CHECKPOINT_PREFIX = "owl:cp:"


@dataclass
class Visit:
    zone_id: str
    entered_at: datetime
    left_at: datetime | None = None


@dataclass
class Whereabouts:
    visits: list[Visit] = field(default_factory=list)
    unlocked: set[tuple[str, str]] = field(default_factory=set)


class Locations:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.people: dict[str, Whereabouts] = {}

    def enter(self, employee_id: str, zone_id: str, now: datetime | None = None) -> None:
        now = now or datetime.now(TIMEZONE)
        with self._lock:
            w = self.people.setdefault(employee_id, Whereabouts())
            self._drop_old(w, now)
            current = w.visits[-1] if w.visits and w.visits[-1].left_at is None else None
            if current and current.zone_id == zone_id:
                return
            if current:
                current.left_at = now
            w.visits.append(Visit(zone_id, now))

    def unlock(self, employee_id: str, process_id: str, step_id: str) -> None:
        with self._lock:
            self.people.setdefault(employee_id, Whereabouts()).unlocked.add((process_id, step_id))

    def step_done(self, employee_id: str, process_id: str, step_id: str) -> None:
        """Owl verified the step: its unlock is used up."""
        with self._lock:
            w = self.people.get(employee_id)
            if w:
                w.unlocked.discard((process_id, step_id))

    def forget(self, employee_id: str) -> None:
        with self._lock:
            self.people.pop(employee_id, None)

    def get(self, employee_id: str, now: datetime | None = None) -> Whereabouts:
        now = now or datetime.now(TIMEZONE)
        with self._lock:
            w = self.people.get(employee_id) or Whereabouts()
            self._drop_old(w, now)
            return Whereabouts(list(w.visits), set(w.unlocked))

    @staticmethod
    def _drop_old(w: Whereabouts, now: datetime) -> None:
        """Only today's visits are kept."""
        w.visits[:] = [v for v in w.visits if v.left_at is None or v.entered_at.date() == now.date()]


def tracking(store: Store, employee_id: str) -> bool:
    return training.in_training(store, employee_id) and bool(store.consents.get(employee_id, {}).get("location"))


def view(store: Store, locations: Locations, employee_id: str) -> dict:
    if not tracking(store, employee_id):
        # Outside training or without consent nothing is kept: whatever there was goes now.
        locations.forget(employee_id)
        return {"employee_id": employee_id, "tracking": False, "zone": None, "entered_at": None, "history": [], "unlocked": []}
    w = locations.get(employee_id)
    current = w.visits[-1] if w.visits and w.visits[-1].left_at is None else None

    def zone(zone_id: str) -> dict:
        found = store.zones.get(zone_id)
        return {"id": zone_id, "name": found.name if found else zone_id}

    return {
        "employee_id": employee_id,
        "tracking": True,
        "zone": zone(current.zone_id) if current else None,
        "entered_at": current.entered_at.isoformat(timespec="seconds") if current else None,
        "history": [
            {
                "zone_id": v.zone_id,
                "name": zone(v.zone_id)["name"],
                "entered_at": v.entered_at.isoformat(timespec="seconds"),
                "left_at": v.left_at.isoformat(timespec="seconds") if v.left_at else None,
            }
            for v in w.visits
        ],
        "unlocked": [{"process_id": p, "step_id": s} for p, s in sorted(w.unlocked)],
    }


def qr_svg(payload: str) -> str:
    out = io.BytesIO()
    segno.make(payload, error="m").save(out, kind="svg", border=2, xmldecl=False, omitsize=True, dark="#000", light="#fff")
    return out.getvalue().decode()


def markers(store: Store) -> list[dict]:
    """Every marker to print: one per zone, one per step with a checkpoint."""
    found = [
        {"payload": f"{ZONE_PREFIX}{z.id}", "kind": "zone", "label": z.name, "zone_id": z.id, "process_id": None, "step_id": None} for z in store.zones.values()
    ]
    for process in store.processes.values():
        for step in sorted(process.steps, key=lambda s: s.index):
            if step.checkpoint:
                found.append(
                    {
                        "payload": f"{CHECKPOINT_PREFIX}{process.id}:{step.id}",
                        "kind": "checkpoint",
                        "label": step.checkpoint.label,
                        "zone_id": step.checkpoint.zone_id,
                        "process_id": process.id,
                        "step_id": step.id,
                        "step_title": step.title,
                        "task": process.title,
                    }
                )
    return [{**m, "svg": qr_svg(m["payload"])} for m in found]


def router(get_store: Callable[[], Store], get_locations: Callable[[], Locations], auth: Any) -> APIRouter:
    api = APIRouter(dependencies=[auth])

    def get_employee(employee_id: str) -> Employee:
        found = get_store().employees.get(employee_id)
        if found is None:
            raise HTTPException(status_code=404, detail=f"No employee {employee_id}.")
        return found

    def checkpoint_zone(process_id: str, step_id: str) -> str:
        process = get_store().processes.get(process_id)
        step = next((s for s in process.steps if s.id == step_id), None) if process else None
        if step is None or step.checkpoint is None:
            raise HTTPException(status_code=404, detail=f"No checkpoint {process_id}/{step_id}.")
        return step.checkpoint.zone_id

    @api.get("/zones")
    def zones() -> dict:
        return {"zones": [z.model_dump(mode="json") for z in get_store().zones.values()]}

    @api.put("/zones/{zone_id}", response_model=Zone)
    def save_zone(zone_id: str, body: Zone):
        if body.id != zone_id:
            raise HTTPException(status_code=422, detail="The zone id in the address and in the body differ.")
        store = get_store()
        with store.lock:
            store.zones[zone_id] = body
        return body

    @api.delete("/zones/{zone_id}", status_code=204)
    def delete_zone(zone_id: str):
        store = get_store()
        with store.lock:
            if store.zones.pop(zone_id, None) is None:
                raise HTTPException(status_code=404, detail=f"No zone {zone_id}.")

    @api.get("/markers")
    def print_markers() -> dict:
        return {"markers": markers(get_store())}

    @api.post("/location")
    def report(body: LocationReport) -> dict:
        store, locations = get_store(), get_locations()
        get_employee(body.employee_id)
        if not store.consents.get(body.employee_id, {}).get("location"):
            raise HTTPException(status_code=403, detail="consent_required")
        if not training.in_training(store, body.employee_id):
            raise HTTPException(status_code=409, detail="not_in_training")
        checkpoint = body.checkpoint
        zone_id = body.zone
        if body.marker:
            if body.marker.startswith(ZONE_PREFIX):
                zone_id = body.marker[len(ZONE_PREFIX) :]
            elif body.marker.startswith(CHECKPOINT_PREFIX) and body.marker.count(":") == 3:
                process_id, step_id = body.marker[len(CHECKPOINT_PREFIX) :].split(":")
                checkpoint = StepRef(process_id=process_id, step_id=step_id)
            else:
                raise HTTPException(status_code=404, detail="Not an Owl marker.")
        if checkpoint is not None:
            zone_id = checkpoint_zone(checkpoint.process_id, checkpoint.step_id)
        if not zone_id or zone_id not in store.zones:
            raise HTTPException(status_code=404, detail=f"No zone {zone_id or '(none)'}.")
        locations.enter(body.employee_id, zone_id)
        if checkpoint is not None:
            locations.unlock(body.employee_id, checkpoint.process_id, checkpoint.step_id)
        return view(store, locations, body.employee_id)

    @api.get("/employees/{employee_id}/location")
    def where(employee_id: str) -> dict:
        get_employee(employee_id)
        return view(get_store(), get_locations(), employee_id)

    @api.post("/employees/{employee_id}/unlock")
    def unlock(employee_id: str, body: Unlock) -> dict:
        """The marker is missing or damaged: the trainer or a Help call opens the step."""
        get_employee(employee_id)
        checkpoint_zone(body.process_id, body.step_id)
        get_locations().unlock(employee_id, body.process_id, body.step_id)
        return view(get_store(), get_locations(), employee_id)

    @api.get("/locations")
    def live_map() -> dict:
        """Studio's map: each trainee's current area. Only people in training who agreed to it."""
        store, locations = get_store(), get_locations()
        rows = []
        for employee in store.employees.values():
            if not tracking(store, employee.id):
                locations.forget(employee.id)  # training over or consent gone: the history goes too
                continue
            v = view(store, locations, employee.id)
            rows.append({"employee_id": employee.id, "name": employee.name, "zone": v["zone"], "entered_at": v["entered_at"]})
        return {"trainees": rows}

    return api
