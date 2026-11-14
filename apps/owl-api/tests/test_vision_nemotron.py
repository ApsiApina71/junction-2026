"""Owl Check vision on Nemotron 3.5 Super VL (Verda): the request, the answer and the fallback to Claude."""

import json

import httpx
import pytest

from app import vision
from app.models import Process
from app.store import load_fixture

OBS = {
    "visibility": "clear",
    "hint": None,
    "items": [],
    "criteria": [{"index": 1, "criterion": "Cartons lie at the bottom of the box", "met": "yes", "note": "Two cartons."}],
    "matches_reference": "yes",
    "summary": "A packed box.",
}


@pytest.fixture
def step():
    return Process.model_validate(load_fixture("process-pick-pack.json")).steps[3]


@pytest.fixture
def nemotron(monkeypatch):
    monkeypatch.setattr(vision, "VISION_BACKEND", "nemotron")
    monkeypatch.setenv("VERDA_INFERENCE_KEY", "test-key")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    sent = []

    def answer(content: str | None, finish: str = "stop", status: int = 200):
        def post(url, json, headers, timeout):
            sent.append({"url": url, "json": json, "headers": headers})
            body = {"choices": [{"finish_reason": finish, "message": {"content": content}}]}
            return httpx.Response(status, json=body, request=httpx.Request("POST", url))

        monkeypatch.setattr(vision.httpx, "post", post)

    return answer, sent


def test_nemotron_observation(nemotron, step):
    answer, sent = nemotron
    answer(json.dumps(OBS))
    obs = vision.observe(b"frame", step, b"reference", "fi")
    assert obs.criteria[0].met == "yes" and obs.matches_reference == "yes"
    req = sent[0]
    assert req["url"].endswith("/chat/completions") and req["headers"]["Authorization"] == "Bearer test-key"
    body = req["json"]
    assert body["model"] == vision.NEMOTRON_MODEL
    assert body["response_format"]["json_schema"]["schema"] == vision.Observation.model_json_schema()
    assert body["chat_template_kwargs"] == {"enable_thinking": False}
    assert body["messages"][0] == {"role": "system", "content": vision.SYSTEM_PROMPT}
    parts = body["messages"][1]["content"]
    images = [p for p in parts if p["type"] == "image_url"]
    assert len(images) == 2 and images[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    assert "Write the hint in this language: fi" in parts[-1]["text"]


@pytest.mark.parametrize(
    "content,finish,status",
    [("not json", "stop", 200), (json.dumps(OBS), "length", 200), (json.dumps(OBS), "stop", 503), (None, "stop", 200)],
)
def test_nemotron_unusable_answer_is_a_vision_error(nemotron, step, content, finish, status):
    answer, _ = nemotron
    answer(content, finish, status)
    with pytest.raises(vision.VisionError):
        vision.observe(b"frame", step, None)


def test_nemotron_needs_a_key(nemotron, step, monkeypatch):
    monkeypatch.delenv("VERDA_INFERENCE_KEY")
    with pytest.raises(vision.VisionError, match="VERDA_INFERENCE_KEY"):
        vision.observe(b"frame", step, None)


def test_claude_answers_when_nemotron_fails(nemotron, step, monkeypatch):
    answer, _ = nemotron
    answer("not json")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "set")
    monkeypatch.setattr(vision, "observe_claude", lambda content: vision.Observation.model_validate(OBS | {"summary": "from Claude"}))
    assert vision.observe(b"frame", step, None).summary == "from Claude"


def test_vision_model_names_the_backend(monkeypatch):
    monkeypatch.setattr(vision, "VISION_BACKEND", "nemotron")
    assert vision.vision_model() == vision.NEMOTRON_MODEL
    monkeypatch.setattr(vision, "VISION_BACKEND", "claude")
    assert vision.vision_model() == vision.MODEL_ID


HANDBOOK = ("Junction 2026: volunteer handbook", "# Junction 2026: volunteer handbook\n\n## Lounges\n\nHackers have their own sauna on the 7th floor.\n")


def test_hint_on_nemotron_is_grounded(monkeypatch):
    from app import assist

    monkeypatch.setattr(assist, "ASSIST_BACKEND", "nemotron")
    quote = "Hackers have their own sauna on the 7th floor."
    good = assist.Draft(found=True, bullets=["The sauna is on the 7th floor."], sources=[{"doc": HANDBOOK[0], "quote": quote, "section": "Lounges"}])
    monkeypatch.setattr(assist, "nemotron_parse", lambda *a, **k: good)
    answer = assist.answer("Is there a sauna?", [HANDBOOK], "en")
    assert not answer.unsure and answer.bullets == ["The sauna is on the 7th floor."]
    made_up = assist.Draft(
        found=True, bullets=["The sauna is open 24/7."], sources=[{"doc": HANDBOOK[0], "quote": "The sauna is open 24/7.", "section": "Lounges"}]
    )
    monkeypatch.setattr(assist, "nemotron_parse", lambda *a, **k: made_up)
    assert assist.answer("Is there a sauna?", [HANDBOOK], "en").unsure


def test_hint_falls_back_to_the_local_search_when_nemotron_fails(monkeypatch):
    from app import assist

    monkeypatch.setattr(assist, "ASSIST_BACKEND", "nemotron")

    def fail(*a, **k):
        raise vision.VisionError("down")

    monkeypatch.setattr(assist, "nemotron_parse", fail)
    monkeypatch.setattr(assist, "local_answer", lambda t, d, lang: assist.unsure(lang).model_copy(update={"bullets": ["local"]}))
    assert assist.answer("Is there a sauna on the 7th floor?", [HANDBOOK], "en").bullets == ["local"]


def test_every_llm_call_runs_on_nemotron(monkeypatch):
    """LLM_BACKEND=nemotron: Record, Ask, translations and tasks from documents, with no Anthropic key."""
    from app import ask, docs_process, record, translate
    from app.models import RecordedStep, Recording

    monkeypatch.setattr(vision, "LLM_BACKEND", "nemotron")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(vision, "client", lambda: (_ for _ in ()).throw(AssertionError("Claude was called")))
    asked = []

    def fake(system, user, schema, what, max_tokens=1500, timeout=None):
        asked.append(what)
        if schema is record.ProcessDraft:
            step = record.StepDraft(
                title="Sort the cans",
                instruction="Deposit cans go in the round CANS opening.",
                say="Cans in the round opening.",
                check="visual",
                criteria=["A can is going into the round CANS opening", "No can is in the square PLASTIC opening"],
                warning="That's a deposit can. It goes in the CANS hole.",
                done_when="A hand is putting a can into the round CANS opening",
            )
            return record.ProcessDraft(title="Recycling round", summary="Sort the cans.", language="en", steps=[step])
        if schema is ask.Draft:
            return ask.Draft(
                found=True,
                text="Sunday 10:00.",
                say="Sunday at ten.",
                sources=[{"doc": "H", "quote": "The deadline is Sunday at 10:00.", "section": "Deadline"}],
            )
        if schema is translate.TranslatedProcess:
            raise vision.VisionError("not needed here")
        return docs_process.DocDraft(title="T", summary="S", language="en", steps=[])

    monkeypatch.setattr(vision, "nemotron_parse", fake)
    rec = Recording(
        id="rec-1",
        title="Recycling round",
        expert="Sami",
        status="processing",
        steps=[RecordedStep(index=1, narration="Cans go in the round one.", photo_url="/media/x.jpg")],
    )
    process = record.write_process("proc-r", rec, [b"photo"], "Junction 2026")
    check = process.steps[0].check
    assert check.warning == "That's a deposit can. It goes in the CANS hole."
    assert check.done_when == "A hand is putting a can into the round CANS opening"
    assert check.criteria == ["No can is in the square PLASTIC opening"]  # the done moment never warns
    answer = ask.answer("When is the deadline?", [("H", "## Deadline\n\nThe deadline is Sunday at 10:00.")], "en")
    assert answer.found and answer.sources[0].quote == "The deadline is Sunday at 10:00."
    with pytest.raises(vision.VisionError):
        docs_process.model_draft("H", "Some text", None)
    assert asked == ["record", "ask", "document"]
    monkeypatch.setattr(vision, "MODEL_ID", "claude-x")
    assert vision.llm_model() == vision.NEMOTRON_MODEL
