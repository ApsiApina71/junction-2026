from fastapi.testclient import TestClient

from app.main import app


def test_health():
    r = TestClient(app).get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_unknown_customer_is_404():
    assert TestClient(app).post("/api/customers/../home", json={}).status_code in (404, 405)
    assert TestClient(app).post("/api/customers/NOPE/home", json={}).status_code == 404
