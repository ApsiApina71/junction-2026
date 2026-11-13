"""Turns a stream of sightings into a food log: one entry per meal, however many frames show it."""

import json
import os
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from .vision import SPEECH_LANGUAGE, Sighting

# A new meal is logged after this many "my_food" sightings inside PENDING_WINDOW, so a glance does not count.
CONFIRM_SIGHTINGS = int(os.getenv("CONFIRM_SIGHTINGS", "2"))
PENDING_WINDOW = timedelta(seconds=30)
# The open meal is closed when it has not been seen for this long. Until then, seeing it again never logs it twice.
MEAL_GAP = timedelta(seconds=int(os.getenv("MEAL_GAP_SECONDS", "1200")))
DAILY_KCAL_GOAL = int(os.getenv("DAILY_KCAL_GOAL", "0"))
TIMEZONE = ZoneInfo(os.getenv("TIMEZONE", "Europe/Helsinki"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    started_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    title TEXT NOT NULL,
    items TEXT NOT NULL,
    portion_left REAL NOT NULL DEFAULT 1.0,
    eaten_share REAL NOT NULL DEFAULT 1.0,
    is_open INTEGER NOT NULL DEFAULT 1,
    image BLOB
)
"""


@dataclass
class Outcome:
    event: str  # none | pending | logged | updated | closed
    say: str | None = None


def eaten_share(portion_left: float) -> float:
    """How much of a closed meal counts as eaten, given how much was left when it was last seen.

    Leftovers count only when the plate was seen partly eaten. A last view of an untouched plate means the
    glasses stopped watching, not that nothing was eaten, so the whole portion stays in the log.
    """
    if portion_left >= 0.9 or portion_left <= 0.15:
        return 1.0
    return round(1.0 - portion_left, 2)


def _kcal(items: list[dict]) -> float:
    return sum(i["kcal"] for i in items)


def _round10(value: float) -> int:
    return int(round(value / 10.0) * 10)


class Tracker:
    def __init__(self, db_path: str, language: str = SPEECH_LANGUAGE) -> None:
        if db_path != ":memory:":
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(db_path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._db.execute(SCHEMA)
        self._db.commit()
        self._lock = threading.Lock()
        self._language = language
        self._pending: list[datetime] = []
        self._queued_say: str | None = None
        # The latest thing worth showing on a display: a logged meal or a leftover correction. Not kept across restarts.
        self._last_event: dict | None = None

    # Reading

    def open_meal(self, now: datetime) -> dict | None:
        """The meal being eaten now, in the shape vision.analyse expects, or None."""
        with self._lock:
            self._close_if_stale(now)
            row = self._open_row()
            if row is None:
                return None
            return {"title": row["title"], "items": json.loads(row["items"]), "reference": row["image"]}

    def today(self, now: datetime) -> dict:
        with self._lock:
            self._close_if_stale(now)
            rows = self._db.execute("SELECT * FROM entries WHERE day = ? ORDER BY id DESC", (now.date().isoformat(),)).fetchall()
            last_event = self._last_event
        entries = []
        totals = {"kcal": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
        for row in rows:
            items = json.loads(row["items"])
            share = row["eaten_share"]
            for key in totals:
                totals[key] += sum(i[key] for i in items) * share
            entries.append(
                {
                    "id": row["id"],
                    "time": datetime.fromisoformat(row["started_at"]).strftime("%H:%M"),
                    "title": row["title"],
                    "kcal": round(_kcal(items) * share),
                    "kcal_served": round(_kcal(items)),
                    "eaten_share": share,
                    "portion_left": row["portion_left"],
                    "open": bool(row["is_open"]),
                    "items": items,
                }
            )
        result = {key: round(value) for key, value in totals.items()}
        return {
            "date": now.date().isoformat(),
            **result,
            "goal_kcal": DAILY_KCAL_GOAL or None,
            "summary": self._summary(result["kcal"], len(entries)),
            "lang": "fi-FI" if self._language == "fi" else "en-US",
            "last_event": last_event,
            "entries": entries,
        }

    def image(self, entry_id: int) -> bytes | None:
        with self._lock:
            row = self._db.execute("SELECT image FROM entries WHERE id = ?", (entry_id,)).fetchone()
        return row["image"] if row else None

    # Writing

    def observe(self, sighting: Sighting, frame: bytes, now: datetime) -> Outcome:
        """Apply one sighting. `frame` is kept as the meal's picture only if this sighting logs a new meal."""
        with self._lock:
            self._close_if_stale(now)
            queued, self._queued_say = self._queued_say, None
            open_row = self._open_row()

            if sighting.scene != "my_food" or not sighting.items:
                return Outcome("closed" if queued else "none", queued)

            if open_row is not None and sighting.same_as_open_meal:
                left = min(open_row["portion_left"], max(0.0, min(1.0, sighting.portion_left)))
                self._db.execute("UPDATE entries SET portion_left = ?, last_seen_at = ? WHERE id = ?", (left, now.isoformat(), open_row["id"]))
                self._db.commit()
                self._pending = []
                return Outcome("updated", queued)

            self._pending = [t for t in self._pending if now - t <= PENDING_WINDOW] + [now]
            if len(self._pending) < CONFIRM_SIGHTINGS:
                return Outcome("pending", queued)
            self._pending = []

            parts = [queued] if queued else []
            if open_row is not None:
                closing = self._close(open_row, now)
                if closing:
                    parts.append(closing)
            items = [i.model_dump() for i in sighting.items]
            self._db.execute(
                "INSERT INTO entries (day, started_at, last_seen_at, title, items, image) VALUES (?, ?, ?, ?, ?, ?)",
                (now.date().isoformat(), now.isoformat(), now.isoformat(), sighting.title, json.dumps(items), frame),
            )
            self._db.commit()
            say = self._say_logged(sighting.title, _kcal(items), self._total_kcal(now))
            self._last_event = {"at": now.isoformat(), "kind": "logged", "title": sighting.title, "kcal": round(_kcal(items)), "say": say}
            parts.append(say)
            return Outcome("logged", " ".join(parts))

    def delete(self, entry_id: int) -> bool:
        with self._lock:
            cursor = self._db.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
            self._db.commit()
            return cursor.rowcount > 0

    # Internals. Callers hold the lock.

    def _open_row(self) -> sqlite3.Row | None:
        return self._db.execute("SELECT * FROM entries WHERE is_open = 1 ORDER BY id DESC LIMIT 1").fetchone()

    def _close_if_stale(self, now: datetime) -> None:
        row = self._open_row()
        if row is not None and now - datetime.fromisoformat(row["last_seen_at"]) > MEAL_GAP:
            say = self._close(row, now)
            if say:
                self._queued_say = say

    def _close(self, row: sqlite3.Row, now: datetime) -> str | None:
        """Close a meal. Returns a sentence to speak if leftovers changed what was logged."""
        share = eaten_share(row["portion_left"])
        self._db.execute("UPDATE entries SET is_open = 0, eaten_share = ? WHERE id = ?", (share, row["id"]))
        self._db.commit()
        if share >= 1.0:
            return None
        eaten = _kcal(json.loads(row["items"])) * share
        if self._language == "fi":
            say = f"{row['title']}: osa jäi syömättä. Korjattu {_round10(eaten)} kilokaloriin."
        else:
            say = f"You left part of the {row['title']}. Adjusted to {_round10(eaten)} calories."
        self._last_event = {"at": now.isoformat(), "kind": "adjusted", "title": row["title"], "kcal": round(eaten), "say": say}
        return say

    def _total_kcal(self, now: datetime) -> float:
        rows = self._db.execute("SELECT items, eaten_share FROM entries WHERE day = ?", (now.date().isoformat(),)).fetchall()
        return sum(_kcal(json.loads(r["items"])) * r["eaten_share"] for r in rows)

    def _say_logged(self, title: str, kcal: float, total: float) -> str:
        if self._language == "fi":
            return f"Kirjattu: {title}, noin {_round10(kcal)} kilokaloria. Tänään yhteensä {_round10(total)}."
        return f"Logged {title}, about {_round10(kcal)} calories. {_round10(total)} today."

    def _summary(self, kcal: int, meals: int) -> str:
        if self._language == "fi":
            text = f"Tänään {kcal} kilokaloria, aterioita {meals}."
            if DAILY_KCAL_GOAL:
                text += f" Tavoitteesta jäljellä {max(0, DAILY_KCAL_GOAL - kcal)}."
            return text
        text = f"{kcal} calories today from {meals} {'meal' if meals == 1 else 'meals'}."
        if DAILY_KCAL_GOAL:
            text += f" {max(0, DAILY_KCAL_GOAL - kcal)} left of your goal."
        return text
