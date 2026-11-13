from datetime import datetime, timedelta

from app.tracker import MEAL_GAP, TIMEZONE, eaten_share

from .conftest import bun, jpeg, nothing, soup

T0 = datetime(2026, 11, 14, 12, 0, tzinfo=TIMEZONE)
FRAME = jpeg()


def at(seconds: float) -> datetime:
    return T0 + timedelta(seconds=seconds)


def test_a_glance_is_not_logged(tracker):
    assert tracker.observe(soup(), FRAME, at(0)).event == "pending"
    assert tracker.today(at(1))["entries"] == []


def test_a_meal_is_logged_on_the_second_sighting_and_spoken(tracker):
    tracker.observe(soup(), FRAME, at(0))
    outcome = tracker.observe(soup(), FRAME, at(3))
    assert outcome.event == "logged"
    assert outcome.say == "Logged salmon soup and rye bread, about 460 calories. 460 today."
    today = tracker.today(at(4))
    assert today["kcal"] == 460
    assert today["protein_g"] == 27
    assert [e["title"] for e in today["entries"]] == ["salmon soup and rye bread"]
    assert today["entries"][0]["open"] is True


def test_two_sightings_far_apart_do_not_confirm_each_other(tracker):
    tracker.observe(soup(), FRAME, at(0))
    assert tracker.observe(soup(), FRAME, at(120)).event == "pending"


def test_looking_away_between_sightings_still_confirms(tracker):
    tracker.observe(soup(), FRAME, at(0))
    tracker.observe(nothing(), FRAME, at(3))
    assert tracker.observe(soup(), FRAME, at(6)).event == "logged"


def test_the_same_meal_is_logged_once_however_often_it_is_seen(tracker):
    tracker.observe(soup(), FRAME, at(0))
    tracker.observe(soup(), FRAME, at(3))
    for i in range(20):
        assert tracker.observe(soup(same=True, left=1 - i / 20), FRAME, at(6 + 3 * i)).event == "updated"
    today = tracker.today(at(100))
    assert len(today["entries"]) == 1
    assert today["kcal"] == 460


def test_food_that_is_not_the_wearers_is_ignored(tracker):
    for i in range(5):
        assert tracker.observe(nothing("other_food"), FRAME, at(3 * i)).event == "none"
    assert tracker.today(at(60))["kcal"] == 0


def test_the_open_meal_is_handed_to_the_model_with_its_reference_picture(tracker):
    assert tracker.open_meal(at(0)) is None
    tracker.observe(soup(), FRAME, at(0))
    tracker.observe(soup(), FRAME, at(3))
    context = tracker.open_meal(at(6))
    assert context["title"] == "salmon soup and rye bread"
    assert context["reference"] == FRAME
    assert [i["name"] for i in context["items"]] == ["salmon soup", "rye bread"]


def test_a_different_meal_closes_the_first_and_is_added(tracker):
    tracker.observe(soup(), FRAME, at(0))
    tracker.observe(soup(), FRAME, at(3))
    tracker.observe(bun(), FRAME, at(600))
    outcome = tracker.observe(bun(), FRAME, at(603))
    assert outcome.say == "Logged cinnamon bun, about 300 calories. 760 today."
    today = tracker.today(at(610))
    assert [(e["title"], e["open"]) for e in today["entries"]] == [("cinnamon bun", True), ("salmon soup and rye bread", False)]


def test_leftovers_reduce_what_is_logged_when_the_meal_closes(tracker):
    tracker.observe(soup(), FRAME, at(0))
    tracker.observe(soup(), FRAME, at(3))
    tracker.observe(soup(same=True, left=0.5), FRAME, at(300))
    later = at(300) + MEAL_GAP + timedelta(seconds=1)
    outcome = tracker.observe(nothing(), FRAME, later)
    assert outcome.event == "closed"
    assert outcome.say == "You left part of the salmon soup and rye bread. Adjusted to 230 calories."
    entry = tracker.today(later)["entries"][0]
    assert (entry["open"], entry["eaten_share"], entry["kcal"], entry["kcal_served"]) == (False, 0.5, 230, 460)


def test_portion_left_never_goes_back_up(tracker):
    tracker.observe(soup(), FRAME, at(0))
    tracker.observe(soup(), FRAME, at(3))
    tracker.observe(soup(same=True, left=0.4), FRAME, at(60))
    tracker.observe(soup(same=True, left=0.8), FRAME, at(63))
    assert tracker.today(at(70))["entries"][0]["portion_left"] == 0.4


def test_eaten_share():
    assert eaten_share(1.0) == 1.0  # never seen partly eaten: assume the portion was eaten
    assert eaten_share(0.5) == 0.5
    assert eaten_share(0.3) == 0.7
    assert eaten_share(0.1) == 1.0  # scraps do not count as leftovers


def test_entries_belong_to_the_day_they_were_logged(tracker):
    tracker.observe(soup(), FRAME, at(0))
    tracker.observe(soup(), FRAME, at(3))
    tomorrow = T0 + timedelta(days=1)
    assert tracker.today(tomorrow)["entries"] == []
    assert tracker.today(tomorrow)["kcal"] == 0


def test_delete_removes_an_entry(tracker):
    tracker.observe(soup(), FRAME, at(0))
    tracker.observe(soup(), FRAME, at(3))
    entry_id = tracker.today(at(4))["entries"][0]["id"]
    assert tracker.delete(entry_id) is True
    assert tracker.delete(entry_id) is False
    assert tracker.today(at(5))["kcal"] == 0


def test_finnish_sentences():
    from app.tracker import Tracker

    tracker = Tracker(":memory:", language="fi")
    tracker.observe(soup(), FRAME, at(0))
    outcome = tracker.observe(soup(), FRAME, at(3))
    assert outcome.say == "Kirjattu: salmon soup and rye bread, noin 460 kilokaloria. Tänään yhteensä 460."
    assert tracker.today(at(4))["lang"] == "fi-FI"


def test_the_latest_event_is_kept_for_a_display(tracker):
    assert tracker.today(at(0))["last_event"] is None
    tracker.observe(soup(), FRAME, at(0))
    tracker.observe(soup(), FRAME, at(3))
    event = tracker.today(at(4))["last_event"]
    assert (event["kind"], event["title"], event["kcal"]) == ("logged", "salmon soup and rye bread", 460)
    assert event["say"] == "Logged salmon soup and rye bread, about 460 calories. 460 today."

    tracker.observe(soup(same=True, left=0.5), FRAME, at(300))
    later = at(300) + MEAL_GAP + timedelta(seconds=1)
    event = tracker.today(later)["last_event"]
    assert (event["kind"], event["title"], event["kcal"]) == ("adjusted", "salmon soup and rye bread", 230)
