"""A company's own video of a step, uploaded in Studio: plug and play, no glasses needed."""

import av
import pytest
from fastapi.testclient import TestClient

from app import main
from app.store import Store
from tests.test_jepa import scene_clip


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "store", Store(data_dir=tmp_path))
    monkeypatch.setattr(main, "API_TOKEN", "")
    monkeypatch.setattr(main, "PUBLIC_BASE_URL", "")
    return TestClient(main.app)


def seconds(data: bytes) -> float:
    import io

    with av.open(io.BytesIO(data)) as c:
        return sum(1 for _ in c.decode(c.streams.video[0])) / 15


def test_a_step_gets_the_uploaded_video(client):
    before = client.get("/processes/proc-pick-pack").json()["steps"][0]
    r = client.post(
        "/processes/proc-pick-pack/steps/step-1/clip", files={"clip": ("phone.mp4", scene_clip("step-1", seconds=14.0), "video/mp4")}, data={"start": "2"}
    )
    assert r.status_code == 200, r.text
    step = r.json()["steps"][0]
    assert step["clip_url"] != before["clip_url"] and "/media/steps/proc-pick-pack-" in step["clip_url"]
    assert step["reference_image_url"] == before["reference_image_url"]  # a step that has a picture keeps it
    clip = client.get(step["clip_url"].split("testserver")[-1])
    assert clip.status_code == 200 and seconds(clip.content) <= 10.1


def test_a_step_without_a_picture_gets_the_last_frame(client):
    main.store.processes["proc-pick-pack"].steps[2].reference_image_url = None
    r = client.post("/processes/proc-pick-pack/steps/step-3/clip", files={"clip": ("phone.mp4", scene_clip("step-3", seconds=2.0), "video/mp4")})
    assert r.status_code == 200
    assert "/media/steps/" in r.json()["steps"][2]["reference_image_url"]


def test_not_a_video(client):
    assert client.post("/processes/proc-pick-pack/steps/step-1/clip", files={"clip": ("x.mp4", b"", "video/mp4")}).status_code == 413
    assert client.post("/processes/proc-pick-pack/steps/step-1/clip", files={"clip": ("x.mp4", b"not a video", "video/mp4")}).status_code == 400
    assert client.post("/processes/proc-pick-pack/steps/nope/clip", files={"clip": ("x.mp4", b"x", "video/mp4")}).status_code == 404
