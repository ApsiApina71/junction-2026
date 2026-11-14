"""Step recognition (JUN-34): Owl knows which step the worker is doing, from the expert's own clips.

Each step of a process has a short clip of the expert doing it (Record, JUN-32). Every clip is turned into an
embedding once (a prototype per step). A short clip from the worker's glasses is embedded the same way and compared
with the prototypes (cosine similarity): the closest step is what the worker is doing. No labelling and no training.

Three embedders behind one interface:

- vjepa21 (the default for the demo): Meta's V-JEPA 2.1 ViT-B encoder (March 2026, 80M parameters, 384 px), made for
  dense, first-person video. Its code is in app/vjepa21 (MIT); the weights download once from Meta (1.6 GB, of which
  the encoder's 350 MB is kept in JEPA21_CHECKPOINT). With it, Owl uses Meta's own recipe for a frozen encoder: an
  attentive probe trained on the expert's clips (and on "other" clips: not doing any step), a few seconds per task.
  On the venue footage (JUN-103) it was right on 28 of 28 held-out windows with a median confidence of 0.86-0.94,
  where V-JEPA 2 SSv2 got 23 (prototype) and 27 (probe) of 28.
- vjepa2: Meta's V-JEPA 2 video model (facebook/vjepa2-vitl-fpc16-256-ssv2, MIT licence, 0.3B parameters) through
  Hugging Face transformers. It understands motion and hand-object actions from first-person video. Optional extra
  (`uv sync --extra jepa`); no login, key or cost. Runs on CUDA (a Verda GPU), Apple MPS or CPU.
- baseline: a tiny appearance-and-motion descriptor with no machine learning. The default, used in tests and CI, and
  the fallback when the model is not installed. It works on real video, but only for scenes that look alike.

Not monitoring: the similarity only says which step the worker is on. Owl never scores how well a person did it.
"""

import hashlib
import importlib.util
import io
import logging
import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import av
import numpy as np
from PIL import Image

from .models import Process

log = logging.getLogger("owl.jepa")

JEPA_BACKEND = os.getenv("JEPA_BACKEND", "baseline")
# The SSv2 checkpoint's attentive pooler was trained on hand-object actions ("putting something into something"), which
# is what work steps are. On real clips it beat the plain encoder's mean (65 % vs 55 % with one example, 80 % vs 65 %
# with three; JUN-34). The plain encoder (facebook/vjepa2-vitl-fpc64-256) still works.
JEPA_MODEL = os.getenv("JEPA_MODEL", "facebook/vjepa2-vitl-fpc16-256-ssv2")
# The best step must beat the second best by this much, or the answer is "unsure".
JEPA_MIN_MARGIN = float(os.getenv("JEPA_MIN_MARGIN", "0.02"))
# Evidence over time: a 2 s clip is short, so the last few clips of the same run (within JEPA_WINDOW_S) are averaged.
JEPA_ACCUMULATE = int(os.getenv("JEPA_ACCUMULATE", "3"))
JEPA_WINDOW_S = float(os.getenv("JEPA_WINDOW_S", "10"))
# Learning from confirmations: confirmed clips become extra examples of a step (embeddings only). 3 examples took the
# SSv2 embedding from 65 % to 80 % on real clips.
JEPA_MAX_EXAMPLES = int(os.getenv("JEPA_MAX_EXAMPLES", "8"))
# V-JEPA 2.1: Meta's checkpoint, and where its encoder is kept after the first download.
JEPA21_URL = os.getenv("JEPA21_URL", "https://dl.fbaipublicfiles.com/vjepa2/vjepa2_1_vitb_dist_vitG_384.pt")
JEPA21_CHECKPOINT = Path(os.getenv("JEPA21_CHECKPOINT", "~/.cache/owl/vjepa2_1_vitb_dist_vitG_384-ema_encoder.pt")).expanduser()
# The probe's answer counts only when the step has at least this probability; otherwise "unsure".
JEPA_MIN_PROB = float(os.getenv("JEPA_MIN_PROB", "0.6"))
# Clips of "not doing any step" (walking, talking at a desk, other work), so the probe can say "none of the steps".
JEPA_OTHER_DIR = os.getenv("JEPA_OTHER_DIR", "")
PROBE_STEPS = int(os.getenv("JEPA_PROBE_STEPS", "120"))


class ClipError(Exception):
    """The clip cannot be read."""


def decode_timed(data: bytes) -> tuple[list[np.ndarray], float]:
    """Every RGB frame of a clip and its frame rate."""
    try:
        with av.open(io.BytesIO(data)) as container:
            stream = container.streams.video[0]
            fps = float(stream.average_rate or 15)
            frames = [f.to_ndarray(format="rgb24") for f in container.decode(stream)]
    except (av.FFmpegError, IndexError, ValueError) as e:
        raise ClipError("Not a video clip this server can read.") from e
    if not frames:
        raise ClipError("The clip has no frames.")
    return frames, fps


def windows(frames: list[np.ndarray], fps: float, seconds: float = 2.0, count: int = 3) -> list[list[np.ndarray]]:
    """Up to `count` windows of `seconds` from a long clip, at a quarter, half and three quarters; a short clip whole.

    The worker sends about 2 s, so the expert's 5-10 s clip is looked at in pieces of the same length (JUN-34).
    """
    n = max(1, int(seconds * fps))
    if len(frames) < 1.5 * n:
        return [frames]
    out = []
    for share in np.linspace(0.25, 0.75, count):
        start = max(0, min(len(frames) - n, int(len(frames) * share) - n // 2))
        out.append(frames[start : start + n])
    return out


def decode_frames(data: bytes, max_frames: int = 64) -> list[np.ndarray]:
    """RGB frames (H x W x 3, uint8), sampled evenly to at most max_frames."""
    frames, _ = decode_timed(data)
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
    """Meta's V-JEPA 2. With a classification checkpoint (SSv2), the embedding is its attentive pooler's output and the
    top action label names what the clip shows; with the plain encoder, it is the mean of the patch features."""

    name = "vjepa2"

    def __init__(self, model_id: str = JEPA_MODEL) -> None:
        import torch  # optional extra
        from transformers import AutoConfig, AutoModel, AutoModelForVideoClassification, AutoVideoProcessor

        self.torch = torch
        self.device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
        self.processor = AutoVideoProcessor.from_pretrained(model_id)
        config = AutoConfig.from_pretrained(model_id)
        self.classifier = bool(getattr(config, "id2label", None)) and len(config.id2label) > 2
        loader = AutoModelForVideoClassification if self.classifier else AutoModel
        self.model = loader.from_pretrained(model_id).to(self.device).eval()
        self.frames_per_clip = 64 if "fpc64" in model_id else 16
        self.last_action: str | None = None

    def embed(self, frames: list[np.ndarray]) -> np.ndarray:
        idx = np.linspace(0, len(frames) - 1, self.frames_per_clip).round().astype(int)  # repeats frames of short clips
        video = self.torch.from_numpy(np.stack([frames[i] for i in idx])).permute(0, 3, 1, 2)  # T x C x H x W
        inputs = self.processor(video, return_tensors="pt").to(self.device)
        with self.torch.no_grad():
            if self.classifier:
                hidden = self.model.vjepa2(**inputs, skip_predictor=True).last_hidden_state
                pooled = self.model.pooler(hidden)
                pooled = pooled[0] if isinstance(pooled, tuple) else pooled
                label = int(self.model.classifier(pooled)[0].argmax())
                self.last_action = self.model.config.id2label[label].replace("[", "").replace("]", "")
                return _unit(pooled[0].float().cpu().numpy().ravel())
            features = self.model.get_vision_features(**inputs)  # 1 x tokens x dim
        return _unit(features.mean(dim=1).squeeze(0).float().cpu().numpy())


def _download_v21(target: Path) -> None:
    """Meta's V-JEPA 2.1 checkpoint once: keep only its encoder (ema_encoder), about 350 MB."""
    import torch  # optional extra

    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".download")
    log.info("Downloading V-JEPA 2.1 from %s (1.6 GB, once)", JEPA21_URL)
    torch.hub.download_url_to_file(JEPA21_URL, str(tmp), progress=False)
    try:
        state = torch.load(tmp, map_location="cpu", weights_only=True)
        encoder = {k.replace("module.", "").replace("backbone.", ""): v for k, v in state["ema_encoder"].items()}
        torch.save(encoder, target)
    finally:
        tmp.unlink(missing_ok=True)


class VJepa21Embedder:
    """Meta's V-JEPA 2.1 ViT-B encoder, frozen, with Meta's evaluation preprocessing (short side 438, centre crop 384,
    ImageNet normalisation, 16 frames). `embed` is the mean of its tokens; `tokens` feeds the attentive probe."""

    name = "vjepa21"
    frames_per_clip = 16
    crop = 384

    def __init__(self, checkpoint: Path = JEPA21_CHECKPOINT) -> None:
        import torch  # optional extra

        from .vjepa21 import vision_transformer as vit

        self.torch = torch
        self.device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
        if not checkpoint.is_file():
            _download_v21(checkpoint)
        # The arguments of Meta's hub entry point vjepa2_1_vit_base_384 (src/hub/backbones.py at the same commit).
        model = vit.vit_base(
            patch_size=16, img_size=(384, 384), num_frames=64, tubelet_size=2, use_sdpa=True, use_SiLU=False, wide_SiLU=True,
            uniform_power=False, use_rope=True, img_temporal_dim_size=1, interpolate_rope=True,
        )  # fmt: skip
        model.load_state_dict(torch.load(checkpoint, map_location="cpu", weights_only=True), strict=True)
        self.model = model.to(self.device).eval()
        self.mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1, 1)
        self.std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1, 1)
        self.last_action: str | None = None  # V-JEPA 2.1 has no action head

    def _video(self, frames: list[np.ndarray]):
        torch = self.torch
        idx = np.linspace(0, len(frames) - 1, self.frames_per_clip).round().astype(int)
        x = torch.from_numpy(np.stack([frames[i] for i in idx])).permute(3, 0, 1, 2).float() / 255.0  # C T H W
        h, w = x.shape[-2:]
        scale = int(self.crop * 256 / 224) / min(h, w)
        nh, nw = round(h * scale), round(w * scale)
        x = torch.nn.functional.interpolate(x.permute(1, 0, 2, 3), size=(nh, nw), mode="bilinear", align_corners=False).permute(1, 0, 2, 3)
        top, left = (nh - self.crop) // 2, (nw - self.crop) // 2
        x = x[:, :, top : top + self.crop, left : left + self.crop]
        return ((x - self.mean) / self.std).unsqueeze(0).to(self.device)

    def _encode(self, frames: list[np.ndarray]):
        with self.torch.no_grad():
            return self.model(self._video(frames))[0]  # tokens x dim

    def embed(self, frames: list[np.ndarray]) -> np.ndarray:
        return _unit(self._encode(frames).mean(0).float().cpu().numpy())

    def tokens(self, frames: list[np.ndarray]):
        """The tokens, 2 x 2 average-pooled in space (8 x 12 x 12 for a 2 s clip), for the probe."""
        t = self._encode(frames)
        g = round((t.shape[0] / 8) ** 0.5)
        grid = t.view(8, g, g, -1).permute(0, 3, 1, 2)
        return self.torch.nn.functional.avg_pool2d(grid, 2).permute(0, 2, 3, 1).reshape(-1, t.shape[-1]).float()


def train_probe(xs: list, ys: list[int], classes: int, steps: int = PROBE_STEPS):
    """Meta's attentive probe for a frozen encoder, small enough for a few clips: one learnable query cross-attends
    over the tokens, then a linear head. Token dropout (keep 75 %) and label smoothing keep it from learning one clip
    by heart. A few seconds on Apple MPS for one task."""
    import torch
    from torch import nn

    class AttentiveProbe(nn.Module):
        def __init__(self, dim: int, k: int) -> None:
            super().__init__()
            self.query = nn.Parameter(torch.randn(1, 1, dim) * 0.02)
            self.norm = nn.LayerNorm(dim)
            self.attn = nn.MultiheadAttention(dim, 8 if dim % 8 == 0 else 1, batch_first=True)
            self.head = nn.Sequential(nn.LayerNorm(dim), nn.Linear(dim, k))

        def forward(self, x):
            kv = self.norm(x)
            pooled, _ = self.attn(self.query.expand(len(x), -1, -1), kv, kv)
            return self.head(pooled[:, 0])

    torch.manual_seed(0)
    device = xs[0].device
    x = torch.stack(xs)
    y = torch.tensor(ys, device=device)
    model = AttentiveProbe(x.shape[-1], classes).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=0.1)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, steps)
    for _ in range(steps):
        idx = torch.randperm(len(y), device=device)[:32]
        batch = x[idx]
        keep = torch.rand(batch.shape[1], device=device).argsort()[: max(1, int(0.75 * batch.shape[1]))]
        loss = nn.functional.cross_entropy(model(batch[:, keep]), y[idx], label_smoothing=0.1)
        opt.zero_grad()
        loss.backward()
        opt.step()
        sched.step()
    return model.eval()


def clip_windows(frames: list[np.ndarray], fps: float, seconds: float = 2.0, stride: float = 1.0) -> list[list[np.ndarray]]:
    """2 s windows every second, like the worker's looks: the probe's training examples from one clip."""
    n = max(1, int(seconds * fps))
    if len(frames) <= n:
        return [frames]
    return [frames[s : s + n] for s in range(0, len(frames) - n + 1, max(1, int(stride * fps)))]


_embedder: ClipEmbedder | None = None
_embedder_lock = threading.Lock()


def embedder() -> ClipEmbedder:
    """The configured embedder; V-JEPA 2 falls back to the baseline when it is not installed."""
    global _embedder
    with _embedder_lock:
        if _embedder is None:
            if JEPA_BACKEND == "vjepa21":
                try:
                    _embedder = VJepa21Embedder()
                    log.info("Step recognition: V-JEPA 2.1 ViT-B with an attentive probe, on %s", _embedder.device)
                except Exception as e:  # noqa: BLE001 - missing extra, no network, out of memory: keep Owl working
                    log.warning("V-JEPA 2.1 is not available (%s); using the baseline", e)
            elif JEPA_BACKEND == "vjepa2":
                try:
                    _embedder = VJepa2Embedder()
                    log.info("Step recognition: V-JEPA 2 (%s) on %s", JEPA_MODEL, _embedder.device)
                except Exception as e:  # noqa: BLE001 - missing extra, no network, out of memory: keep Owl working
                    log.warning("V-JEPA 2 is not available (%s); using the baseline", e)
            if _embedder is None:
                _embedder = BaselineEmbedder()
        return _embedder


def backend_name() -> str:
    """What step recognition runs on, for /health, without loading the model: a missing extra means the baseline."""
    names = {"vjepa2": f"vjepa2 ({JEPA_MODEL})", "vjepa21": "vjepa21 (V-JEPA 2.1 ViT-B + attentive probe)"}
    if _embedder is not None:
        return names.get(_embedder.name, _embedder.name)
    if JEPA_BACKEND == "vjepa21" and importlib.util.find_spec("torch"):
        return names["vjepa21"][:-1] + ", loading)"
    if JEPA_BACKEND == "vjepa2" and importlib.util.find_spec("transformers") and importlib.util.find_spec("torch"):
        return f"vjepa2 ({JEPA_MODEL}, loading)"
    return "baseline"


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
    action: str | None = None  # what the clip shows, in V-JEPA 2's SSv2 action words, when that model is on

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "step_id": self.step_id,
            "similarities": self.similarities,
            "margin": self.margin,
            "backend": self.backend,
            "action": self.action,
        }


class Recognizer:
    """Prototypes per step, from the expert clips, cached in memory and on disk. With an embedder that gives tokens
    (V-JEPA 2.1), an attentive probe per task decides instead, trained on the expert clips and the "other" clips."""

    def __init__(self, cache_dir: Path, embed: ClipEmbedder | None = None, other_dir: Path | None = None) -> None:
        self.cache_dir = Path(cache_dir)
        self.other_dir = Path(other_dir) if other_dir else Path(JEPA_OTHER_DIR) if JEPA_OTHER_DIR else self.cache_dir.parent / "jepa-other"
        self._embed = embed
        self._lock = threading.Lock()
        self._train_lock = threading.Lock()
        self._memory: dict[str, np.ndarray] = {}
        self._recent: dict[str, list[tuple[float, np.ndarray]]] = {}  # run id -> recent query embeddings
        self._last: dict[str, tuple[str, np.ndarray]] = {}  # run id -> (process id, the last accumulated query)
        self._probes: dict[str, tuple[str, object, list[str]]] = {}  # process id -> (key, probe, classes)

    def other_clips(self) -> list[Path]:
        return sorted(p for p in self.other_dir.glob("*") if p.suffix.lower() in (".mp4", ".mov")) if self.other_dir.is_dir() else []

    def probe_for(self, process: Process, clips: dict[str, Path]) -> tuple[object, list[str]] | None:
        """The task's attentive probe: one class per step with a clip, plus "other" when there are other clips. Trained
        again only when a clip changes. None when the embedder gives no tokens or there are fewer than two classes."""
        if not hasattr(self.embed, "tokens"):
            return None
        by_class = {step.id: [clips[step.id]] for step in process.steps if step.id in clips}
        if others := self.other_clips():
            by_class["other"] = others
        if len(by_class) < 2:
            return None
        key = hashlib.sha256(
            "|".join(f"{c}:{hashlib.sha256(p.read_bytes()).hexdigest()[:16]}" for c, paths in by_class.items() for p in paths).encode()
        ).hexdigest()
        with self._train_lock:
            cached = self._probes.get(process.id)
            if cached and cached[0] == key:
                return cached[1], cached[2]
            start = time.monotonic()
            classes = list(by_class)
            xs, ys = [], []
            for i, c in enumerate(classes):
                for path in by_class[c]:
                    frames, fps = decode_timed(path.read_bytes())
                    for w in clip_windows(frames, fps):
                        xs.append(self.embed.tokens(w))
                        ys.append(i)
            probe = train_probe(xs, ys, len(classes))
            self._probes[process.id] = (key, probe, classes)
            log.info("Probe for %s: %d classes, %d windows, %.1f s", process.id, len(classes), len(xs), time.monotonic() - start)
            return probe, classes

    def _accumulate_probs(self, run_id: str | None, probs: np.ndarray) -> np.ndarray:
        """Like accumulate, for the probe: the mean of the run's last few answers within JEPA_WINDOW_S."""
        if not run_id or JEPA_ACCUMULATE <= 1:
            return probs
        now = time.monotonic()
        key = f"probe:{run_id}"
        with self._lock:
            recent = [(t, v) for t, v in self._recent.get(key, []) if now - t <= JEPA_WINDOW_S and len(v) == len(probs)][-(JEPA_ACCUMULATE - 1) :]
            recent.append((now, probs))
            self._recent[key] = recent
        return np.mean([v for _, v in recent], axis=0)

    @property
    def embed(self) -> ClipEmbedder:
        return self._embed or embedder()

    def prototype(self, clip: Path) -> np.ndarray:
        """The embedding of an expert clip. Keyed by the clip's bytes, so a new recording replaces the old one."""
        data = clip.read_bytes()
        key = f"{self.embed.name}-w3-{hashlib.sha256(data).hexdigest()[:20]}"
        with self._lock:
            if key in self._memory:
                return self._memory[key]
        path = self.cache_dir / f"{key}.npy"
        if path.is_file():
            vec = np.load(path)
        else:
            frames, fps = decode_timed(data)
            vec = _unit(np.mean([self.embed.embed(w) for w in windows(frames, fps)], axis=0))
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            np.save(path, vec)
        with self._lock:
            self._memory[key] = vec
        return vec

    def _examples_path(self, process_id: str, step_id: str) -> Path:
        safe = "".join(c if c.isalnum() or c in "-_" else "-" for c in f"{process_id}--{step_id}")
        return self.cache_dir / f"examples-{self.embed.name}-{safe}.npy"

    def with_examples(self, process_id: str, step_id: str, prototype: np.ndarray) -> np.ndarray:
        """The expert's prototype together with the confirmed examples of this step (learning from confirmations)."""
        path = self._examples_path(process_id, step_id)
        if not path.is_file():
            return prototype
        examples = np.load(path)
        return _unit(np.mean([prototype, *examples], axis=0))

    def confirm(self, run_id: str, process_id: str, step_id: str) -> bool:
        """The worker confirmed the step: the run's last look becomes one more example of it (an embedding, no video).

        Only an embedding is kept, never the clip, and it is not tied to the worker. At most JEPA_MAX_EXAMPLES per step.
        """
        with self._lock:
            last = self._last.get(run_id)
        if last is None or last[0] != process_id:
            return False
        path = self._examples_path(process_id, step_id)
        examples = list(np.load(path)) if path.is_file() else []
        examples = [*examples, last[1]][-JEPA_MAX_EXAMPLES:]
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        np.save(path, np.stack(examples))
        return True

    def accumulate(self, run_id: str | None, vec: np.ndarray, now: float | None = None) -> np.ndarray:
        """The mean of this run's last JEPA_ACCUMULATE query embeddings within JEPA_WINDOW_S: a longer look than 2 s."""
        if not run_id or JEPA_ACCUMULATE <= 1:
            return vec
        now = time.monotonic() if now is None else now
        with self._lock:
            recent = [(t, v) for t, v in self._recent.get(run_id, []) if now - t <= JEPA_WINDOW_S][-(JEPA_ACCUMULATE - 1) :]
            recent.append((now, vec))
            self._recent[run_id] = recent
            for key in [k for k, items in self._recent.items() if now - items[-1][0] > 10 * JEPA_WINDOW_S]:
                del self._recent[key]
        return _unit(np.mean([v for _, v in recent], axis=0))

    def recognize(self, process: Process, clips: dict[str, Path], data: bytes, min_margin: float = JEPA_MIN_MARGIN, run_id: str | None = None) -> Recognition:
        """clips: step id -> the expert clip on disk. Steps without a clip are not candidates."""
        if not clips:
            return Recognition("unsure", None, {}, 0.0, self.embed.name)
        probe = self.probe_for(process, clips)
        if probe is not None:
            return self._recognize_with_probe(process, probe, data, run_id)
        protos = {step.id: self.with_examples(process.id, step.id, self.prototype(clips[step.id])) for step in process.steps if step.id in clips}
        query = self.accumulate(run_id, self.embed.embed(decode_frames(data)))
        action = getattr(self.embed, "last_action", None)
        if run_id:
            with self._lock:
                self._last[run_id] = (process.id, query)
        sims = {sid: round(s, 4) for sid, s in centred_similarities(query, protos).items()}
        ranked = sorted(sims.items(), key=lambda kv: -kv[1])
        best, best_sim = ranked[0]
        margin = round(best_sim - (ranked[1][1] if len(ranked) > 1 else -1.0), 4)
        status = "ok" if margin >= min_margin else "unsure"
        return Recognition(status, best if status == "ok" else None, sims, margin, self.embed.name, action)

    def _recognize_with_probe(self, process: Process, probe: tuple[object, list[str]], data: bytes, run_id: str | None) -> Recognition:
        import torch

        model, classes = probe
        tokens = self.embed.tokens(decode_frames(data))
        with torch.no_grad():
            probs = torch.softmax(model(tokens[None]), -1)[0].float().cpu().numpy()
        probs = self._accumulate_probs(run_id, probs)
        if run_id:
            with self._lock:
                self._last[run_id] = (process.id, _unit(tokens.mean(0).float().cpu().numpy()))
        order = np.argsort(-probs)
        best = classes[int(order[0])]
        margin = round(float(probs[order[0]] - probs[order[1]]), 4)
        sims = {c: round(float(p), 4) for c, p in zip(classes, probs, strict=True) if c != "other"}
        status = "ok" if best != "other" and probs[order[0]] >= JEPA_MIN_PROB else "unsure"
        return Recognition(status, best if status == "ok" else None, sims, margin, f"{self.embed.name}+probe")
