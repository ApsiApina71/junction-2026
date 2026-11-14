"""Step recognition (JUN-34): the worker's clip finds the expert's step. Baseline embedder; V-JEPA 2 is optional."""

import io
from fractions import Fraction

import av
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import jepa, main
from app.models import Process
from app.progress import Progress
from app.store import FIXTURES, Store, load_fixture
from app.verifier import Tracker

PROCESS = Process.model_validate(load_fixture("process-pick-pack.json"))
COLOURS = {"step-1": (200, 120, 40), "step-2": (40, 160, 90), "step-3": (60, 80, 200), "step-4": (180, 50, 160), "step-5": (220, 210, 60)}


def scene_clip(step_id: str, seconds=1.0, fps=15, size=(160, 120), noise=0.0, shift=0, seed=0) -> bytes:
    """A stand-in for a step on video: its own scene colour and a hand-like block moving its own way."""
    rng = np.random.default_rng(seed)
    base = np.array(COLOURS[step_id], dtype=np.float32)
    n = int(seconds * fps)
    direction = list(COLOURS).index(step_id)
    buf = io.BytesIO()
    with av.open(buf, "w", format="mp4") as out:
        stream = out.add_stream("libx264", rate=fps)
        stream.width, stream.height, stream.pix_fmt = size[0], size[1], "yuv420p"
        stream.time_base = Fraction(1, fps)
        for i in range(n):
            img = np.tile(base, (size[1], size[0], 1))
            img[: size[1] // 3] *= 0.6  # a shelf edge
            x = (10 + shift + i * (2 + direction)) % (size[0] - 30)
            y = 40 + int(20 * np.sin(i / 3 + direction))
            img[y : y + 30, x : x + 30] = (240, 220, 200)  # the hand
            img += rng.normal(0, noise, img.shape)
            frame = av.VideoFrame.from_ndarray(np.clip(img, 0, 255).astype(np.uint8), format="rgb24")
            frame.pts = i
            out.mux(stream.encode(frame))
        out.mux(stream.encode())
    return buf.getvalue()


@pytest.fixture
def expert_clips(tmp_path):
    paths = {}
    for step_id in COLOURS:
        p = tmp_path / f"{step_id}.mp4"
        p.write_bytes(scene_clip(step_id, seed=1))
        paths[step_id] = p
    return paths


def test_the_worker_clip_finds_the_expert_step(tmp_path, expert_clips):
    recognizer = jepa.Recognizer(tmp_path / "cache", jepa.BaselineEmbedder())
    for step_id in COLOURS:
        worker = scene_clip(step_id, seconds=2.0, noise=12, shift=7, seed=2)
        result = recognizer.recognize(PROCESS, expert_clips, worker)
        assert (result.status, result.step_id, result.backend) == ("ok", step_id, "baseline"), result.similarities
        assert set(result.similarities) == set(COLOURS)


def test_prototypes_are_cached_on_disk(tmp_path, expert_clips):
    recognizer = jepa.Recognizer(tmp_path / "cache", jepa.BaselineEmbedder())
    recognizer.recognize(PROCESS, expert_clips, scene_clip("step-2"))
    assert len(list((tmp_path / "cache").glob("baseline-*.npy"))) == 5
    fresh = jepa.Recognizer(tmp_path / "cache", jepa.BaselineEmbedder())
    fresh._embed.embed = lambda frames: pytest.fail("prototype recomputed") if len(frames) == 15 else jepa.BaselineEmbedder().embed(frames)
    fresh.recognize(PROCESS, expert_clips, scene_clip("step-2", seconds=2.0))


def test_an_ambiguous_clip_is_unsure(tmp_path, expert_clips):
    same = {"step-1": expert_clips["step-1"], "step-2": expert_clips["step-1"]}
    result = jepa.Recognizer(tmp_path / "c", jepa.BaselineEmbedder()).recognize(PROCESS, same, scene_clip("step-1"))
    assert (result.status, result.step_id) == ("unsure", None)


def test_no_expert_clips_no_answer(tmp_path):
    result = jepa.Recognizer(tmp_path, jepa.BaselineEmbedder()).recognize(PROCESS, {}, scene_clip("step-1"))
    assert (result.status, result.step_id) == ("unsure", None)


def test_bad_clip(tmp_path, expert_clips):
    with pytest.raises(jepa.ClipError):
        jepa.Recognizer(tmp_path, jepa.BaselineEmbedder()).recognize(PROCESS, expert_clips, b"junk")


def test_vjepa2_falls_back_to_the_baseline_when_not_installed(monkeypatch):
    monkeypatch.setattr(jepa, "JEPA_BACKEND", "vjepa2")
    monkeypatch.setattr(jepa, "_embedder", None)

    def missing(*_a, **_k):
        raise ImportError("No module named 'torch'")

    monkeypatch.setattr(jepa, "VJepa2Embedder", missing)
    assert jepa.embedder().name == "baseline"
    monkeypatch.setattr(jepa, "_embedder", None)


# HTTP, with the fixture's own placeholder clips as the expert clips


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "tracker", Tracker())
    monkeypatch.setattr(main, "progress", Progress())
    monkeypatch.setattr(main, "recognizer", jepa.Recognizer(tmp_path / "jepa", jepa.BaselineEmbedder()))
    monkeypatch.setattr(main, "API_TOKEN", "")
    return TestClient(main.app)


def test_recognize_over_http(client):
    clip = (FIXTURES / "media/proc-pick-pack/step-4.mp4").read_bytes()
    r = client.post("/steps/recognize", data={"process_id": "proc-pick-pack"}, files={"clip": ("c.mp4", clip, "video/mp4")})
    body = r.json()
    assert r.status_code == 200
    assert body["step_id"] == "step-4" and body["backend"] == "baseline"
    assert set(body["similarities"]) == {"step-1", "step-2", "step-4", "step-5"}  # step 3 has no expert clip
    assert client.post("/steps/recognize", data={"process_id": "proc-pick-pack"}, files={"clip": ("c.mp4", b"junk", "video/mp4")}).status_code == 400
    assert client.post("/steps/recognize", data={"process_id": "nope"}, files={"clip": ("c.mp4", clip, "video/mp4")}).status_code == 404


def test_recognize_needs_consent(client):
    clip = (FIXTURES / "media/proc-pick-pack/step-4.mp4").read_bytes()
    r = client.post("/steps/recognize", data={"process_id": "proc-pick-pack", "employee_id": "emp-sami"}, files={"clip": ("c.mp4", clip, "video/mp4")})
    assert r.status_code == 403


def test_demo_mode_says_the_next_step_of_the_run(client, monkeypatch):
    monkeypatch.setattr(main, "DEMO", True)
    monkeypatch.setattr(main, "MOCK_CHECK", True)
    client.post("/employees/emp-sami/consent", json={"camera_checks": True})
    clip = (FIXTURES / "media/proc-pick-pack/step-4.mp4").read_bytes()

    def recognize():
        return client.post(
            "/steps/recognize", data={"process_id": "proc-pick-pack", "employee_id": "emp-sami"}, files={"clip": ("c.mp4", clip, "video/mp4")}
        ).json()

    assert recognize()["step_id"] == "step-1"
    for step in ("step-1", "step-2"):
        client.post(
            "/check",
            data={"process_id": "proc-pick-pack", "step_id": step, "run_id": "demo-run", "employee_id": "emp-sami", "final": "true"},
            files={"image": ("f.jpg", clip[:0] or _jpeg(), "image/jpeg")},
        )
    body = recognize()
    assert (body["status"], body["step_id"], body["backend"]) == ("ok", "step-3", "demo")


def _jpeg() -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (64, 48)).save(buf, format="JPEG")
    return buf.getvalue()
