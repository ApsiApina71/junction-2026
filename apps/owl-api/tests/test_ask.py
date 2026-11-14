"""Ask (JUN-31) with a stand-in for the model."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import ask, main
from app.ask import Draft, DraftSource, documents_block, grounded_sources
from app.store import FIXTURES, Store

HANDBOOK = ("Kide Logistics: warehouse handbook", (FIXTURES / "docs/warehouse-handbook.md").read_text(encoding="utf-8"))
OUT_OF_STOCK = "If an item is out of stock, mark the line as missing on the order and tell the shift lead."


class FakeMessages:
    def __init__(self, draft: Draft | None, stop_reason: str = "end_turn") -> None:
        self.draft, self.stop_reason, self.calls = draft, stop_reason, []

    def parse(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(parsed_output=self.draft, stop_reason=self.stop_reason)


def fake_model(monkeypatch, draft: Draft | None, stop_reason="end_turn") -> FakeMessages:
    messages = FakeMessages(draft, stop_reason)
    monkeypatch.setattr(ask, "client", lambda: SimpleNamespace(beta=SimpleNamespace(messages=messages)))
    return messages


def draft(found=True, quote=OUT_OF_STOCK, doc="Kide Logistics: warehouse handbook") -> Draft:
    sources = [DraftSource(doc=doc, section="Out of stock", quote=quote)] if found else []
    return Draft(found=found, text="Mark it missing and tell the shift lead.", say="Mark it missing and tell the shift lead.", sources=sources)


def test_answer_with_a_real_source(monkeypatch):
    calls = fake_model(monkeypatch, draft())
    result = ask.answer("What if an item is out of stock?", [HANDBOOK], "uk", "Pick and pack an order, step 2: Pick the items")
    assert result.found is True
    assert result.language == "uk"
    assert result.sources[0].quote == OUT_OF_STOCK
    request = calls.calls[0]
    assert request["system"][1]["cache_control"] == {"type": "ephemeral"}
    assert "never swap in another product" in request["system"][1]["text"].lower()
    assert "Worker's language: uk" in request["messages"][0]["content"]
    assert "step 2: Pick the items" in request["messages"][0]["content"]


def test_quote_matching_ignores_case_and_spacing():
    loose = draft(quote="if an item is out of stock,  mark the line as missing\non the order")
    assert len(grounded_sources(loose, [HANDBOOK])) == 1


def test_made_up_source_is_dropped_and_the_answer_withheld(monkeypatch):
    fake_model(monkeypatch, draft(quote="Swap in a similar product if the item is out of stock."))
    result = ask.answer("What if an item is out of stock?", [HANDBOOK], "en")
    assert result.found is False
    assert result.sources == []
    assert "shift lead" in result.say


def test_wrong_doc_title_is_fixed_from_the_quote(monkeypatch):
    fake_model(monkeypatch, draft(doc="Handbook"))
    result = ask.answer("Out of stock?", [HANDBOOK], "en")
    assert result.sources[0].doc == "Kide Logistics: warehouse handbook"


def test_not_in_the_documents(monkeypatch):
    fake_model(monkeypatch, Draft(found=False, text="Not in our instructions.", say="That's not in our instructions.", sources=[]))
    result = ask.answer("What is the wifi password?", [HANDBOOK], "en")
    assert result.found is False
    assert result.sources == []


def test_no_documents_needs_no_model(monkeypatch):
    monkeypatch.setattr(ask, "client", lambda: pytest.fail("no model call"))
    assert ask.answer("Anything?", [], "fi").text == "Tätä ei ole ohjeissamme. Kysy vuoroesimieheltä."


def test_refusal_raises(monkeypatch):
    fake_model(monkeypatch, None, stop_reason="refusal")
    with pytest.raises(ask.VisionError):
        ask.answer("?", [HANDBOOK], "en")


def test_documents_block_is_stable():
    other = ("A", "# A\n\ntext")
    assert documents_block([HANDBOOK, other]) == documents_block([other, HANDBOOK])


def test_ask_endpoint_uses_the_employee_language_and_all_documents(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "MOCK_ASK", False)
    monkeypatch.setattr(main, "API_TOKEN", "")
    calls = fake_model(monkeypatch, draft())
    client = TestClient(main.app)
    client.post("/docs", files={"file": ("ovens.md", b"# Ovens\n\nNever open the oven in the first 10 minutes.", "text/markdown")})
    r = client.post("/ask", json={"question": "Out of stock?", "employee_id": "emp-sami", "process_id": "proc-pick-pack", "step_id": "step-2"})
    assert r.status_code == 200
    assert r.json()["found"] is True
    system_docs = calls.calls[0]["system"][1]["text"]
    assert "Ovens" in system_docs and "warehouse handbook" in system_docs
    assert "Worker's language: en" in calls.calls[0]["messages"][0]["content"]


def test_quote_may_join_sentences_of_one_section():
    doc = ("Guide", "## Transport\n\nThe metro station is Kivenlahti.\nBuses stop nearby.\nThe metro stops at midnight.")
    joined = draft(quote="The metro station is Kivenlahti. The metro stops at midnight.")
    joined.sources[0].doc = "Guide"
    assert len(grounded_sources(joined, [doc])) == 1
    half_made_up = draft(quote="The metro station is Kivenlahti. The metro runs all night.")
    half_made_up.sources[0].doc = "Guide"
    assert grounded_sources(half_made_up, [doc]) == []
