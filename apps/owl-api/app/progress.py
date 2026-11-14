"""Learning progress (JUN-73): the worker sees their own, the company sees only anonymous totals.

Owl is a learning aid, not monitoring (the EU AI Act treats AI that monitors workers as high-risk). So:
- GET /employees/{id}/progress is for the worker's own glasses, never shown in Owl Studio.
- GET /stats has no names and no ids: totals for the pilot ("time until working alone, errors Owl caught").
Runs live in memory, like help sessions; a restart starts from zero.
"""

import statistics
import threading
from dataclasses import dataclass, field
from datetime import datetime

from .models import CheckResult, Process, Step
from .store import TIMEZONE


@dataclass
class Run:
    run_id: str
    employee_id: str | None
    process_id: str
    title: str
    last_step_id: str
    started_at: datetime
    finished_at: datetime | None = None
    steps_done: set[str] = field(default_factory=set)
    problems_caught: int = 0
    problems_fixed: int = 0
    open_problems: set[str] = field(default_factory=set)  # steps with a spoken warning not yet fixed

    @property
    def seconds(self) -> int | None:
        return round((self.finished_at - self.started_at).total_seconds()) if self.finished_at else None

    def to_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "process_id": self.process_id,
            "title": self.title,
            "started_at": self.started_at.isoformat(timespec="seconds"),
            "finished_at": self.finished_at.isoformat(timespec="seconds") if self.finished_at else None,
            "seconds": self.seconds,
            "steps_done": len(self.steps_done),
            "problems_caught": self.problems_caught,
            "problems_fixed": self.problems_fixed,
        }


class Progress:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.runs: dict[str, Run] = {}

    def record(self, run_id: str, employee_id: str | None, process: Process, step: Step, result: CheckResult, now: datetime | None = None) -> None:
        """Called after every /check answer."""
        now = now or datetime.now(TIMEZONE)
        with self._lock:
            run = self.runs.get(run_id)
            if run is None:
                last = max(process.steps, key=lambda s: s.index).id if process.steps else step.id
                run = self.runs[run_id] = Run(run_id, employee_id or None, process.id, process.title, last, now)
            run.employee_id = run.employee_id or employee_id or None
            if result.status == "warning" and result.say and step.id not in run.open_problems:
                run.problems_caught += 1  # counted once per spoken warning, not per frame
                run.open_problems.add(step.id)
            if result.status == "ok" and step.id in run.open_problems:
                run.problems_fixed += 1
                run.open_problems.discard(step.id)
            if result.step_done:
                run.steps_done.add(step.id)
                if step.id == run.last_step_id and run.finished_at is None:
                    run.finished_at = now

    def forget(self, employee_id: str) -> int:
        """Erases every run of this worker. Returns how many were erased."""
        with self._lock:
            mine = [k for k, r in self.runs.items() if r.employee_id == employee_id]
            for k in mine:
                del self.runs[k]
            return len(mine)

    def for_employee(self, employee_id: str) -> dict:
        with self._lock:
            runs = sorted((r for r in self.runs.values() if r.employee_id == employee_id), key=lambda r: r.started_at, reverse=True)
            finished = [r for r in runs if r.finished_at]
            faster = None
            if finished:
                latest = finished[0]
                same = [r for r in finished if r.process_id == latest.process_id]
                if len(same) > 1:
                    faster = latest.seconds < same[-1].seconds  # same[-1] is the first finished run of that task
            return {
                "employee_id": employee_id,
                "tasks_done": len(finished),
                "steps_done": sum(len(r.steps_done) for r in runs),
                "problems_caught": sum(r.problems_caught for r in runs),
                "problems_fixed": sum(r.problems_fixed for r in runs),
                "runs": [r.to_dict() for r in runs],
                "faster_than_first": faster,
            }

    def stats(self) -> dict:
        """Anonymous totals. No names, no ids, nothing about one person."""
        with self._lock:
            runs = list(self.runs.values())
            first_finished: dict[str, int] = {}
            for r in sorted((r for r in runs if r.finished_at and r.employee_id), key=lambda r: r.started_at):
                first_finished.setdefault(r.employee_id, r.seconds)
            return {
                "runs": len(runs),
                "tasks_finished": sum(1 for r in runs if r.finished_at),
                "workers": len({r.employee_id for r in runs if r.employee_id}),
                "median_seconds_to_first_finished_task": round(statistics.median(first_finished.values())) if first_finished else None,
                "problems_caught": sum(r.problems_caught for r in runs),
                "problems_fixed": sum(r.problems_fixed for r in runs),
            }
