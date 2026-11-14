"""A step's own warning line (JUN-106): "That's a deposit bottle. It goes to the return crate." """

from types import SimpleNamespace

from app import record, translate
from app.models import Check, Process, RecordedStep, Recording
from app.record import ProcessDraft, StepDraft
from app.store import load_fixture
from app.verifier import Tracker, run_check
from app.vision import CriterionSeen, Observation

PROCESS = Process.model_validate(load_fixture("process-pick-pack.json"))
LINE = "That's a deposit bottle. It goes to the return crate."
STEP = PROCESS.steps[3].model_copy(update={"check": Check(kind="visual", criteria=["The bottle is in the return crate"], warning=LINE)})


def look(step, met: str, tracker: Tracker, final: bool = False, language: str = "en"):
    obs = Observation(
        visibility="clear",
        hint=None,
        items=[],
        criteria=[CriterionSeen(index=1, criterion=step.check.criteria[0], met=met, note="")],
        matches_reference="no_reference",
        summary="synthetic",
    )
    return run_check(step, b"", None, "run-w", final, language, tracker, observe=lambda *_: obs, jev=lambda *_: None)


def test_the_expert_line_is_shown_and_spoken_as_it_is():
    tracker = Tracker()
    first = look(STEP, "no", tracker)
    assert first.status == "checking"  # the two-frames rule stays
    warned = look(STEP, "no", tracker)
    assert (warned.status, warned.problem, warned.text, warned.say) == ("warning", "not_matching", LINE, LINE)
    again = look(STEP, "no", tracker)
    assert again.text == LINE and again.say is None  # spoken once, still on the display
    done = look(STEP, "yes", Tracker(), final=True)
    assert done.step_done is True


def test_the_done_pinch_on_a_wrong_step_says_the_line():
    result = look(STEP, "no", Tracker(), final=True)
    assert (result.step_done, result.text, result.say) == (False, LINE, LINE)


def test_without_a_line_the_old_texts():
    plain = STEP.model_copy(update={"check": STEP.check.model_copy(update={"warning": None})})
    tracker = Tracker()
    look(plain, "no", tracker)
    assert look(plain, "no", tracker).say == "Check again: the bottle is in the return crate."


def test_easy_language_keeps_the_expert_line():
    tracker = Tracker()
    look(STEP, "no", tracker, language="en-x-easy")
    assert look(STEP, "no", tracker, language="en-x-easy").say == LINE


def test_a_line_with_braces_is_not_a_template():
    odd = STEP.model_copy(update={"check": STEP.check.model_copy(update={"warning": "Use the {red} crate."})})
    tracker = Tracker()
    look(odd, "no", tracker)
    assert look(odd, "no", tracker).text == "Use the {red} crate."


def test_the_translation_keeps_the_line():
    process = PROCESS.model_copy(update={"steps": [*PROCESS.steps[:3], STEP, PROCESS.steps[4]]})
    steps = [
        translate.TranslatedStep(
            id=s.id,
            title="t",
            instruction="i",
            say="s",
            criteria=["k"] * len(s.check.criteria),
            warning="Pantillinen pullo. Se menee palautuslaatikkoon." if s.id == STEP.id else "",
        )
        for s in process.steps
    ]
    fi = translate.apply(process, translate.TranslatedProcess(title="T", summary="S", steps=steps), "fi")
    assert fi.steps[3].check.warning == "Pantillinen pullo. Se menee palautuslaatikkoon."
    assert fi.steps[0].check.warning is None
    # The model left it out: the original line stays rather than none at all.
    steps[3] = steps[3].model_copy(update={"warning": ""})
    assert translate.apply(process, translate.TranslatedProcess(title="T", summary="S", steps=steps), "fi").steps[3].check.warning == LINE


def test_record_writes_the_line_from_the_expert_rule(monkeypatch):
    rec = Recording(
        id="rec-w",
        title="Sort the empties",
        expert="Laura",
        status="processing",
        steps=[RecordedStep(index=1, narration="Bottles with a deposit go to the return crate, not the trash.", photo_url="/media/x.jpg")],
    )
    draft = ProcessDraft(
        title="Sort the empties",
        summary="Bottles to the right place.",
        language="en",
        steps=[
            StepDraft(
                title="Sort the bottle",
                instruction="Deposit bottles go to the return crate.",
                say="Return crate.",
                check="visual",
                criteria=["The bottle is in the return crate"],
                warning=LINE,
            )
        ],
    )
    calls = []

    def parse(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(parsed_output=draft, stop_reason="end_turn")

    monkeypatch.setattr(record, "client", lambda: SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(parse=parse))))
    process = record.write_process("proc-w", rec, [b"\xff\xd8photo"], "Junction")
    assert process.steps[0].check.warning == LINE
    assert process.steps[0].reviewed is False  # a person still reviews the draft
    assert "warning" in calls[0]["system"]
