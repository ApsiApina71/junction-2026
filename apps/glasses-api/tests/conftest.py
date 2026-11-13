import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main
from app.tracker import Tracker
from app.vision import FoodItem, Sighting


def jpeg(color: str = "orange", size: tuple[int, int] = (1600, 1200)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, format="JPEG")
    return out.getvalue()


def soup(same: bool = False, left: float = 1.0) -> Sighting:
    return Sighting(
        scene="my_food",
        title="salmon soup and rye bread",
        items=[
            FoodItem(name="salmon soup", grams=400, kcal=380, protein_g=24, carbs_g=28, fat_g=18),
            FoodItem(name="rye bread", grams=35, kcal=80, protein_g=3, carbs_g=15, fat_g=1),
        ],
        same_as_open_meal=same,
        portion_left=left,
    )


def bun() -> Sighting:
    return Sighting(
        scene="my_food",
        title="cinnamon bun",
        items=[FoodItem(name="cinnamon bun", grams=90, kcal=300, protein_g=6, carbs_g=45, fat_g=10)],
        same_as_open_meal=False,
        portion_left=1.0,
    )


def nothing(scene: str = "no_food") -> Sighting:
    return Sighting(scene=scene, title="", items=[], same_as_open_meal=False, portion_left=1.0)


class FakeVision:
    """Stands in for the model: returns the queued sightings in order and records what it was asked."""

    def __init__(self) -> None:
        self.queue: list[Sighting] = []
        self.calls: list[dict | None] = []
        self.frames: list[bytes] = []

    def __call__(self, frame: bytes, open_meal: dict | None = None) -> Sighting:
        self.frames.append(frame)
        self.calls.append(open_meal)
        return self.queue.pop(0) if self.queue else nothing()


@pytest.fixture
def tracker() -> Tracker:
    return Tracker(":memory:", language="en")


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeVision:
    vision = FakeVision()
    monkeypatch.setattr(main, "analyse", vision)
    monkeypatch.setattr(main, "tracker", Tracker(":memory:", language="en"))
    monkeypatch.setattr(main, "API_TOKEN", "")
    return vision


@pytest.fixture
def client(fake: FakeVision) -> TestClient:
    return TestClient(main.app)
