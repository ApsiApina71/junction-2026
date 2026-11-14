"""Stage view (JUN-79): the audience sees what the worker sees and what Owl decides.

The glasses post their state (screen, spoken line, step) and at most one camera frame a second; owl-api adds its own
check decisions and answers. Everything is in memory and overwritten: no frame is stored.
"""

import threading
import time
from collections import deque
from datetime import datetime

from pydantic import BaseModel, Field

from .store import TIMEZONE

MAX_EVENTS = 60


class StageScreen(BaseModel):
    kind: str = Field(default="", max_length=40)
    title: str = Field(default="", max_length=200)
    text: str = Field(default="", max_length=600)


class StageStep(BaseModel):
    process_id: str
    step_id: str
    index: int
    total: int


class StageUpdate(BaseModel):
    glasses_id: str = Field(min_length=1, max_length=40)
    employee_id: str | None = None
    language: str | None = Field(default=None, max_length=20)
    screen: StageScreen | None = None
    said: str | None = Field(default=None, max_length=600)
    step: StageStep | None = None


class Stage:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.version = 0
        self.glasses: dict[str, dict] = {}
        self.frames: dict[str, tuple[bytes, float]] = {}

    def _bump(self) -> None:
        self.version += 1

    def _entry(self, glasses_id: str) -> dict:
        return self.glasses.setdefault(
            glasses_id,
            {"glasses_id": glasses_id, "employee": None, "language": None, "screen": None, "step": None, "events": deque(maxlen=MAX_EVENTS), "updated": 0.0},
        )

    def update(self, body: StageUpdate, employee: dict | None) -> None:
        with self._lock:
            e = self._entry(body.glasses_id)
            if body.employee_id:
                e["employee_id"] = body.employee_id
            if employee:
                e["employee"] = employee
            if body.language:
                e["language"] = body.language
            if body.screen:
                e["screen"] = body.screen.model_dump()
            if body.step:
                e["step"] = body.step.model_dump()
            if body.said:
                e["events"].append({"at": _now(), "kind": "said", "text": body.said})
            e["updated"] = time.time()
            self._bump()

    def event(self, glasses_id: str, kind: str, employee_id: str | None = None, **data) -> None:
        """Owl's own decisions: a check result or an answer, shown on the timeline."""
        with self._lock:
            e = self._entry(glasses_id)
            if employee_id:
                e["employee_id"] = employee_id
            if kind == "check":
                # A step that keeps looking the same is one line, not one per frame.
                key = (data.get("step"), data.get("status"), data.get("step_done"))
                if key == e.get("last_check") and not data.get("spoken"):
                    return
                e["last_check"] = key
            e["events"].append({"at": _now(), "kind": kind, **data})
            e["updated"] = time.time()
            self._bump()

    def frame(self, glasses_id: str, jpeg: bytes) -> None:
        with self._lock:
            self.frames[glasses_id] = (jpeg, time.time())
            self._entry(glasses_id)["frame_at"] = time.time()
            self._bump()

    def latest_frame(self, glasses_id: str) -> bytes | None:
        with self._lock:
            found = self.frames.get(glasses_id)
            return found[0] if found and time.time() - found[1] < 30 else None

    def snapshot(self, glasses_id: str | None) -> dict:
        """The glasses asked for, or the one updated most recently."""
        with self._lock:
            if not self.glasses:
                return {"version": self.version, "glasses": None, "available": []}
            key = glasses_id if glasses_id in self.glasses else max(self.glasses, key=lambda k: self.glasses[k]["updated"])
            e = self.glasses[key]
            return {
                "version": self.version,
                "available": sorted(self.glasses),
                "glasses": {
                    **{k: v for k, v in e.items() if k not in ("events", "last_check")},
                    "events": list(e["events"])[::-1],
                    "has_frame": key in self.frames,
                },
            }


def _now() -> str:
    return datetime.now(TIMEZONE).strftime("%H:%M:%S")
