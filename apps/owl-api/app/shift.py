"""The manager on shift answers Help on their own glasses (JUN-100).

A worker who is stuck calls the manager on shift. The call rings on the manager's glasses; after Accept the manager
sees the worker's live view, refreshed about once a second, and talks them through it. If nobody answers in
RING_SECONDS, or the manager picks Later, the request goes to the Studio Help console.

Only the manager on shift at the worker's company gets the call, not every manager. The live view is the Help
session's latest frame: kept only while the session is open and deleted when it ends, never recorded.
"""

import os
from collections.abc import Callable
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException

from .models import Employee, HelpSession, ShiftSet
from .store import TIMEZONE, Store, now_iso

RING_SECONDS = float(os.getenv("HELP_RING_SECONDS", "30"))


def manager_for(store: Store, worker: Employee | None) -> Employee | None:
    """The manager on shift at the worker's company, never the worker themselves."""
    if worker is None:
        return None
    found = store.employees.get(store.on_shift.get(worker.company, ""))
    if found is None or not found.shift_manager or found.id == worker.id:
        return None
    return found


def ring(session: HelpSession, manager: Employee) -> None:
    session.routed, session.status = "manager", "ringing"
    session.assignee, session.assignee_name = manager.id, manager.name
    session.answers_on = manager.answers_on
    session.rang_at = now_iso()
    session.fallback = None


def to_studio(session: HelpSession, why: str) -> None:
    """The call goes to the Studio console. assignee_name stays, so the worker hears who did not answer."""
    session.routed, session.status = "studio", "waiting"
    session.assignee = None
    session.fallback = why  # type: ignore[assignment]
    session.updated_at = now_iso()


def settle(session: HelpSession, now: datetime | None = None) -> HelpSession:
    """A call that rang RING_SECONDS without an answer goes to Studio. Checked on every read.

    A manager who answers on the phone (JUN-107) has no time limit: the call rings in the console until they answer
    or say Later."""
    if session.status == "ringing" and session.rang_at and session.answers_on != "phone":
        now = now or datetime.now(TIMEZONE)
        if (now - datetime.fromisoformat(session.rang_at)).total_seconds() >= RING_SECONDS:
            to_studio(session, "no_answer")
    return session


def router(get_store: Callable[[], Store], auth: Any) -> APIRouter:
    api = APIRouter(dependencies=[auth])

    @api.get("/shift")
    def on_shift() -> dict:
        store = get_store()
        rows = []
        for company, employee_id in sorted(store.on_shift.items()):
            found = store.employees.get(employee_id)
            if found:
                rows.append({"company": company, "employee_id": found.id, "name": found.name})
        return {"on_shift": rows}

    @api.put("/shift")
    def set_shift(body: ShiftSet) -> dict:
        store = get_store()
        with store.lock:
            if body.employee_id is None:
                store.on_shift.pop(body.company, None)
            else:
                found = store.employees.get(body.employee_id)
                if found is None:
                    raise HTTPException(status_code=404, detail=f"No employee {body.employee_id}.")
                if not found.shift_manager:
                    raise HTTPException(status_code=422, detail=f"{found.name} is not a shift manager. Mark them as one first.")
                store.on_shift[body.company] = found.id
        return on_shift()

    @api.get("/shift/manager")
    def manager(employee_id: str) -> dict:
        """Who the worker's glasses would call. 404: no one is on shift, Help goes to Studio."""
        store = get_store()
        worker = store.employees.get(employee_id)
        if worker is None:
            raise HTTPException(status_code=404, detail=f"No employee {employee_id}.")
        found = manager_for(store, worker)
        if found is None:
            raise HTTPException(status_code=404, detail="No shift manager on shift.")
        return {"employee_id": found.id, "name": found.name}

    return api
