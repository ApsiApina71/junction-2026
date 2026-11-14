"""Step recognition (JUN-34): Owl knows which step the worker is doing, from the expert's own clips.

Each step of a process has a short clip of the expert doing it (Record, JUN-32). Every clip is turned into an
embedding once (a prototype per step). A short clip from the worker's glasses is embedded the same way and compared
with the prototypes (cosine similarity): the closest step is what the worker is doing. No labelling and no training.

Two embedders behind one interface:

- vjepa2: Meta's V-JEPA 2 video encoder (facebook/vjepa2-vitl-fpc64-256, MIT licence, 0.3B parameters) through Hugging
  Face transformers. It understands motion and hand-object actions from first-person video. Optional extra
  (`uv sync --extra jepa`); no login, key or cost. Runs on CUDA (a Verda GPU), Apple MPS or CPU.
- baseline: a tiny appearance-and-motion descriptor with no machine learning. The default, used in tests and CI, and
  the fallback when the model is not installed. It works on real video, but only for scenes that look alike.

Not monitoring: the similarity only says which step the worker is on. Owl never scores how well a person did it.
"""

import hashlib
import io
import logging
import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import av
import numpy as np
from PIL import Image

from .models import Process

log = logging.getLogger("owl.jepa")

JEPA_BACKEND = os.getenv("JEPA_BACKEND", "baseline")
JEPA_MODEL = os.getenv("JEPA_MODEL", "facebook/vjepa2-vitl-fpc64-256")
# The best step must beat the second best by this much, or the answer is "unsure".
JEPA_MIN_MARGIN = float(os.getenv("JEPA_MIN_MARGIN", "0.02"))


class ClipError(Exception):
    """The clip cannot be read."""


def decode_frames(data: bytes, max_frames: int = 64) -> list[np.ndarray]:
    """RGB frames (H x W x 3, uint8), sampled evenly to at most max_frames."""
    try:
        with av.open(io.BytesIO(data)) as container:
            stream = container.streams.video[0]
            frames = [f.to_ndarray(format="rgb24") for f in container.decode(stream)]
    except (av.FFmpegError, IndexError, ValueError) as e:
        raise ClipError("Not a video clip this server can read.") from e
    if not frames:
        raise ClipError("The clip has no frames.")
    if len(frames) > max_frames:
        idx = np.linspace(0, len(frames) - 1, max_frames).round().astype(int)
        frames = [frames[i] for i in idx]
    return frames


class ClipEmbedder(Protocol):
    name: str

    def embed(self, frames: list[np.ndarray]) -> np.ndarray: ...


def _unit(v: np.ndarray) -> np.ndarray:
    v = v.astype(np.float32).ravel()
    n = float(np.linalg.norm(v))
    return v / n if n > 0 else v


class BaselineEmbedder:
    """Appearance (a coarse colour layout and a hue histogram) and motion (how much the view changes), over 8 frames."""

    name = "baseline"

    def embed(self, frames: list[np.ndarray]) -> np.ndarray:
        idx = np.linspace(0, len(frames) - 1, 8).round().astype(int)
        small = [np.asarray(Image.fromarray(frames[i]).convert("RGB").resize((16, 12)), dtype=np.float32) / 255.0 for i in idx]
        layout = np.mean(small, axis=0)  # 12 x 16 x 3: where the colours are
        hsv = [np.asarray(Image.fromarray(frames[i]).convert("HSV").resize((32, 24)), dtype=np.float32) for i in idx]
        hue = np.histogram(np.concatenate([h[..., 0].ravel() for h in hsv]), bins=12, range=(0, 255))[0].astype(np.float32)
        hue /= max(1.0, hue.sum())
        motion = np.array([np.abs(small[i + 1] - small[i]).mean() for i in range(len(small) - 1)], dtype=np.float32)
        return _unit(np.concatenate([_unit(layout - layout.mean()) * 0.6, _unit(hue) * 0.3, _unit(motion + 1e-6) * 0.1]))


class VJepa2Embedder:
    """Meta's V-JEPA 2 encoder. Mean-pooled patch features of 64 frames at 256 px."""

    name = "vjepa2"

    def __init__(self, model_id: str = JEPA_MODEL) -> None:
        import torch  # optional extra
        from transformers import AutoModel, AutoVideoProcessor

        self.torch = torch
        self.device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
        self.processor = AutoVideoProcessor.from_pretrained(model_id)
        self.model = AutoModel.from_pretrained(model_id).to(self.device).eval()
        self.frames_per_clip = 64 if "fpc64" in model_id else 16

    def embed(self, frames: list[np.ndarray]) -> np.ndarray:
        idx = np.linspace(0, len(frames) - 1, self.frames_per_clip).round().astype(int)  # repeats frames of short clips
        video = self.torch.from_numpy(np.stack([frames[i] for i in idx])).permute(0, 3, 1, 2)  # T x C x H x W
        inputs = self.processor(video, return_tensors="pt").to(self.device)
        with self.torch.no_grad():
            features = self.model.get_vision_features(**inputs)  # 1 x tokens x dim
        return _unit(features.mean(dim=1).squeeze(0).float().cpu().numpy())


_embedder: ClipEmbedder | None = None
_embedder_lock = threading.Lock()


def embedder() -> ClipEmbedder:
    """The configured embedder; V-JEPA 2 falls back to the baseline when it is not installed."""
    global _embedder
    with _embedder_lock:
        if _embedder is None:
            if JEPA_BACKEND == "vjepa2":
                try:
                    _embedder = VJepa2Embedder()
                    log.info("Step recognition: V-JEPA 2 (%s) on %s", JEPA_MODEL, _embedder.device)
                except Exception as e:  # noqa: BLE001 - missing extra, no network, out of memory: keep Owl working
                    log.warning("V-JEPA 2 is not available (%s); using the baseline", e)
            if _embedder is None:
                _embedder = BaselineEmbedder()
        return _embedder


def centred_similarities(query: np.ndarray, protos: dict[str, np.ndarray]) -> dict[str, float]:
    """Cosine similarity after removing what all the step prototypes share.

    Mean-pooled video features have a large common part (the same workplace, the same camera), so every raw cosine
    is close (about 0.75 for V-JEPA 2). Subtracting the prototypes' mean leaves what tells the steps apart. With fewer
    than three steps the mean would be one of them, so the raw cosine is used.
    """
    if len(protos) < 3:
        return {k: float(np.dot(query, v)) for k, v in protos.items()}
    centre = np.mean(list(protos.values()), axis=0)
    q = _unit(query - centre)
    return {k: float(np.dot(q, _unit(v - centre))) for k, v in protos.items()}


@dataclass
class Recognition:
    status: str  # ok | unsure
    step_id: str | None
    similarities: dict[str, float]
    margin: float
    backend: str

    def to_dict(self) -> dict:
        return {"status": self.status, "step_id": self.step_id, "similarities": self.similarities, "margin": self.margin, "backend": self.backend}


class Recognizer:
    """Prototypes per step, from the expert clips, cached in memory and on disk."""

    def __init__(self, cache_dir: Path, embed: ClipEmbedder | None = None) -> None:
        self.cache_dir = Path(cache_dir)
        self._embed = embed
        self._lock = threading.Lock()
        self._memory: dict[str, np.ndarray] = {}

    @property
    def embed(self) -> ClipEmbedder:
        return self._embed or embedder()

    def prototype(self, clip: Path) -> np.ndarray:
        """The embedding of an expert clip. Keyed by the clip's bytes, so a new recording replaces the old one."""
        data = clip.read_bytes()
        key = f"{self.embed.name}-{hashlib.sha256(data).hexdigest()[:20]}"
        with self._lock:
            if key in self._memory:
                return self._memory[key]
        path = self.cache_dir / f"{key}.npy"
        if path.is_file():
            vec = np.load(path)
        else:
            vec = self.embed.embed(decode_frames(data))
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            np.save(path, vec)
        with self._lock:
            self._memory[key] = vec
        return vec

    def recognize(self, process: Process, clips: dict[str, Path], data: bytes, min_margin: float = JEPA_MIN_MARGIN) -> Recognition:
        """clips: step id -> the expert clip on disk. Steps without a clip are not candidates."""
        if not clips:
            return Recognition("unsure", None, {}, 0.0, self.embed.name)
        query = self.embed.embed(decode_frames(data))
        protos = {step.id: self.prototype(clips[step.id]) for step in process.steps if step.id in clips}
        sims = {sid: round(s, 4) for sid, s in centred_similarities(query, protos).items()}
        ranked = sorted(sims.items(), key=lambda kv: -kv[1])
        best, best_sim = ranked[0]
        margin = round(best_sim - (ranked[1][1] if len(ranked) > 1 else -1.0), 4)
        status = "ok" if margin >= min_margin else "unsure"
        return Recognition(status, best if status == "ok" else None, sims, margin, self.embed.name)
