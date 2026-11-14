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
