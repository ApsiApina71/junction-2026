import io

from PIL import Image

from app import main, vision

from .conftest import jpeg, nothing, soup


def post(client, body: bytes, **headers):
    return client.post("/frames", content=body, headers={"Content-Type": "image/jpeg", **headers})


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_page_is_served(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "Start watching" in response.text


def test_frames_log_a_meal_and_return_a_sentence(client, fake):
    fake.queue = [soup(), soup(), soup(same=True, left=0.6)]
    assert post(client, jpeg()).json()["event"] == "pending"
    second = post(client, jpeg()).json()
    assert second["event"] == "logged"
    assert second["say"].startswith("Logged salmon soup and rye bread")
    assert second["today"]["kcal"] == 460
    third = post(client, jpeg()).json()
    assert (third["event"], third["say"]) == ("updated", None)
    # The third call was told about the open meal; the first two were not.
    assert fake.calls[0] is None and fake.calls[1] is None
    assert fake.calls[2]["title"] == "salmon soup and rye bread"

    today = client.get("/today").json()
    assert today["kcal"] == 460
    assert today["entries"][0]["portion_left"] == 0.6


def test_frames_are_downscaled_before_the_model_sees_them(client, fake):
    post(client, jpeg(size=(4000, 3000)))
    with Image.open(io.BytesIO(fake.frames[0])) as img:
        assert img.format == "JPEG"
        assert max(img.size) == main.MAX_SIDE


def test_png_is_accepted(client, fake):
    out = io.BytesIO()
    Image.new("RGBA", (300, 200), "white").save(out, format="PNG")
    assert post(client, out.getvalue()).status_code == 200


def test_a_body_that_is_not_an_image_is_rejected(client, fake):
    response = post(client, b"not an image")
    assert response.status_code == 400
    assert fake.calls == []


def test_an_empty_body_is_rejected(client):
    assert post(client, b"").status_code == 400


def test_an_oversized_body_is_rejected(client, fake, monkeypatch):
    monkeypatch.setattr(main, "MAX_FRAME_BYTES", 1000)
    assert post(client, jpeg()).status_code == 413
    assert fake.calls == []


def test_a_model_failure_is_a_503_with_the_reason(client, monkeypatch):
    def broken(frame, open_meal=None):
        raise vision.VisionError("Could not reach the model. Check the network connection.")

    monkeypatch.setattr(main, "analyse", broken)
    response = post(client, jpeg())
    assert response.status_code == 503
    assert response.json()["detail"] == "Could not reach the model. Check the network connection."
    # The next frame is not blocked by the failed one.
    monkeypatch.setattr(main, "analyse", lambda frame, open_meal=None: nothing())
    assert post(client, jpeg()).json()["event"] == "none"


def test_a_frame_that_arrives_while_another_is_analysed_is_dropped(client, fake):
    assert main._busy.acquire(blocking=False)
    try:
        assert post(client, jpeg()).json()["event"] == "busy"
    finally:
        main._busy.release()
    assert fake.calls == []


def test_entry_image_and_delete(client, fake):
    fake.queue = [soup(), soup()]
    post(client, jpeg())
    entry_id = post(client, jpeg()).json()["today"]["entries"][0]["id"]

    image = client.get(f"/entries/{entry_id}/image")
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/jpeg"

    assert client.delete(f"/entries/{entry_id}").json()["kcal"] == 0
    assert client.get(f"/entries/{entry_id}/image").status_code == 404
    assert client.delete(f"/entries/{entry_id}").status_code == 404


def test_token_is_required_when_set(client, monkeypatch):
    monkeypatch.setattr(main, "API_TOKEN", "s3cret")
    assert client.get("/today").status_code == 401
    assert post(client, jpeg()).status_code == 401
    assert client.get("/today", headers={"X-Api-Token": "wrong"}).status_code == 401
    assert client.get("/today", headers={"X-Api-Token": "s3cret"}).status_code == 200
    assert client.get("/today?token=s3cret").status_code == 200
    assert post(client, jpeg(), **{"X-Api-Token": "s3cret"}).status_code == 200
    # The page and the health check carry no data and stay open.
    assert client.get("/").status_code == 200
    assert client.get("/health").status_code == 200


def test_the_glasses_screen_is_served_as_a_web_app(client):
    page = client.get("/display/")
    assert page.status_code == 200
    assert 'name="mrbd-web-app-capable"' in page.text
    # Without the trailing slash the request is redirected to the directory-style address the glasses need.
    assert client.get("/display?hold").url.path == "/display/"

    manifest = client.get("/display/.well-known/meta-wearables-manifest.json")
    assert manifest.headers["content-type"] == "application/json; charset=utf-8"
    body = manifest.json()
    assert body["version"] == 1
    assert body["name"] == "Calorie tracker"
    # "../icon.svg" is resolved against the manifest address, which gives /display/icon.svg.
    assert body["appearance"]["icon"]["src"] == "../icon.svg"
    icon = client.get("/display/icon.svg")
    assert icon.status_code == 200
    assert icon.headers["content-type"].startswith("image/svg+xml")


def test_today_carries_the_last_event_for_the_glasses_screen(client, fake):
    assert client.get("/today").json()["last_event"] is None
    fake.queue = [soup(), soup()]
    post(client, jpeg())
    post(client, jpeg())
    event = client.get("/today").json()["last_event"]
    assert (event["kind"], event["kcal"]) == ("logged", 460)
