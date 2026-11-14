"""Owl Check engine (JUN-30, JUN-37) with stand-ins for the vision model and Jev."""

import io

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main, verifier
from app.models import Process
from app.store import Store, load_fixture
from app.verifier import JevAnswer, Tracker, run_check
from app.vision import CriterionSeen, Observation, SeenItem

PROCESS = Process.model_validate(load_fixture("process-pick-pack.json"))
ORDER_STEP = PROCESS.steps[1]  # Oat drink 1 l × 2, Coffee 500 g × 1, Rye crispbread × 1
VISUAL_STEP = PROCESS.steps[3]


def seen(*items, visibility="clear", hint=None) -> Observation:
    return Observation(
        visibility=visibility,
        hint=hint,
        items=[SeenItem(line=line, description=desc, qty=qty) for line, desc, qty in items],
        criteria=[],
        matches_reference="no_reference",
        summary="A box on the table.",
    )


RIGHT = seen(("OAT-1L", "Oat drink 1 l", 2), ("COF-500", "Coffee 500 g", 1), ("RYE-CRISP", "Rye crispbread", 1))
WRONG_SIZE = seen(("OAT-1L", "Oat drink 1 l", 1), ("other", "Oat drink 0.5 l", 1), ("COF-500", "Coffee 500 g", 1), ("RYE-CRISP", "Rye crispbread", 1))


def visual(*met, visibility="clear", reference="no_reference") -> Observation:
    criteria = [CriterionSeen(criterion=c, met=m, note="") for c, m in zip(VISUAL_STEP.check.criteria, met, strict=False)]
    return Observation(visibility=visibility, hint=None, items=[], criteria=criteria, matches_reference=reference, summary="A packed box.")


def check(obs: Observation, tracker: Tracker, step=ORDER_STEP, final=False, jev=None, language="en", run="run-1"):
    return run_check(step, b"frame", None, run, final, language, tracker, observe=lambda *_: obs, jev=lambda *_: jev)


@pytest.fixture
def tracker():
    return Tracker()


# Rules


def test_right_order_is_ok_and_said_once(tracker):
    first = check(RIGHT, tracker)
    assert first.status == "ok"
    assert [line.status for line in first.lines] == ["ok", "ok", "ok"]
    assert first.say == "All good. Everything on the order is in the box."
    assert first.step_done is False
    assert check(RIGHT, tracker).say is None


def test_wrong_size_warns_only_on_the_second_frame(tracker):
    first = check(WRONG_SIZE, tracker)
    assert first.status == "checking"
    assert first.say is None
    second = check(WRONG_SIZE, tracker)
    assert second.status == "warning"
    assert second.problem == "wrong_item"
    assert second.say == "Wrong item: Oat drink 0.5 l. The order says Oat drink 1 l."
    assert second.lines[0].status == "wrong_item"
    assert second.lines[0].note == "1 × Oat drink 0.5 l"


def test_one_bad_frame_between_good_ones_never_warns(tracker):
    assert check(WRONG_SIZE, tracker).status == "checking"
    assert check(RIGHT, tracker).status == "ok"
    assert check(WRONG_SIZE, tracker).status == "checking"


def test_unclear_frame_does_not_break_the_streak(tracker):
    check(WRONG_SIZE, tracker)
    assert check(seen(visibility="unclear", hint="Move closer to the box"), tracker).status == "unsure"
    assert check(WRONG_SIZE, tracker).status == "warning"


def test_done_pinch_on_a_wrong_order_warns_at_once_and_is_not_done(tracker):
    result = check(WRONG_SIZE, tracker, final=True)
    assert result.status == "warning"
    assert result.step_done is False


def test_done_pinch_on_a_right_order_finishes_the_step(tracker):
    result = check(RIGHT, tracker, final=True)
    assert result.status == "ok"
    assert result.step_done is True
    assert result.say == "Well done. Step done."


def test_missing_item(tracker):
    obs = seen(("OAT-1L", "Oat drink 1 l", 2), ("COF-500", "Coffee 500 g", 1))
    result = check(obs, tracker, final=True)
    assert result.problem == "missing"
    assert result.say == "Something is missing: Rye crispbread."


def test_missing_item_in_a_partial_view_is_unsure_not_a_warning(tracker):
    obs = seen(("OAT-1L", "Oat drink 1 l", 2), visibility="partial", hint="Move closer to the box")
    result = check(obs, tracker, final=True)
    assert result.status == "unsure"
    assert result.hint == "Move closer to the box"
    assert result.say == "I can't see it well. Move closer to the box."
    assert result.step_done is False


def test_too_many_and_extra_items(tracker):
    too_many = seen(("OAT-1L", "Oat drink 1 l", 3), ("COF-500", "Coffee 500 g", 1), ("RYE-CRISP", "Rye crispbread", 1))
    assert check(too_many, tracker, final=True).problem == "too_many"
    extra = seen(*[(i.line, i.description, i.qty) for i in RIGHT.items], ("other", "Chocolate bar", 1))
    result = check(extra, Tracker(), final=True)
    assert result.problem == "too_many"
    assert result.say == "Too many in the box: Chocolate bar."


def test_unclear_view_stays_quiet_until_done(tracker):
    obs = seen(visibility="unclear", hint="Point the glasses at the box")
    mid = check(obs, tracker)
    assert (mid.status, mid.say) == ("unsure", None)
    assert check(obs, tracker, final=True).say == "I can't see it well. Point the glasses at the box."


def test_visual_step(tracker):
    assert check(visual("yes", "yes", "yes"), tracker, step=VISUAL_STEP, final=True).step_done is True
    result = check(visual("yes", "no", "yes"), Tracker(), step=VISUAL_STEP, final=True)
    assert result.problem == "not_matching"
    assert result.lines is None
    assert result.say == "Check again: crispbread is on top."
    assert check(visual("yes", "unclear", "yes"), Tracker(), step=VISUAL_STEP, final=True).status == "unsure"
    assert check(visual("yes", "yes"), Tracker(), step=VISUAL_STEP, final=True).status == "unsure"  # a criterion not reported


def test_none_step_needs_no_model(tracker):
    step = ORDER_STEP.model_copy(update={"check": ORDER_STEP.check.model_copy(update={"kind": "none"})})
    result = run_check(step, b"", None, "r", True, "en", tracker, observe=lambda *_: pytest.fail("no model call"))
    assert result.step_done is True


def test_finnish(tracker):
    assert check(WRONG_SIZE, tracker, final=True, language="fi").say == "Väärä tuote: Oat drink 0.5 l. Tilauksessa on Oat drink 1 l."


def test_runs_do_not_share_state(tracker):
    check(WRONG_SIZE, tracker, run="a")
    assert check(WRONG_SIZE, tracker, run="b").status == "checking"


# Jev


def test_jev_agreeing_decides(tracker):
    result = check(WRONG_SIZE, tracker, final=True, jev=JevAnswer("wrong_item", 0.93))
    assert (result.status, result.decided_by, result.confidence) == ("warning", "jev", 0.93)


def test_jev_unsure_or_below_threshold_never_warns(tracker):
    assert check(WRONG_SIZE, tracker, final=True, jev=JevAnswer("wrong_item", 0.5)).status == "unsure"
    assert check(WRONG_SIZE, Tracker(), final=True, jev=JevAnswer("unsure", 0.9)).status == "unsure"


def test_jev_saying_ok_never_passes_a_wrong_order(tracker):
    result = check(WRONG_SIZE, tracker, final=True, jev=JevAnswer("ok", 0.99))
    assert result.status == "unsure"
    assert result.step_done is False


def test_jev_doubting_a_right_order_does_not_finish_it(tracker):
    result = check(RIGHT, tracker, final=True, jev=JevAnswer("ok", 0.4))
    assert result.step_done is False


def test_ask_jev_request_and_answer(monkeypatch):
    sent = {}

    def fake_post(url, headers, json, timeout):
        sent.update(url=url, auth=headers["Authorization"], body=json)
        answer = {"type": "choice", "choice": "wrong_item", "confidence": 0.8, "probabilities": {"ok": 0.05, "wrong_item": 0.88, "missing": 0.07}}
        return httpx.Response(200, json={"answers": {"verdict": answer}}, request=httpx.Request("POST", url))

    monkeypatch.setattr(verifier, "JEV_API_KEY", "key")
    monkeypatch.setattr(verifier.httpx, "post", fake_post)
    answer = verifier.ask_jev(ORDER_STEP, WRONG_SIZE)
    assert (answer.verdict, answer.probability) == ("wrong_item", 0.88)
    assert sent["auth"] == "Bearer key"
    assert sent["body"]["model"] == "typesafe/jev-1.13"
    assert sent["body"]["questions"]["verdict"]["type"] == "choice"
    assert set(sent["body"]["questions"]["verdict"]["criteria"]) == {"ok", "wrong_item", "missing", "too_many", "unsure"}
    assert {"product": "Oat drink 0.5 l", "qty": 1, "is_order_line": None} in sent["body"]["state"]["in_the_box"]


def test_ask_jev_falls_back_on_errors(monkeypatch):
    assert verifier.ask_jev(ORDER_STEP, RIGHT) is None  # no key
    monkeypatch.setattr(verifier, "JEV_API_KEY", "key")

    def failing_post(url, **_):
        raise httpx.ConnectTimeout("timeout")

    monkeypatch.setattr(verifier.httpx, "post", failing_post)
    assert verifier.ask_jev(ORDER_STEP, RIGHT) is None
    monkeypatch.setattr(verifier.httpx, "post", lambda url, **_: httpx.Response(200, json={"answers": {}}, request=httpx.Request("POST", url)))
    assert verifier.ask_jev(ORDER_STEP, RIGHT) is None


# HTTP


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "tracker", Tracker())
    monkeypatch.setattr(main, "MOCK_CHECK", False)
    monkeypatch.setattr(main, "API_TOKEN", "")
    monkeypatch.setattr(verifier, "JEV_API_KEY", "")
    return TestClient(main.app)


def jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (640, 480), (90, 90, 90)).save(buf, format="JPEG")
    return buf.getvalue()


def post_check(client, **form):
    data = {"process_id": "proc-pick-pack", "step_id": "step-2", "run_id": "run-1", **form}
    return client.post("/check", data=data, files={"image": ("f.jpg", jpeg(), "image/jpeg")})


def test_check_endpoint_runs_the_engine_with_the_reference_photo(client, monkeypatch):
    calls = []

    def fake_observe(frame, step, reference, language):
        calls.append((len(frame) > 0, step.id, reference is not None, language))
        return WRONG_SIZE

    monkeypatch.setattr(main.vision, "observe", fake_observe)
    assert post_check(client).json()["status"] == "checking"
    body = post_check(client).json()
    assert body["status"] == "warning"
    assert body["decided_by"] == "rules"
    assert calls[0] == (True, "step-2", True, "en")


def test_check_endpoint_answers_checking_while_busy(client, monkeypatch):
    monkeypatch.setattr(main.vision, "observe", lambda *_: pytest.fail("no model call while busy"))
    main.tracker.try_begin("run-1")
    body = post_check(client).json()
    assert body["status"] == "checking"


def test_check_endpoint_maps_model_errors(client, monkeypatch):
    def broken(*_):
        raise main.vision.VisionError("no answer")

    monkeypatch.setattr(main.vision, "observe", broken)
    assert post_check(client).status_code == 502
    assert main.tracker.try_begin("run-1")  # the run is free again after an error
