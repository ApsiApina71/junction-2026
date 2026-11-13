"""The chat loop end to end with a scripted model: tool call -> engine -> card + text over SSE."""

import json
from typing import Any

from fastapi.testclient import TestClient
from strands.models.model import Model

from app import agent, db, main

from .conftest import TODAY, build_customer


class ScriptedModel(Model):
    """Asks for safe-to-spend first, then answers in words once the tool result is in the conversation."""

    def __init__(self) -> None:
        self.seen_tools: list[str] = []
        self.seen_system = ""

    def update_config(self, **model_config: Any) -> None:
        pass

    def get_config(self) -> Any:
        return {"model_id": "scripted"}

    def structured_output(self, *args: Any, **kwargs: Any):
        raise NotImplementedError

    async def stream(self, messages, tool_specs=None, system_prompt=None, **kwargs: Any):
        self.seen_tools = [t["name"] for t in tool_specs or []]
        self.seen_system = system_prompt or ""
        has_result = any("toolResult" in block for m in messages for block in m["content"])
        yield {"messageStart": {"role": "assistant"}}
        if not has_result:
            yield {"contentBlockStart": {"contentBlockIndex": 0, "start": {"toolUse": {"name": "get_safe_to_spend", "toolUseId": "t1"}}}}
            yield {"contentBlockDelta": {"contentBlockIndex": 0, "delta": {"toolUse": {"input": "{}"}}}}
            yield {"contentBlockStop": {"contentBlockIndex": 0}}
            yield {"messageStop": {"stopReason": "tool_use"}}
        else:
            yield {"contentBlockStart": {"contentBlockIndex": 0, "start": {}}}
            for word in ("You can ", "spend safely."):
                yield {"contentBlockDelta": {"contentBlockIndex": 0, "delta": {"text": word}}}
            yield {"contentBlockStop": {"contentBlockIndex": 0}}
            yield {"messageStop": {"stopReason": "end_turn"}}
        yield {"metadata": {"usage": {"inputTokens": 1, "outputTokens": 1, "totalTokens": 2}, "metrics": {"latencyMs": 0}}}


def _events(text: str) -> list[dict]:
    return [json.loads(line[5:]) for line in text.splitlines() if line.startswith("data:")]


def test_chat_streams_tool_card_and_text(monkeypatch):
    model = ScriptedModel()
    monkeypatch.setattr(agent, "build_model", lambda: model)
    monkeypatch.setattr(agent, "llm_configured", lambda: True)
    monkeypatch.setattr(db, "load_customer", lambda cid: build_customer() if cid == "CUST99999" else None)
    monkeypatch.setattr(db, "today", lambda: TODAY)

    body = {
        "customer_id": "CUST99999",
        "language": "fi",
        "messages": [
            {"role": "user", "content": "hei"},
            {"role": "assistant", "content": "Hei!"},
            {"role": "user", "content": "Paljonko voin käyttää tällä viikolla?"},
        ],
    }
    r = TestClient(main.app).post("/api/chat", json=body)
    assert r.status_code == 200
    events = _events(r.text)
    kinds = [e["type"] for e in events]
    assert kinds[-1] == "done" and "error" not in kinds
    assert {"type": "tool", "name": "get_safe_to_spend"} in events
    card = next(e for e in events if e["type"] == "card")
    assert card["card"] == "safe_to_spend" and card["data"]["days_to_payday"] == 15
    assert kinds.index("card") < kinds.index("text")
    assert "".join(e["text"] for e in events if e["type"] == "text") == "You can spend safely."
    assert len(model.seen_tools) == 15 and "run_sql" in model.seen_tools
    assert "Reply in Finnish" in model.seen_system and "2026-09-30" in model.seen_system


def test_chat_needs_a_model_and_a_known_customer(monkeypatch):
    monkeypatch.setattr(agent, "llm_configured", lambda: False)
    monkeypatch.setattr(db, "load_customer", lambda cid: build_customer() if cid == "CUST99999" else None)
    client = TestClient(main.app)
    msg = [{"role": "user", "content": "hi"}]
    assert client.post("/api/chat", json={"customer_id": "CUST99999", "messages": msg}).status_code == 503
    assert client.post("/api/chat", json={"customer_id": "CUST00000", "messages": msg}).status_code == 404
    assert client.post("/api/chat", json={"customer_id": "CUST99999", "messages": []}).status_code == 422
