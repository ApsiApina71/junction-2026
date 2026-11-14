"""Both knowledge levels (JUN-70): a process from the company's documents, and the handbook rule behind each step."""

import io
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import docs_process, main
from app.docs_process import DocDraft, DocStep
from app.models import Check, Process, Step
from app.store import FIXTURES, Store

HANDBOOK_TITLE = "Kide Logistics: warehouse handbook"
HANDBOOK = (FIXTURES / "docs/warehouse-handbook.md").read_text(encoding="utf-8")


def test_plain_draft_from_sections():
    process = docs_process.from_doc("proc-doc-1", HANDBOOK_TITLE, HANDBOOK, None, "Kide Logistics", use_model=False)
    assert (process.status, process.source, process.company) == ("draft", "docs", "Kide Logistics")
    assert [s.title for s in process.steps][:3] == ["Your shift", "Picking an order", "Out of stock"]
    assert len(process.steps) <= docs_process.MAX_STEPS
    for step in process.steps:
        assert step.source.quote in HANDBOOK
        assert len(step.title) <= 32 and len(step.instruction) <= 140 and len(step.say.split()) <= 25


def test_plain_draft_from_a_numbered_list():
    text = "# Closing the shop\n\nDo this every evening:\n\n1. Turn off oven 2.\n2. Wipe the work table.\n3. Lock the back door. Check it twice.\n"
    process = docs_process.from_doc("proc-doc-2", "Closing", text, "Close the shop", "Leipomo Ruis", use_model=False)
    assert process.title == "Close the shop"
    assert [s.title for s in process.steps] == ["Turn off oven 2.", "Wipe the work table.", "Lock the back door."]
    assert process.steps[2].instruction == "Lock the back door. Check it twice."


def test_a_document_without_structure_is_refused():
    with pytest.raises(ValueError):
        docs_process.from_doc("p", "Empty", "Just one line without headings.", None, "", use_model=False)


def fake_model(monkeypatch, draft):
    calls = []

    def parse(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(parsed_output=draft, stop_reason="end_turn")

    monkeypatch.setattr(docs_process, "client", lambda: SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(parse=parse))))
    return calls


def step(title, quote, check="none", criteria=()):
    return DocStep(title=title, instruction=f"{title}.", say=title, check=check, criteria=list(criteria), section="Packing", quote=quote)


def test_model_draft_keeps_only_real_quotes(monkeypatch):
    draft = DocDraft(
        title="Pack an order",
        summary="Pack and seal.",
        language="en",
        steps=[
            step(
                "Heavy items first", "Pack heavy items at the bottom and fill empty space with paper so nothing moves.", "visual", ["Heavy items at the bottom"]
            ),
            step("Tape twice", "Always use three strips of tape."),  # not in the handbook
            step("Label on top", "The label always goes on the top side, never over the tape.", "visual", []),
        ],
    )
    calls = fake_model(monkeypatch, draft)
    process = docs_process.from_doc("proc-doc-3", HANDBOOK_TITLE, HANDBOOK, None, "Kide Logistics", use_model=True)
    assert HANDBOOK_TITLE in calls[0]["messages"][0]["content"]
    assert process.steps[0].check.kind == "visual"
    assert process.steps[0].source.quote.startswith("Pack heavy items")
    assert process.steps[1].source is None  # a made-up rule is never passed on as the company's
    assert process.steps[2].check.kind == "none"  # visual without criteria cannot be checked


def test_model_failure_falls_back_to_the_document(monkeypatch):
    fake_model(monkeypatch, None)
    process = docs_process.from_doc("proc-doc-4", HANDBOOK_TITLE, HANDBOOK, None, "Kide Logistics", use_model=True)
    assert process.steps[0].title == "Your shift"


def test_attach_rules_finds_the_handbook_rule_behind_a_step():
    steps = [
        Step(
            id="step-1",
            index=1,
            title="Seal and label",
            instruction="Tape the box shut and put the shipping label on the top.",
            say="x",
            check=Check(kind="none"),
        ),
        Step(id="step-2", index=2, title="Wave to the camera", instruction="Smile and wave.", say="x", check=Check(kind="none")),
    ]
    process = Process(id="p", title="t", summary="s", company="c", language="en", status="draft", source="record", steps=steps)
    with_rules = docs_process.attach_rules(process, [(HANDBOOK_TITLE, HANDBOOK)])
    assert with_rules.steps[0].rule.quote == "The label always goes on the top side, never over the tape."
    assert with_rules.steps[0].rule.doc == HANDBOOK_TITLE
    assert with_rules.steps[1].rule is None


# HTTP


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "DEMO", True)
    monkeypatch.setattr(main, "MOCK_RECORD", True)
    monkeypatch.setattr(main, "API_TOKEN", "")
    monkeypatch.setattr(docs_process, "client", lambda: pytest.fail("no model call without the model"))
    return TestClient(main.app)


def test_process_from_docs_over_http(client):
    r = client.post("/processes/from-docs", json={"doc_id": "doc-warehouse-handbook", "title": "Warehouse basics"})
    assert r.status_code == 200
    process = r.json()
    assert (process["title"], process["status"], process["source"]) == ("Warehouse basics", "draft", "docs")
    assert process["id"] in [p["id"] for p in client.get("/processes").json()["processes"]]
    assert client.post("/processes/from-docs", json={"doc_id": "doc-nope"}).status_code == 404


def test_a_recorded_step_gets_its_handbook_rule(client):
    buf = io.BytesIO()
    Image.new("RGB", (320, 240), (90, 90, 90)).save(buf, format="JPEG")
    rec = client.post("/record", json={"title": "Seal", "expert": "Laura"}).json()
    client.post(
        f"/record/{rec['id']}/steps",
        data={"narration": "Tape the box shut and put the shipping label on the top."},
        files={"photo": ("p.jpg", buf.getvalue(), "image/jpeg")},
    )
    client.post(f"/record/{rec['id']}/finish")
    done = client.get(f"/record/{rec['id']}").json()
    step = client.get(f"/processes/{done['process_id']}").json()["steps"][0]
    assert step["rule"]["quote"] == "The label always goes on the top side, never over the tape."
    assert step["source"]["quote"].startswith("Tape the box shut")  # the expert's narration stays for the reviewer
