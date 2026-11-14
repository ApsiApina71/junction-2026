"""Record (JUN-32) and the media helpers: clip conversion, face blurring, the last frame of a clip."""

import io
from fractions import Fraction
from types import SimpleNamespace

import av
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main, media, record
from app.models import RecordedStep, Recording
from app.record import ProcessDraft, StepDraft
from app.store import Store


def make_clip(codec="libx265", size=(720, 540), seconds=2.0, fps=24, container="mp4") -> bytes:
    """A test clip like the glasses send: HEVC (hvc1) 720x540 by default. The last frame is white."""
    buf = io.BytesIO()
    with av.open(buf, "w", format=container) as out:
        stream = out.add_stream(codec, rate=fps)
        stream.width, stream.height, stream.pix_fmt = size[0], size[1], "yuv420p"
        stream.time_base = Fraction(1, fps)
        if codec == "libx265":
            stream.codec_tag = "hvc1"
            stream.options = {"x265-params": "log-level=none"}
        frames = int(seconds * fps)
        for i in range(frames):
            value = 255 if i == frames - 1 else 40
            frame = av.VideoFrame.from_ndarray(np.full((size[1], size[0], 3), value, dtype=np.uint8), format="rgb24")
            frame.pts = i
            out.mux(stream.encode(frame))
        out.mux(stream.encode())
    return buf.getvalue()


def probe(data: bytes) -> tuple[str, int, int, float, int]:
    with av.open(io.BytesIO(data)) as c:
        s = c.streams.video[0]
        frames = sum(1 for _ in c.decode(s))
        return s.codec_context.name, s.width, s.height, float(c.duration or 0) / 1e6, frames


# Media


def test_hevc_clip_becomes_a_display_sized_h264_mp4():
    out = media.transcode_clip(make_clip(), blur=False)
    codec, w, h, _, frames = probe(out)
    assert codec == "h264"
    assert (w, h) == (304, 228)  # 720x540 scaled into 400 px per side and 70 000 pixels
    assert w * h <= 70_000
    assert 28 <= frames <= 31  # 2 s at 15 fps
    assert out.find(b"moov") < out.find(b"mdat")  # faststart: playable while it downloads


def test_long_clips_are_cut_to_ten_seconds():
    *_, frames = probe(media.transcode_clip(make_clip(codec="libx264", size=(352, 198), seconds=12, fps=15), blur=False))
    assert frames <= media.MAX_CLIP_SECONDS * media.CLIP_FPS + 1


def test_mov_and_portrait_clips():
    _, w, h, _, _ = probe(media.transcode_clip(make_clip(codec="libx264", size=(504, 896), seconds=0.5, container="mov"), blur=False))
    assert (w, h) == (198, 352)


def test_not_a_video():
    with pytest.raises(media.MediaError):
        media.transcode_clip(b"definitely not a video")
    with pytest.raises(media.MediaError):
        media.last_frame(b"")


def test_last_frame_of_an_hevc_clip():
    jpeg = media.last_frame(make_clip(seconds=1.0))
    with Image.open(io.BytesIO(jpeg)) as img:
        assert img.size == (720, 540)
        assert img.convert("L").getpixel((360, 270)) > 200  # the white last frame, not an earlier dark one


def first_packet_only(data: bytes, duration: int | None = None) -> bytes:
    """A one-frame clip as the glasses send it: hvc1 passthrough of the first (key) frame, remuxed without decoding."""
    buf = io.BytesIO()
    with av.open(io.BytesIO(data)) as src, av.open(buf, "w", format="mp4") as out:
        stream = out.add_stream_from_template(src.streams.video[0])
        packet = next(p for p in src.demux(src.streams.video[0]) if p.size)
        packet.stream = stream
        if duration is not None:
            packet.duration = duration
        out.mux(packet)
    return buf.getvalue()


@pytest.mark.parametrize("codec", ["libx265", "libx264"])
@pytest.mark.parametrize("duration", [None, 0])
def test_last_frame_of_a_one_frame_clip(codec, duration):
    one = first_packet_only(make_clip(codec=codec, seconds=0.5), duration)
    with av.open(io.BytesIO(one)) as c:
        assert sum(1 for p in c.demux(c.streams.video[0]) if p.size) == 1
    with Image.open(io.BytesIO(media.last_frame(one))) as img:
        assert img.size == (720, 540)


def test_last_frame_falls_back_to_decoding_packets(monkeypatch):
    data = make_clip(seconds=0.5)
    monkeypatch.setattr(media, "_frames", lambda _data: iter(()))  # the normal path finds nothing
    with Image.open(io.BytesIO(media.last_frame(data))) as img:
        assert img.size == (720, 540)


def test_blur_faces_hides_the_face_region(monkeypatch):
    rng = np.random.default_rng(0)
    rgb = rng.integers(0, 255, size=(300, 400, 3), dtype=np.uint8)
    monkeypatch.setattr(media, "_faces", lambda _bgr: [(150, 100, 60, 80)])
    blurred, count = media.blur_faces_rgb(rgb.copy())
    assert count == 1
    face = (slice(110, 170), slice(160, 200))
    assert blurred[face].std() < rgb[face].std() / 3  # detail gone
    assert np.array_equal(blurred[:40, :40], rgb[:40, :40])  # the rest untouched


def test_blur_faces_leaves_photos_without_faces_as_they_are():
    buf = io.BytesIO()
    Image.new("RGB", (320, 240), (90, 120, 150)).save(buf, format="JPEG")
    assert media.blur_faces(buf.getvalue()) == buf.getvalue()


def test_face_detector_loads():
    assert media.FACE_MODEL.is_file()
    assert media._faces(np.zeros((240, 320, 3), dtype=np.uint8)) == []


# Process writing

REC = Recording(
    id="rec-9",
    title="Pick and pack",
    expert="Laura",
    status="processing",
    steps=[
        RecordedStep(
            index=1, narration="First I take a medium box. That's enough for five items.", photo_url="/media/rec-9/1.jpg", clip_url="/media/rec-9/1.mp4"
        ),
        RecordedStep(index=2, narration="Tape it shut, and the label goes on top, never over the tape.", photo_url="/media/rec-9/2.jpg", clip_url=None),
    ],
)


def test_plain_draft_without_a_model():
    process = record.write_process("proc-rec-9", REC, [None, None], "Kide Logistics", use_model=False)
    assert process.status == "draft"
    assert process.source == "record"
    assert [s.title for s in process.steps] == ["First I take a medium box.", "Tape it shut, and the label goe…"]
    assert all(len(s.title) <= 32 for s in process.steps)
    assert process.steps[0].clip_url == "/media/rec-9/1.mp4"
    assert process.steps[1].reference_image_url == "/media/rec-9/2.jpg"
    assert process.steps[1].source.quote.startswith("Tape it shut")


def test_plain_draft_keeps_the_whole_narration_for_the_reviewer():
    """The instruction is cut at 140 characters; a rule at the end of the narration must still reach the reviewer."""
    long = "Tape the box shut along the middle seam and press the tape down at both ends so it holds. " * 3 + "Never put the label over the tape."
    rec = Recording(id="rec-8", title="Seal", expert="Laura", status="processing", steps=[RecordedStep(index=1, narration=long)])
    step = record.write_process("proc-rec-8", rec, [None], "Kide Logistics", use_model=False).steps[0]
    assert step.instruction.endswith("…") and len(step.instruction) <= 140
    assert "Never put the label over the tape." not in step.instruction
    assert step.source.quote.endswith("Never put the label over the tape.")
    assert step.source.quote == " ".join(long.split())


def test_a_recorded_draft_cannot_be_published_until_every_step_is_reviewed(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    process = record.write_process("proc-rec-6", REC, [None, None], "Kide Logistics", use_model=False)
    assert [s.reviewed for s in process.steps] == [False, False]
    main.store.processes[process.id] = process
    with TestClient(main.app) as client:
        body = client.get("/processes/proc-rec-6").json()
        # Rewriting the words is not a review: the reviewer says so, step by step.
        body["steps"][0]["instruction"] = "Take a medium box."
        assert client.put("/processes/proc-rec-6", json={**body, "status": "published"}).status_code == 422
        body["steps"][0]["reviewed"] = True
        r = client.put("/processes/proc-rec-6", json={**body, "status": "published"})
        assert r.status_code == 422 and "step 2" in r.json()["detail"]
        assert client.put("/processes/proc-rec-6", json=body).status_code == 200  # saving a draft is always fine
        assert client.get("/processes/proc-rec-6").json()["status"] == "draft"
        body["steps"][1]["reviewed"] = True
        assert client.put("/processes/proc-rec-6", json={**body, "status": "published"}).status_code == 200
        assert client.get("/processes/proc-rec-6").json()["status"] == "published"


def test_plain_draft_guesses_the_language_of_the_narration():
    finnish = Recording(
        id="rec-7",
        title="Sulje laatikko",
        expert="Laura",
        status="processing",
        steps=[
            RecordedStep(index=1, narration="Ota keskikokoinen laatikko ja laita tilauslista sen päälle."),
            RecordedStep(index=2, narration="Teippaa laatikko kiinni. Älä koskaan laita tarraa teipin päälle."),
        ],
    )
    assert record.write_process("proc-rec-7", finnish, [None, None], "Kide Logistics", use_model=False).language == "fi"
    assert record.write_process("proc-rec-9", REC, [None, None], "Kide Logistics", use_model=False).language == "en"
    assert record.guess_language("") == "en"


def fake_model(monkeypatch, draft):
    calls = []

    def parse(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(parsed_output=draft, stop_reason="end_turn")

    monkeypatch.setattr(record, "client", lambda: SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(parse=parse))))
    return calls


def test_model_draft_is_used_and_kept_within_display_limits(monkeypatch):
    draft = ProcessDraft(
        title="Pick and pack an order",
        summary="Take a box, pick, pack and seal.",
        language="en",
        steps=[
            StepDraft(
                title="Take a medium box",
                instruction="Take a medium box (M). It holds up to five items.",
                say="Take a medium box.",
                check="visual",
                criteria=["A box is on the table"],
            ),
            StepDraft(title="Seal and label the box, label on top please", instruction="x" * 300, say=" ".join(["word"] * 40), check="visual", criteria=[]),
        ],
    )
    calls = fake_model(monkeypatch, draft)
    process = record.write_process("proc-rec-9", REC, [b"\xff\xd8photo", None], "Kide Logistics")
    assert process.title == "Pick and pack an order"
    assert process.steps[0].check.kind == "visual"
    assert process.steps[0].check.criteria == ["A box is on the table"]
    assert process.steps[1].check.kind == "none"  # visual without criteria cannot be checked
    assert len(process.steps[1].title) <= 32 and len(process.steps[1].instruction) <= 140
    assert len(process.steps[1].say.split()) == 25
    content = calls[0]["messages"][0]["content"]
    assert sum(1 for c in content if c["type"] == "image") == 1
    assert "never over the tape" in str(content)


def test_model_failure_keeps_the_recording(monkeypatch):
    fake_model(monkeypatch, ProcessDraft(title="t", summary="s", language="en", steps=[]))  # wrong number of steps
    process = record.write_process("proc-rec-9", REC, [None, None], "Kide Logistics")
    assert len(process.steps) == 2
    assert process.steps[0].title == "First I take a medium box."


# HTTP: frames sent as a clip


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "MOCK_CHECK", True)
    monkeypatch.setattr(main, "API_TOKEN", "")
    return TestClient(main.app)


def test_check_and_help_take_a_clip_instead_of_an_image(client):
    clip = ("c.mp4", make_clip(seconds=1.0), "video/mp4")
    form = {"process_id": "proc-pick-pack", "step_id": "step-2", "run_id": "r"}
    assert client.post("/check", data=form, files={"clip": clip}).json()["status"] == "ok"
    session = client.post("/help/frames", data={"employee_id": "emp-sami"}, files={"clip": clip}).json()
    with Image.open(io.BytesIO(client.get(session["latest_frame_url"]).content)) as img:
        assert max(img.size) <= 600


def test_check_needs_exactly_one_of_image_and_clip(client):
    form = {"process_id": "proc-pick-pack", "step_id": "step-2", "run_id": "r"}
    assert client.post("/check", data=form).status_code == 422
    buf = io.BytesIO()
    Image.new("RGB", (64, 48)).save(buf, format="JPEG")
    both = {"image": ("f.jpg", buf.getvalue(), "image/jpeg"), "clip": ("c.mp4", make_clip(seconds=0.5), "video/mp4")}
    assert client.post("/check", data=form, files=both).status_code == 422
    assert client.post("/check", data=form, files={"clip": ("c.mp4", b"junk", "video/mp4")}).status_code == 400
