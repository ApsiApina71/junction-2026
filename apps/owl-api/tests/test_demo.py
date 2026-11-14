"""Demo mode (JUN-69), local retrieval (JUN-71) and the warning that is spoken once."""

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import ask, demo, main, search
from app.models import Process
from app.store import FIXTURES, Store, load_fixture
from app.verifier import Tracker, run_check
from app.vision import Observation, SeenItem

PROCESS = Process.model_validate(load_fixture("process-pick-pack.json"))
ORDER_STEP = PROCESS.steps[1]
HANDBOOK = ("Kide Logistics: warehouse handbook", (FIXTURES / "docs/warehouse-handbook.md").read_text(encoding="utf-8"))
BAKERY = ("Leipomo Ruis: bakery handbook", (FIXTURES / "docs/bakery-handbook.md").read_text(encoding="utf-8"))


# The demo script


def test_demo_script_is_valid():
    script = demo.Demo().script
    processes = {p.id: p for p in (Process.model_validate(load_fixture(f.name)) for f in FIXTURES.glob("process-*.json") if f.name.count(".") == 1)}
    for key, phases in script["steps"].items():
        process_id, step_id = key.split(":")
        step = next(s for s in processes[process_id].steps if s.id == step_id)
        assert phases and "until_seconds" not in phases[-1]  # the last phase lasts for ever
        for phase in phases:
            demo._observation(step, phase["observation"])  # every phase is a valid Observation


def test_order_step_story_wrong_carton_then_fixed():
    d = demo.Demo()
    tracker = Tracker()

    def frame(t, final=False):
        return run_check(
            ORDER_STEP, b"", None, "run-a", final, "en", tracker,
            observe=lambda _f, s, _r, _l: d.observe("proc-pick-pack", s, "run-a", now=t), jev=lambda *_: None, decided_by="demo",
        )  # fmt: skip

    first = frame(0)
    assert (first.status, first.say, first.decided_by) == ("checking", None, "demo")
    warning = frame(1.5)
    assert warning.status == "warning"
    assert warning.say == "Wrong item: Oat drink 0.5 l. The order says Oat drink 1 l."
    assert frame(3).say is None  # still wrong: on the display, not spoken again
    early_done = frame(5, final=True)
    assert (early_done.status, early_done.step_done) == ("warning", False)
    assert early_done.say  # a Done pinch always hears why
    fixed = frame(13)
    assert (fixed.status, fixed.say) == ("ok", "All good. Everything on the order is in the box.")
    assert frame(14, final=True).step_done is True


def test_story_restarts_for_every_run():
    d = demo.Demo()
    assert d.observe("proc-pick-pack", ORDER_STEP, "run-1", now=0).items[1].line == "other"
    assert d.observe("proc-pick-pack", ORDER_STEP, "run-1", now=20).items[0].qty == 2
    assert d.observe("proc-pick-pack", ORDER_STEP, "run-2", now=20).items[1].line == "other"


def test_steps_without_a_script_are_done_right():
    d = demo.Demo()
    for process_file in ("process-pick-pack.json", "process-bakery-rye.json"):
        process = Process.model_validate(load_fixture(process_file))
        for step in process.steps:
            if step.check.kind == "none" or f"{process.id}:{step.id}" in d.script["steps"]:
                continue
            result = run_check(
                step, b"", None, "r", True, "en", Tracker(), observe=lambda *_, s=step, pid=process.id: d.observe(pid, s, "r"), jev=lambda *_: None
            )
            assert result.step_done is True, (process.id, step.id)


# The warning is spoken once (real engine too)


def test_a_confirmed_warning_is_spoken_once_and_again_when_it_changes():
    tracker = Tracker()
    wrong = Observation(
        visibility="clear",
        hint=None,
        items=[SeenItem(line="OAT-1L", description="Oat drink 1 l", qty=2), SeenItem(line="COF-500", description="Coffee 500 g", qty=1)],
        criteria=[],
        matches_reference="no_reference",
        summary="",
    )
    other = wrong.model_copy(update={"items": [*wrong.items, SeenItem(line="RYE-CRISP", description="Rye crispbread", qty=3)]})

    def frame(obs):
        return run_check(ORDER_STEP, b"", None, "r", False, "en", tracker, observe=lambda *_: obs, jev=lambda *_: None)

    assert frame(wrong).status == "checking"
    assert frame(wrong).say == "Something is missing: Rye crispbread."
    assert frame(wrong).say is None
    frame(other)
    assert frame(other).say == "Too many in the box: Rye crispbread."


# Retrieval and the demo answers


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("What if an item is out of stock?", "If an item is out of stock, mark the line as missing on the order and tell the shift lead."),
        ("Where does the label go?", "The label always goes on the top side, never over the tape."),
        ("What do I do with a dented can?", "A dented can or a leaking carton never goes to a customer."),
        ("When does the truck leave?", "The truck leaves at 15:00."),
    ],
)
def test_demo_answers_quote_the_handbook(question, expected):
    answer = ask.demo_answer(question, [HANDBOOK, BAKERY], "en")
    assert answer.found is True
    assert answer.text == expected
    assert answer.sources[0].doc == HANDBOOK[0]
    assert answer.sources[0].quote in HANDBOOK[1]
    assert len(answer.say.split()) <= 25


def test_demo_answer_not_in_the_instructions():
    assert ask.demo_answer("What is the wifi password?", [HANDBOOK, BAKERY], "en").found is False


def test_sections_and_ranking():
    sections = search.split_sections("d", "Doc", "# Title\n\nIntro.\n\n## Ovens\nOven 2 is for rye.\n\n## Allergens\nNuts go on shelf C.")
    assert [s.heading for s in sections] == ["Title", "Ovens", "Allergens"]
    index = search.Index()
    index.update([("w", HANDBOOK[0], HANDBOOK[1]), ("b", BAKERY[0], BAKERY[1])])
    assert index.search("dented can")[0][1].heading == "Damaged items"
    assert index.search("oven")[0][1].doc_title == BAKERY[0]
    assert index.search("zzzz") == []


def test_plain_text_without_headings_is_chunked():
    text = "\n\n".join(f"Paragraph {i} " + "word " * 100 for i in range(10))
    sections = search.split_sections("t", "Plain", text)
    assert len(sections) > 1
    assert all(len(s.text) <= 2100 for s in sections)


def test_ask_sends_only_the_best_sections_when_documents_are_large(monkeypatch):
    big = ("Big manual", "\n\n".join(f"## Machine {i}\nMachine {i} needs oil every week." for i in range(400)))
    monkeypatch.setattr(ask, "ASK_MAX_CHARS", 3000)
    picked = ask.prompt_docs("What if an item is out of stock?", None, [HANDBOOK, big])
    text = "\n".join(t for _, t in picked)
    assert len(text) <= 3000
    assert "If an item is out of stock" in text
    monkeypatch.setattr(ask, "ASK_MAX_CHARS", 10**9)
    assert ask.prompt_docs("anything", None, [HANDBOOK, big]) == [HANDBOOK, big]


# HTTP in demo mode


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "tracker", Tracker())
    monkeypatch.setattr(main, "demo", demo.Demo())
    monkeypatch.setattr(main, "DEMO", True)
    monkeypatch.setattr(main, "MOCK_CHECK", False)
    monkeypatch.setattr(main, "MOCK_ASK", False)
    monkeypatch.setattr(main, "API_TOKEN", "")
    monkeypatch.setattr(main.vision, "observe", lambda *_: pytest.fail("no model call in demo mode"))
    monkeypatch.setattr(ask, "client", lambda: pytest.fail("no model call in demo mode"))
    return TestClient(main.app)


def jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (64, 48)).save(buf, format="JPEG")
    return buf.getvalue()


def test_demo_mode_over_http(client):
    form = {"process_id": "proc-pick-pack", "step_id": "step-2", "run_id": "stage"}
    first = client.post("/check", data=form, files={"image": ("f.jpg", jpeg(), "image/jpeg")}).json()
    second = client.post("/check", data=form, files={"image": ("f.jpg", jpeg(), "image/jpeg")}).json()
    assert (first["status"], second["status"], second["decided_by"]) == ("checking", "warning", "demo")
    visual = {**form, "step_id": "step-4", "final": "true"}
    assert client.post("/check", data=visual, files={"image": ("f.jpg", jpeg(), "image/jpeg")}).json()["step_done"] is True
    answer = client.post("/ask", json={"question": "Where does the label go?", "employee_id": "emp-sami"}).json()
    assert answer["found"] is True and answer["sources"][0]["section"] == "Packing"
