from pathlib import Path
import numpy as np
from fastapi.testclient import TestClient


def _make_dummy_ppo(tmp_path: Path) -> str:
    import gymnasium as gym
    from stable_baselines3 import PPO

    env = gym.make("CartPole-v1")
    model = PPO("MlpPolicy", env, n_steps=64, verbose=0)
    path = tmp_path / "ppo.zip"
    model.save(str(path))
    return str(path)


def _build_request(ckpt: str) -> dict:
    return {
        "model_id": "test-model-1",
        "checkpoint_path": ckpt,
        "algorithm": "PPO",
        "kind": "portfolio",
        "state_window": 5,
        "input_features": ["close"],
        "ohlcv": {
            "AAPL": [{"date": f"2026-04-{20+i:02d}", "open": 1, "high": 1, "low": 1, "close": 1.0, "volume": 1} for i in range(5)],
            "MSFT": [{"date": f"2026-04-{20+i:02d}", "open": 1, "high": 1, "low": 1, "close": 1.0, "volume": 1} for i in range(5)],
        },
        "indicators": None,
        "current_positions": None,
    }


def test_predict_returns_weights_and_confidence(tmp_path, monkeypatch):
    monkeypatch.setenv("RL_API_KEY", "test-key")
    monkeypatch.setenv("MODEL_DIR", str(tmp_path / "models"))
    from src.main import app
    client = TestClient(app)
    ckpt = _make_dummy_ppo(tmp_path)
    body = _build_request(ckpt)
    resp = client.post("/predict", headers={"X-RL-API-KEY": "test-key"}, json=body)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["kind"] == "portfolio"
    assert isinstance(data["weights"], dict)
    assert set(data["weights"].keys()) == {"AAPL", "MSFT"}
    weight_sum = sum(data["weights"].values())
    assert abs(weight_sum - 1.0) < 1e-3
    assert 0 <= data["confidence"] <= 1
