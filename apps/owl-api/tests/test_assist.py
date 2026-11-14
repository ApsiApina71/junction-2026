"""Customer service mode (JUN-98): suggestions from the handbook only, and the transcript is never kept."""

import logging

import pytest
from fastapi.testclient import TestClient

from app import assist, main, persist
from app.models import AssistAnswer
from app.progress import Progress
from app.store import Store
from app.verifier import Tracker


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "tracker", Tracker())
    monkeypatch.setattr(main, "progress", Progress())
    monkeypatch.setattr(main, "API_TOKEN", "")
    monkeypatch.setattr(main, "MOCK_ASSIST", True)
    c = TestClient(main.app)
    c.put("/employees/emp-noa/training", json={"starts": main.training.today().isoformat()})
    return c


def suggest(client, transcript, employee="emp-noa"):
    return client.post("/assist", json={"employee_id": employee, "transcript": transcript})


def test_a_return_question(client):
    r = suggest(client, "Hi, one cappuccino please. Here you go. Oh, and I bought these coffee beans yesterday, can I return them unopened?")
    assert r.status_code == 200
    a = r.json()
    assert a["unsure"] is False and 1 <= len(a["bullets"]) <= 3
    assert all(len(b) <= 80 for b in a["bullets"])
    assert a["sources"] == [{"doc": "Café Kide: counter handbook", "section": "Returns and refunds"}]
    assert any("14 days" in b for b in a["bullets"])
    assert a["say"] is None


def test_opening_hours(client):
    a = suggest(client, "Thanks. When are you open on Saturday?").json()
    assert a["sources"][0]["section"] == "Opening hours"
    assert any("Saturday" in b for b in a["bullets"])


def test_not_in_the_handbook(client):
    a = suggest(client, "Do you know who won the football match yesterday?").json()
    assert a == {"bullets": ["Not in the handbook, ask a colleague"], "say": None, "sources": [], "unsure": True}


def test_only_for_a_customer_service_role(client):
    assert client.get("/employees/emp-noa/training").json()["customer_service"] is True
    client.put("/employees/emp-sami/training", json={"starts": main.training.today().isoformat()})
    assert client.get("/employees/emp-sami/training").json()["customer_service"] is False
    r = suggest(client, "Are you open on Sunday?", employee="emp-sami")
    assert (r.status_code, r.json()["detail"]) == (403, "not_customer_service")


def test_only_during_training(client):
    client.put("/employees/emp-noa/training", json={"starts": None})
    r = suggest(client, "Are you open on Sunday?")
    assert (r.status_code, r.json()["detail"]) == (409, "not_in_training")
    assert suggest(client, "hi", employee="nobody").status_code == 404


def test_the_transcript_is_never_kept(client, tmp_path, caplog):
    secret = "my card number is 4242 and I live at Secret Street 5, are you open on Sunday"
    with caplog.at_level(logging.DEBUG):
        assert suggest(client, secret).status_code == 200
    assert "Secret Street" not in caplog.text
    persist.save(main.store, main.progress)
    for path in tmp_path.rglob("*"):
        if path.is_file():
            assert b"Secret Street" not in path.read_bytes(), path


def test_only_the_last_half_minute_counts():
    old = "opening hours " * 200
    assert "opening" not in assist.tail(old + " " + "word " * 80)


def test_the_sign_can_be_edited(client):
    assert "Nothing is recorded" in client.get("/assist/sign").json()["text"]
    assert client.put("/assist/sign", json={"text": "Owl listens here."}).json()["text"] == "Owl listens here."
    assert client.get("/assist/sign").json()["text"] == "Owl listens here."


class FakeParsed:
    def __init__(self, draft):
        self.parsed_output = draft
        self.stop_reason = "end_turn"


def fake_client(draft):
    class Messages:
        def parse(self, **kwargs):
            assert "Secret" not in kwargs["system"][0]["text"]
            return FakeParsed(draft)

    class Beta:
        messages = Messages()

    class Client:
        beta = Beta()

    return lambda: Client()


DOCS = [
    (
        "Café Kide: counter handbook",
        "## Returns and refunds\n- Unopened coffee beans can be returned within 14 days with the receipt.",
    )
]


def test_model_bullets_need_a_real_quote(monkeypatch):
    good = assist.Draft(
        found=True,
        bullets=["Unopened beans: return within 14 days", "Receipt needed"],
        sources=[{"doc": "Café Kide: counter handbook", "section": "Returns and refunds", "quote": "can be returned within 14 days with the receipt"}],
    )
    monkeypatch.setattr(assist, "client", fake_client(good))
    a = assist.answer("can I return these beans", DOCS, "en")
    assert a == AssistAnswer(bullets=good.bullets, sources=[{"doc": "Café Kide: counter handbook", "section": "Returns and refunds"}], unsure=False)

    made_up = good.model_copy(update={"sources": [{"doc": "Café Kide: counter handbook", "section": "x", "quote": "returns within 60 days"}]})
    monkeypatch.setattr(assist, "client", fake_client(made_up))
    assert assist.answer("can I return these beans", DOCS, "en").unsure is True

    not_found = assist.Draft(found=False, bullets=[], sources=[])
    monkeypatch.setattr(assist, "client", fake_client(not_found))
    assert assist.answer("who won the match", DOCS, "fi").bullets == ["Ei käsikirjassa, kysy työkaverilta"]


def test_each_company_has_its_own_handbook():
    store = Store()
    titles = lambda e: {t for t, _ in store.docs_for(store.employees[e])}
    assert "Café Kide: counter handbook" in titles("emp-noa")
    assert "Café Kide: counter handbook" not in titles("emp-sami")
    assert "Kide Logistics: warehouse handbook" not in titles("emp-noa")
    assert "Kide Logistics: warehouse handbook" in titles("emp-sami")


@pytest.mark.parametrize(
    ("said", "section", "word"),
    [
        ("Is there gluten in the cinnamon bun? I have an allergy.", "Allergens", "gluten"),
        ("How much is a latte with oat milk?", "Prices", "Oat milk"),
        ("What's the wifi password here?", "Wi-Fi and seats", "receipt"),
        ("Can I pay the beans with a lunch voucher?", "Payment", "voucher"),
    ],
)
def test_demo_script_questions(client, said, section, word):
    a = suggest(client, said).json()
    assert a["sources"][0]["section"] == section
    assert any(word.lower() in b.lower() for b in a["bullets"]), a["bullets"]
