"""Demo mode (JUN-69, OWL_DEMO=1): the demo story plays on the real glasses without any model.

Only the camera's eyes are scripted. A scripted Observation replaces the vision call, and everything after it is the
real engine: the rules, the two-frames rule, the Done pinch, speech. Every result says decided_by "demo".
"""

import json
import threading
import time

from .models import Step
from .store import FIXTURES
from .vision import CriterionSeen, Observation, SeenItem, line_id

SCRIPT_FILE = FIXTURES / "demo-script.json"


class Demo:
    def __init__(self, script: dict | None = None) -> None:
        self.script = script if script is not None else json.loads(SCRIPT_FILE.read_text(encoding="utf-8"))
        self._lock = threading.Lock()
        self._started: dict[tuple[str, str], float] = {}  # (run_id, step key) -> first frame time

    def observe(self, process_id: str, step: Step, run_id: str, now: float | None = None) -> Observation:
        """What the camera "sees" now, in this run, for this step."""
        now = time.monotonic() if now is None else now
        key = f"{process_id}:{step.id}"
        with self._lock:
            started = self._started.setdefault((run_id, key), now)
        elapsed = now - started
        for phase in self.script.get("steps", {}).get(key, []):
            if "until_seconds" not in phase or elapsed < phase["until_seconds"]:
                return _observation(step, phase["observation"])
        return right(step)


def _observation(step: Step, data: dict) -> Observation:
    obs = right(step)
    return obs.model_copy(
        update={
            "visibility": data.get("visibility", obs.visibility),
            "summary": data.get("summary", obs.summary),
            "hint": data.get("hint"),
            "items": [SeenItem(**i) for i in data["items"]] if "items" in data else obs.items,
            "criteria": [CriterionSeen(**c) for c in data["criteria"]] if "criteria" in data else obs.criteria,
        }
    )


def right(step: Step) -> Observation:
    """The step done exactly right: every order line in its quantity, every criterion met."""
    items = [SeenItem(line=line_id(i, ol.sku), description=ol.name, qty=ol.qty) for i, ol in enumerate(step.check.order_lines or [])]
    criteria = [CriterionSeen(index=n, criterion=c, met="yes", note="demo") for n, c in enumerate(step.check.criteria, start=1)]
    return Observation(
        visibility="clear",
        hint=None,
        items=items if step.check.kind == "order" else [],
        criteria=criteria if step.check.kind == "visual" else [],
        matches_reference="yes",
        summary="The step looks done.",
    )
