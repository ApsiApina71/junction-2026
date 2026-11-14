"""Owl Check verifier (JUN-37): did the step go right? Warn if not.

Pipeline for one frame:
1. vision.observe turns the frame into an Observation (what is seen).
2. compare() decides deterministically from that observation: the order lines, or the visual criteria.
3. Jev (TypeSafe's decision model) answers the same question from the same observation with a probability.
   Owl acts on a problem only when Jev agrees above JEV_THRESHOLD. Without Jev, the rules decide alone.
4. The tracker warns only after the same problem is seen in two frames in a row, and a step is done only on a
   final check that comes out ok. A wrong order is never marked done: "ok" always needs the rules to say ok.
"""

import json
import logging
import os
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field

import httpx

from .models import CheckLine, CheckResult, Step
from .vision import OTHER, Observation, line_id

log = logging.getLogger("owl.verifier")

JEV_URL = os.getenv("JEV_URL", "https://openrouter.ai/api/alpha/decisions")
JEV_API_KEY = os.getenv("JEV_API_KEY", "")
JEV_MODEL = os.getenv("JEV_MODEL", "typesafe/jev-1.13")
# Jev's probabilities are overconfident out of the box (JUN-37); tune this on labelled frames.
JEV_THRESHOLD = float(os.getenv("JEV_THRESHOLD", "0.75"))
JEV_TIMEOUT = float(os.getenv("JEV_TIMEOUT", "2.5"))
CONFIRM_FRAMES = int(os.getenv("CONFIRM_FRAMES", "2"))
# The per-run budget of model calls (JUN-82): with next_check_ms the glasses send far fewer.
MAX_CHECKS_PER_MINUTE = int(os.getenv("MAX_CHECKS_PER_MINUTE", "40"))
RUN_TTL = 60 * 60  # Forget a run's state after an hour.

VERDICTS = ("ok", "wrong_item", "missing", "too_many", "not_matching", "unsure")
PROBLEM_ORDER = ("wrong_item", "missing", "too_many")


@dataclass
class Verdict:
    verdict: str  # one of VERDICTS
    lines: list[CheckLine] | None = None
    wrong: str | None = None  # what was seen instead, e.g. "Oat drink 0.5 l"
    line_name: str | None = None  # the order line the problem is about
    failed: str | None = None  # the first visual criterion that is not met


# 2. Rules


def compare(step: Step, obs: Observation) -> Verdict:
    """The deterministic decision from what vision saw. The fallback when Jev is not there."""
    if obs.visibility == "unclear":
        return Verdict("unsure")
    if step.check.kind == "order":
        return _compare_order(step, obs)
    if step.check.kind == "visual":
        return _compare_visual(step, obs)
    return Verdict("ok")


def _compare_order(step: Step, obs: Observation) -> Verdict:
    known = {line_id(idx, ol.sku) for idx, ol in enumerate(step.check.order_lines or [])}
    # Anything vision did not map to a line of this order counts as something else in the box (JUN-58).
    others = [i for i in obs.items if i.line not in known and i.qty > 0]
    other_text = ", ".join(f"{i.qty} × {i.description}" for i in others) or None
    lines: list[CheckLine] = []
    for idx, ol in enumerate(step.check.order_lines or []):
        seen = sum(i.qty for i in obs.items if i.line == line_id(idx, ol.sku))
        if seen == ol.qty:
            status = "ok"
        elif seen > ol.qty:
            status = "too_many"
        else:
            status = "wrong_item" if others else "missing"
        lines.append(CheckLine(name=ol.name, expected=ol.qty, seen=seen, status=status, note=other_text if status == "wrong_item" else None))

    for problem in PROBLEM_ORDER:
        first = next((line for line in lines if line.status == problem), None)
        if first:
            # A partly hidden box can look like a missing item; ask for a better view instead of warning.
            if problem == "missing" and obs.visibility != "clear":
                return Verdict("unsure", lines=lines)
            return Verdict(problem, lines=lines, wrong=others[0].description if others else None, line_name=first.name)
    if others:  # every line is right, but something extra is in the box
        return Verdict("too_many", lines=lines, wrong=others[0].description, line_name=None)
    if obs.visibility != "clear":
        return Verdict("unsure", lines=lines)
    return Verdict("ok", lines=lines)


def _norm(text: str) -> str:
    return " ".join(text.lower().replace(".", " ").split())


def criteria_answers(step: Step, obs: Observation) -> list[str | None]:
    """The answer to each criterion of the step, in its order: yes, no, unclear, or None when it was not answered.

    An answer counts for a criterion only by its number or its exact text, so one answer repeated cannot cover the
    others (JUN-58). Conflicting answers to one criterion: no beats unclear beats yes.
    """
    wanted = [_norm(c) for c in step.check.criteria]
    answers: list[str | None] = [None] * len(wanted)
    rank = {"yes": 0, "unclear": 1, "no": 2}
    for c in obs.criteria:
        slot = c.index - 1 if 1 <= c.index <= len(wanted) and _norm(c.criterion) in ("", wanted[c.index - 1]) else None
        if slot is None and _norm(c.criterion) in wanted:
            slot = wanted.index(_norm(c.criterion))
        if slot is not None and (answers[slot] is None or rank[c.met] > rank[answers[slot]]):
            answers[slot] = c.met
    return answers


def _compare_visual(step: Step, obs: Observation) -> Verdict:
    """The step's criteria decide. The expert's photo is context for vision and never decides on its own."""
    answers = criteria_answers(step, obs)
    if "no" in answers:
        return Verdict("not_matching", failed=step.check.criteria[answers.index("no")])
    if not answers or obs.visibility != "clear" or any(a != "yes" for a in answers):
        return Verdict("unsure")  # a criterion that was not seen is not passed
    return Verdict("ok")


# 3. Jev


def jev_state(step: Step, obs: Observation) -> dict:
    state: dict = {"step": step.title, "instruction": step.instruction, "check": step.check.kind, "camera_view": obs.visibility, "seen": obs.summary}
    if step.check.kind == "order":
        state["order"] = [{"product": ol.name, "qty": ol.qty} for ol in step.check.order_lines or []]
        state["in_the_box"] = [
            {"product": i.description, "qty": i.qty, "is_order_line": None if i.line == OTHER else _line_name(step, i.line)} for i in obs.items
        ]
    else:
        answers = criteria_answers(step, obs)
        state["criteria"] = [{"criterion": c, "met": a or "not answered"} for c, a in zip(step.check.criteria, answers, strict=True)]
    return state


def _line_name(step: Step, lid: str) -> str | None:
    for idx, ol in enumerate(step.check.order_lines or []):
        if line_id(idx, ol.sku) == lid:
            return ol.name
    return None


def jev_question(step: Step) -> dict:
    if step.check.kind == "order":
        criteria = {
            "ok": "Exactly the ordered products, in the ordered quantities, and nothing else.",
            "wrong_item": "A product in the box is a different product or size than the order line it should be.",
            "missing": "An ordered product is not in the box, or there are fewer than ordered.",
            "too_many": "There are more of a product than ordered, or a product that is not on the order.",
            "unsure": "The camera view does not show enough to decide.",
        }
    else:
        criteria = {
            "ok": "Every criterion of the step is met.",
            "not_matching": "At least one criterion is clearly not met.",
            "unsure": "The camera view does not show enough to decide.",
        }
    return {"type": "choice", "instructions": "Did the new worker do this work step right, judging only from what was seen?", "criteria": criteria}


@dataclass
class JevAnswer:
    verdict: str
    probability: float


def ask_jev(step: Step, obs: Observation) -> JevAnswer | None:
    """Jev's verdict, or None when Jev is not configured or fails. The demo never depends on Jev."""
    if not JEV_API_KEY:
        return None
    try:
        r = httpx.post(
            JEV_URL,
            headers={"Authorization": f"Bearer {JEV_API_KEY}"},
            json={"model": JEV_MODEL, "state": jev_state(step, obs), "questions": {"verdict": jev_question(step)}},
            timeout=JEV_TIMEOUT,
        )
        r.raise_for_status()
        answer = r.json()["answers"]["verdict"]
        if answer.get("type") != "choice" or answer.get("choice") not in VERDICTS:
            return None
        probability = float(answer.get("probabilities", {}).get(answer["choice"], answer.get("confidence", 0.0)))
        return JevAnswer(answer["choice"], probability)
    except (httpx.HTTPError, KeyError, TypeError, ValueError, json.JSONDecodeError) as e:
        log.warning("Jev failed, using the rules alone: %s", e)
        return None


def decide(rules: Verdict, jev: JevAnswer | None) -> tuple[Verdict, float | None, str]:
    """Combines the rules and Jev. Returns the verdict, Jev's probability (None without Jev) and who decided it.

    Jev is a second opinion on the decision from the same observation: it cannot catch an item that vision missed or
    misread, and its probability is what Jev reports, not a calibrated chance that the box is right.
    """
    if jev is None:
        return rules, None, "rules"
    if jev.verdict == rules.verdict and jev.probability >= JEV_THRESHOLD:
        return rules, jev.probability, "jev"
    # Jev disagrees or is not sure enough: never warn and never pass on a doubtful frame; look again.
    return Verdict("unsure", lines=rules.lines), jev.probability, "jev"


# 4. Speech and the per-run tracker

TEXTS = {
    "en": {
        "ok_order": ("All {n} order lines are in the box.", "All good. Everything on the order is in the box."),
        "ok_visual": ("Looks right.", "Looks right."),
        "ok_final": ("Step done.", "Well done. Step done."),
        "wrong_item": ("Wrong item: {wrong}. The order says {line}.", "Wrong item: {wrong}. The order says {line}."),
        "missing": ("Missing: {line}.", "Something is missing: {line}."),
        "too_many": ("Too many: {what}.", "Too many in the box: {what}."),
        "not_matching": ("Not like the expert's photo: {failed}.", "Check again: {failed}."),
        "unsure": ("I can't see it well.", "I can't see it well. {hint}."),
        "checking": ("Checking...", None),
    },
    "fi": {
        "ok_order": ("Kaikki {n} tilausriviä ovat laatikossa.", "Hyvä. Kaikki tilauksen tuotteet ovat laatikossa."),
        "ok_visual": ("Näyttää oikealta.", "Näyttää oikealta."),
        "ok_final": ("Vaihe valmis.", "Hienoa. Vaihe valmis."),
        "wrong_item": ("Väärä tuote: {wrong}. Tilauksessa: {line}.", "Väärä tuote: {wrong}. Tilauksessa on {line}."),
        "missing": ("Puuttuu: {line}.", "Jotain puuttuu: {line}."),
        "too_many": ("Liikaa: {what}.", "Laatikossa on liikaa: {what}."),
        "not_matching": ("Ei kuin mallikuvassa: {failed}.", "Tarkista vielä: {failed}."),
        "unsure": ("En näe kunnolla.", "En näe kunnolla. {hint}."),
        "checking": ("Tarkistan...", None),
    },
}


# Easy language (JUN-81): one idea per sentence, everyday words, no clauses. Selected with a "-x-easy" language tag.
TEXTS["en-easy"] = {
    **TEXTS["en"],
    "ok_order": ("Everything is in the box.", "Good. Everything is in the box."),
    "ok_visual": ("Good.", "Good."),
    "ok_final": ("Done.", "Good job. This step is done."),
    "wrong_item": ("Wrong: {wrong}. Take: {line}.", "Wrong one. This is {wrong}. Take {line}."),
    "missing": ("Missing: {line}.", "Something is missing. Add {line}."),
    "too_many": ("Too many: {what}.", "Too many. Take out {what}."),
    "not_matching": ("Not ready: {failed}.", "Not ready yet. Look again: {failed}."),
    "unsure": ("I can't see.", "I can't see well. {hint}."),
}
TEXTS["fi-easy"] = {
    **TEXTS["fi"],
    "ok_order": ("Kaikki on laatikossa.", "Hyvä. Kaikki on laatikossa."),
    "ok_visual": ("Hyvä.", "Hyvä."),
    "ok_final": ("Valmis.", "Hyvää työtä. Tämä vaihe on valmis."),
    "wrong_item": ("Väärä: {wrong}. Ota: {line}.", "Väärä tuote. Tämä on {wrong}. Ota {line}."),
    "missing": ("Puuttuu: {line}.", "Jotain puuttuu. Lisää {line}."),
    "too_many": ("Liikaa: {what}.", "Liikaa. Ota pois {what}."),
    "not_matching": ("Ei vielä valmis: {failed}.", "Ei vielä valmis. Katso uudelleen: {failed}."),
    "unsure": ("En näe.", "En näe hyvin. {hint}."),
}


def easy(language: str) -> str:
    """The easy-language form of a language tag: "fi" -> "fi-x-easy"."""
    return language if "-x-easy" in language.lower() else f"{language}-x-easy"


def _texts(language: str) -> dict:
    base = language.split("-")[0].lower()
    table = TEXTS.get(base, TEXTS["en"])
    if "-x-easy" in language.lower():
        return TEXTS.get(f"{base}-easy", TEXTS["en-easy"]) if base in TEXTS else TEXTS["en-easy"]
    return table


def build_result(
    step: Step,
    verdict: Verdict,
    confidence: float | None,
    decided_by: str,
    status: str,
    final: bool,
    language: str,
    hint: str | None,
    first_ok: bool = True,
    new_warning: bool = True,
) -> CheckResult:
    t = _texts(language)
    v = verdict.verdict
    hint = hint or ("Move closer" if language.startswith("en") else "Tule lähemmäs")
    key = {"ok": "ok_final" if final else ("ok_order" if step.check.kind == "order" else "ok_visual"), "checking": "checking"}.get(status, v)
    if status == "unsure":
        key = "unsure"
    text, say = t[key]
    values = {
        "n": len(step.check.order_lines or []),
        "wrong": verdict.wrong or "?",
        "line": verdict.line_name or "?",
        "what": verdict.wrong or verdict.line_name or "?",
        "failed": (verdict.failed or (step.check.criteria[0] if step.check.criteria else "?")).rstrip(".").lower(),
        "hint": hint.rstrip("."),
    }
    say = say.format(**values) if say else None
    own = step.check.warning.strip() if step.check.warning else ""
    if status == "warning" and v == "not_matching" and own:
        # JUN-106: the expert's own sentence, shown and spoken as it is ("That's a deposit bottle. It goes to the
        # return crate."), instead of "Check again: <criterion>".
        text, say = own.replace("{", "{{").replace("}", "}}"), own
    if status == "unsure" and not final:
        say = None  # stay quiet while the worker is still working; speak the hint only on the Done pinch
    if status == "ok" and not final and not first_ok:
        say = None  # say "all good" once per step, not on every frame
    if status == "warning" and not new_warning:
        say = None  # the warning is still on the display; it was spoken when it was confirmed
    return CheckResult(
        status=status,
        problem=v if status in ("warning", "checking") and v in ("wrong_item", "missing", "too_many", "not_matching") else None,
        text=text.format(**values)[:140],
        say=say,
        hint=hint if status == "unsure" else None,
        lines=verdict.lines if step.check.kind == "order" else None,
        confidence=None if confidence is None else round(max(0.0, min(1.0, confidence)), 2),
        decided_by=decided_by,
        step_done=final and status == "ok",
    )


@dataclass
class RunState:
    problem: str | None = None  # the problem signature seen in the previous frame
    streak: int = 0
    ok_said: bool = False
    warned: str | None = None  # the problem signature last spoken as a warning
    new_warning: bool = False  # this frame's warning is new, so it is spoken
    touched: float = field(default_factory=time.monotonic)


class Tracker:
    """Per (run_id, step_id): the two-frames-in-a-row rule and one check at a time."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._runs: dict[tuple[str, str], RunState] = {}
        self._busy: set[str] = set()
        self._calls: dict[str, list[float]] = {}

    def allow(self, run_id: str, now: float | None = None) -> bool:
        """At most MAX_CHECKS_PER_MINUTE model calls per run (JUN-82)."""
        now = time.monotonic() if now is None else now
        with self._lock:
            calls = [t for t in self._calls.get(run_id, []) if now - t < 60]
            if len(calls) >= MAX_CHECKS_PER_MINUTE:
                self._calls[run_id] = calls
                return False
            self._calls[run_id] = [*calls, now]
            return True

    def try_begin(self, run_id: str) -> bool:
        with self._lock:
            if run_id in self._busy:
                return False
            self._busy.add(run_id)
            return True

    def end(self, run_id: str) -> None:
        with self._lock:
            self._busy.discard(run_id)

    def first_ok(self, run_id: str, step_id: str) -> bool:
        """True the first time a step comes out ok in this run."""
        with self._lock:
            state = self._runs.setdefault((run_id, step_id), RunState())
            first, state.ok_said = not state.ok_said, True
            return first

    def status_for(self, run_id: str, step_id: str, verdict: Verdict, final: bool) -> str:
        """ok | warning | checking | unsure, after the two-frames rule."""
        now = time.monotonic()
        with self._lock:
            for key in [k for k, s in self._runs.items() if now - s.touched > RUN_TTL]:
                del self._runs[key]
            state = self._runs.setdefault((run_id, step_id), RunState())
            state.touched = now
            v = verdict.verdict
            state.new_warning = False
            if v == "ok":
                state.problem, state.streak, state.warned = None, 0, None
                return "ok"
            if v == "unsure":
                return "unsure"  # an unclear frame neither confirms nor clears a problem
            signature = f"{v}:{verdict.line_name}:{verdict.wrong}:{verdict.failed}"
            state.streak = state.streak + 1 if state.problem == signature else 1
            state.problem = signature
            # The Done pinch is an explicit request: answer it now, never mark a wrong step done.
            if final or state.streak >= CONFIRM_FRAMES:
                # Speak a warning once when it is confirmed (and again on every Done pinch), not on every frame.
                state.new_warning = final or state.warned != signature
                state.warned = signature
                return "warning"
            return "checking"

    def warning_is_new(self, run_id: str, step_id: str) -> bool:
        with self._lock:
            state = self._runs.get((run_id, step_id))
            return bool(state and state.new_warning)


def run_check(
    step: Step,
    frame: bytes,
    reference: bytes | None,
    run_id: str,
    final: bool,
    language: str,
    tracker: Tracker,
    observe: Callable[[bytes, Step, bytes | None, str], Observation],
    jev: Callable[[Step, Observation], JevAnswer | None] = ask_jev,
    decided_by: str | None = None,
) -> CheckResult:
    """decided_by overrides who is named as the decider; demo mode sets "demo" (its observations are scripted)."""
    if step.check.kind == "none":
        return CheckResult(status="ok", text="Pinch Done when you are ready.", confidence=None, decided_by=decided_by or "rules", step_done=final)
    obs = observe(frame, step, reference, language)
    rules = compare(step, obs)
    verdict, confidence, decider = decide(rules, jev(step, obs) if rules.verdict != "unsure" else None)
    status = tracker.status_for(run_id, step.id, verdict, final)
    first_ok = tracker.first_ok(run_id, step.id) if status == "ok" else False
    new_warning = tracker.warning_is_new(run_id, step.id)
    return build_result(step, verdict, confidence, decided_by or decider, status, final, language, obs.hint, first_ok, new_warning)
