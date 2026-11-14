"""Place recognition (JUN-97): Owl knows from the camera picture that the worker has reached a step's place.

No markers. Each step with a checkpoint has pictures of its place: the expert's photo of the step from the recording,
and any place photos added in Studio. Every other step photo of the worker's tasks is a place too, so there is
always something else the picture could look like. A look matches the target when

1. the target is the closest of all known places, and
2. its similarity is at least PLACE_MIN_SIM,

and the step opens after PLACE_LOOKS matching looks in a row within PLACE_WINDOW_S seconds.

Measured on a stand-in (20 Kinetics videos as 20 places; the expert photo at 10 % of a video, the worker's look later
in it, from another angle): DINOv2-small picks the right place in 90 % of looks, the baseline in 83 %. A warehouse
whose aisles look alike is harder; measure on the real place before relying on it. Two looks in a row cut wrong
opens, and the trainer or a Help call can always open a step by hand.

The camera picture is never stored: it is turned into a row of numbers, compared, and dropped. Nothing leaves the
server.
"""

import hashlib
import io
import logging
import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np
from PIL import Image

from .models import Employee, Process, Step

log = logging.getLogger("owl.place")

# auto: DINOv2 when the optional extra is installed (uv sync --extra jepa), otherwise the baseline.
PLACE_BACKEND = os.getenv("PLACE_BACKEND", "auto")
PLACE_MODEL = os.getenv("PLACE_MODEL", "facebook/dinov2-small")
PLACE_LOOKS = int(os.getenv("PLACE_LOOKS", "2"))
PLACE_WINDOW_S = float(os.getenv("PLACE_WINDOW_S", "10"))
# The lowest similarity to the target place that still counts as a look at it. Per backend: their scales differ.
MIN_SIM = {"dinov2": float(os.getenv("PLACE_MIN_SIM_DINOV2", "0.65")), "baseline": float(os.getenv("PLACE_MIN_SIM_BASELINE", "0.6"))}


def _unit(v: np.ndarray) -> np.ndarray:
    v = v.astype(np.float32).ravel()
    n = float(np.linalg.norm(v))
    return v / n if n > 0 else v


class ImageEmbedder(Protocol):
    name: str

    def embed(self, image: Image.Image) -> np.ndarray: ...


class BaselineEmbedder:
    """A coarse colour layout and a hue histogram. Works without extra packages; tells apart rooms, not aisles."""

    name = "baseline"

    def embed(self, image: Image.Image) -> np.ndarray:
        rgb = image.convert("RGB")
        small = np.asarray(rgb.resize((16, 12)), dtype=np.float32) / 255.0
        hue = np.histogram(np.asarray(rgb.convert("HSV").resize((32, 24)))[..., 0], bins=12, range=(0, 255))[0].astype(np.float32)
        return _unit(np.concatenate([_unit(small - small.mean()) * 0.7, _unit(hue) * 0.3]))


class DinoEmbedder:
    """Meta's DINOv2: the class token and a GeM pool of the patch features, a common place-recognition descriptor."""

    name = "dinov2"

    def __init__(self, model_id: str = PLACE_MODEL) -> None:
        import torch  # optional extra
        from transformers import AutoImageProcessor, AutoModel

        self.torch = torch
        self.device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
        self.processor = AutoImageProcessor.from_pretrained(model_id)
        self.model = AutoModel.from_pretrained(model_id).to(self.device).eval()

    def embed(self, image: Image.Image) -> np.ndarray:
        torch = self.torch
        with torch.no_grad():
            hidden = self.model(**self.processor(images=image.convert("RGB"), return_tensors="pt").to(self.device)).last_hidden_state[0]
        cls = torch.nn.functional.normalize(hidden[0], dim=0)
        gem = torch.nn.functional.normalize(hidden[1:].clamp(min=1e-6).pow(3).mean(0).pow(1 / 3), dim=0)
        return _unit(torch.cat([cls, gem]).float().cpu().numpy())


_embedder: ImageEmbedder | None = None
_embedder_lock = threading.Lock()


def embedder() -> ImageEmbedder:
    global _embedder
    with _embedder_lock:
        if _embedder is None:
            if PLACE_BACKEND in {"auto", "dinov2"}:
                try:
                    _embedder = DinoEmbedder()
                    log.info("Place recognition: DINOv2 (%s)", PLACE_MODEL)
                except Exception as e:  # noqa: BLE001 - missing extra, no network: keep Owl working
                    log.warning("DINOv2 is not available (%s); place recognition uses the baseline", e)
            if _embedder is None:
                _embedder = BaselineEmbedder()
        return _embedder


@dataclass
class Look:
    """What one camera picture says about the target place."""

    matched: bool
    score: float
    best: str | None  # the closest known place
    backend: str


@dataclass
class _Streak:
    key: str
    count: int
    last: float


def target_key(process_id: str, step_id: str) -> str:
    return f"{process_id}:{step_id}"


class Places:
    """The known places and each worker's run of matching looks. Embeddings of place photos are cached by content."""

    def __init__(self, embed: ImageEmbedder | None = None) -> None:
        self._embed = embed
        self._lock = threading.Lock()
        self._cache: dict[str, np.ndarray] = {}
        self._streaks: dict[str, _Streak] = {}

    @property
    def backend(self) -> ImageEmbedder:
        if self._embed is None:
            self._embed = embedder()
        return self._embed

    def _photo(self, path: Path) -> np.ndarray | None:
        try:
            data = path.read_bytes()
        except OSError:
            return None
        key = hashlib.sha1(data).hexdigest() + self.backend.name
        with self._lock:
            if key in self._cache:
                return self._cache[key]
        try:
            vec = self.backend.embed(Image.open(io.BytesIO(data)))
        except Exception:  # noqa: BLE001 - a broken photo is no place
            return None
        with self._lock:
            self._cache[key] = vec
        return vec

    def gallery(self, processes: list[Process], media_path) -> dict[str, list[np.ndarray]]:
        """Place key -> photo embeddings. A step with a checkpoint is a place; so is every other step photo."""
        found: dict[str, list[np.ndarray]] = {}
        for process in processes:
            for step in process.steps:
                urls = place_photos(step)
                vecs = [
                    v for v in (self._photo(p) for p in (media_path(u.removeprefix("/media/")) for u in urls if u.startswith("/media/")) if p) if v is not None
                ]
                if vecs:
                    found[target_key(process.id, step.id)] = vecs
        return found

    def look(self, worker: str, target: str, frame: bytes, gallery: dict[str, list[np.ndarray]], now: float | None = None) -> tuple[Look, bool]:
        """Compares one camera picture with the places. Returns the look and whether the target is reached now."""
        now = time.monotonic() if now is None else now
        if target not in gallery:
            return Look(False, 0.0, None, self.backend.name), False
        query = self.backend.embed(Image.open(io.BytesIO(frame)))
        scores = {key: max(float(np.dot(query, v)) for v in vecs) for key, vecs in gallery.items()}
        best = max(scores, key=scores.get)
        matched = best == target and scores[target] >= MIN_SIM.get(self.backend.name, 0.6)
        return Look(matched, round(scores[target], 3), best, self.backend.name), self.count(worker, target, matched, now)

    def count(self, worker: str, target: str, matched: bool, now: float) -> bool:
        """PLACE_LOOKS matching looks in a row, within PLACE_WINDOW_S, reach the place."""
        with self._lock:
            streak = self._streaks.get(worker)
            if not matched:
                self._streaks.pop(worker, None)
                return False
            if streak and streak.key == target and now - streak.last <= PLACE_WINDOW_S:
                streak.count += 1
                streak.last = now
            else:
                streak = self._streaks[worker] = _Streak(target, 1, now)
            if streak.count >= PLACE_LOOKS:
                self._streaks.pop(worker, None)
                return True
            return False

    def forget(self, worker: str) -> None:
        with self._lock:
            self._streaks.pop(worker, None)


def place_photos(step: Step) -> list[str]:
    """The pictures of a step's place: the expert's photo of the step, then the photos added in Studio."""
    urls = [step.reference_image_url] if step.reference_image_url else []
    if step.checkpoint:
        urls += [u for u in step.checkpoint.photo_urls if u not in urls]
    return urls


def worker_processes(processes: dict[str, Process], employee: Employee) -> list[Process]:
    return [processes[p] for p in employee.process_ids if p in processes]
