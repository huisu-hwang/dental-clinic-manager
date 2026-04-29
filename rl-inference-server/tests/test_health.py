from fastapi.testclient import TestClient


def test_health_returns_200_with_status(monkeypatch):
    monkeypatch.setenv("RL_API_KEY", "test-key")
    from src.main import app
    client = TestClient(app)
    resp = client.get("/health", headers={"X-RL-API-KEY": "test-key"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "loaded_models" in body
    assert "uptime_seconds" in body


def test_health_rejects_missing_api_key(monkeypatch):
    monkeypatch.setenv("RL_API_KEY", "test-key")
    from src.main import app
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 401


def test_health_rejects_wrong_api_key(monkeypatch):
    monkeypatch.setenv("RL_API_KEY", "test-key")
    from src.main import app
    client = TestClient(app)
    resp = client.get("/health", headers={"X-RL-API-KEY": "wrong"})
    assert resp.status_code == 401
