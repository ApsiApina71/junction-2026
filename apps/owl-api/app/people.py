"""Employees and the glasses they wear (JUN-41).

The employer adds a new worker in Owl Studio and assigns them a pair of glasses. On "Hey Meta, start Owl" the
glasses app asks who wears this pair and opens that worker's personal welcome, in their language.
"""

import re
import unicodedata
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from .models import Employee, EmployeeCreate, EmployeeUpdate
from .store import Store, lang_key

# The welcome is spoken on the glasses, so it stays short. Other languages fall back to English.
WELCOME = {
    "en": {
        "hello": "Welcome to {company}, {name}!",
        "hello_plain": "Welcome, {name}!",
        "task": "Today's task: {task}.",
        "owl": "I'm Owl. I'll show you each step.",
    },
    "fi": {
        "hello": "Tervetuloa, {name}! Olet nyt osa yritystä {company}.",
        "hello_plain": "Tervetuloa, {name}!",
        "task": "Tämän päivän tehtävä: {task}.",
        "owl": "Olen Owl ja näytän sinulle jokaisen vaiheen.",
    },
}


def write_welcome(store: Store, name: str, language: str, company: str, process_ids: list[str]) -> str:
    """The personal welcome from the template: the name, the company and the first task, in the employee's language."""
    t = WELCOME.get(lang_key(language), WELCOME["en"])
    parts = [(t["hello"] if company else t["hello_plain"]).format(name=name, company=company)]
    first = store.processes.get(process_ids[0]) if process_ids else None
    if first:
        parts.append(t["task"].format(task=store.translated(first, language).title.rstrip(".")))
    parts.append(t["owl"])
    return " ".join(parts)


def _slug(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")


def _new_id(store: Store, name: str) -> str:
    slug = _slug(name)
    if not slug:  # a name with no Latin letters
        return store.next_id("emp")
    candidate, n = f"emp-{slug}", 1
    while candidate in store.employees:
        n += 1
        candidate = f"emp-{slug}-{n}"
    return candidate


def _company(store: Store, process_ids: list[str] | None = None) -> str:
    """The company of the worker's first task; without a task, the company this server runs for."""
    return next((store.processes[p].company for p in process_ids or [] if p in store.processes and store.processes[p].company), store.company())


def _check_processes(store: Store, process_ids: list[str]) -> None:
    unknown = [p for p in process_ids if p not in store.processes]
    if unknown:
        raise HTTPException(status_code=422, detail=f"No process {', '.join(unknown)}.")


def _wear(store: Store, employee_id: str, glasses_id: str | None) -> None:
    """A pair of glasses has one worker at a time: giving it to someone takes it from whoever had it."""
    if glasses_id is None:
        return
    for other in store.employees.values():
        if other.id != employee_id and other.glasses_id == glasses_id:
            other.glasses_id = None


def router(get_store: Callable[[], Store], auth: Any, out: Callable[[Request, Any], Any]) -> APIRouter:
    """The employee and glasses endpoints. main.py passes its store, token check and URL helper in."""
    api = APIRouter(dependencies=[auth])

    def get_employee(employee_id: str) -> Employee:
        found = get_store().employees.get(employee_id)
        if found is None:
            raise HTTPException(status_code=404, detail=f"No employee {employee_id}.")
        return found

    @api.get("/employees")
    def employees(request: Request) -> dict:
        return {"employees": [out(request, e) for e in get_store().employees.values()]}

    @api.post("/employees", response_model=Employee)
    def add_employee(body: EmployeeCreate, request: Request):
        store = get_store()
        _check_processes(store, body.process_ids)
        company = _company(store, body.process_ids)
        with store.lock:
            employee = Employee(
                id=_new_id(store, body.name),
                name=body.name,
                language=body.language,
                role=body.role,
                company=company,
                welcome=body.welcome or write_welcome(store, body.name, body.welcome_language or body.language, company, body.process_ids),
                process_ids=body.process_ids,
                glasses_id=body.glasses_id,
                access=body.access,
                shift_manager=body.shift_manager,
                welcome_language=body.welcome_language,
                answers_on=body.answers_on,
            )
            if body.welcome:
                store.custom_welcomes.add(employee.id)
            _wear(store, employee.id, employee.glasses_id)
            store.employees[employee.id] = employee
        return out(request, employee)

    @api.put("/employees/{employee_id}", response_model=Employee)
    def update_employee(employee_id: str, body: EmployeeUpdate, request: Request):
        store = get_store()
        employee = get_employee(employee_id)
        sent = body.model_fields_set
        if "process_ids" in sent and body.process_ids is not None:
            _check_processes(store, body.process_ids)
        with store.lock:
            before = (employee.name, employee.language, employee.process_ids, employee.welcome_language)
            for field in ("name", "language", "role", "process_ids"):
                value = getattr(body, field)
                if field in sent and value is not None:
                    setattr(employee, field, value)
            if "answers_on" in sent and body.answers_on is not None:
                employee.answers_on = body.answers_on
            if "welcome_language" in sent:  # null: the welcome follows the employee's language again
                employee.welcome_language = body.welcome_language
            if "access" in sent and body.access is not None:
                employee.access = body.access
            if "shift_manager" in sent and body.shift_manager is not None:
                employee.shift_manager = body.shift_manager
                if not employee.shift_manager:  # no longer a manager: no longer on shift
                    for company in [c for c, e in store.on_shift.items() if e == employee.id]:
                        del store.on_shift[company]
            if "glasses_id" in sent:  # null takes the glasses away
                employee.glasses_id = body.glasses_id
                _wear(store, employee.id, employee.glasses_id)
            rewrite = False
            if "welcome" in sent and body.welcome:
                employee.welcome = body.welcome
                store.custom_welcomes.add(employee.id)
            elif "welcome" in sent:  # empty or null: back to the template
                store.custom_welcomes.discard(employee.id)
                rewrite = True
            elif employee.id not in store.custom_welcomes:
                # A welcome Owl wrote follows the name, the language and the first task. A hand-written one stays.
                rewrite = before != (employee.name, employee.language, employee.process_ids, employee.welcome_language)
            if rewrite:
                employee.welcome = write_welcome(store, employee.name, employee.welcome_language or employee.language, employee.company, employee.process_ids)
        return out(request, employee)

    @api.get("/glasses/{glasses_id}/employee", response_model=Employee)
    def glasses_employee(glasses_id: str, request: Request):
        for employee in get_store().employees.values():
            if employee.glasses_id == glasses_id:
                return out(request, employee)
        raise HTTPException(status_code=404, detail="These glasses are not assigned to anyone yet.")

    return api
