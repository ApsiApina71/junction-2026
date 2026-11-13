import os

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_check_rejects_non_image():
    response = client.post("/check", files={"image": ("a.txt", b"hello", "text/plain")})
    assert response.status_code == 415


def test_check_rejects_bad_list():
    response = client.post(
        "/check",
        files={"image": ("a.jpg", b"\xff\xd8\xff", "image/jpeg")},
        data={"shopping_list": "not json"},
    )
    assert response.status_code == 422
