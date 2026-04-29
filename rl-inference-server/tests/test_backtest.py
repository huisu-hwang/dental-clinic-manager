from pathlib import Path
from fastapi.testclient import TestClient


def _make_dummy_ppo(tmp_path: Path) -> str:
    import gymnasium as gym
    from stable_baselines3 import PPO
    env = gym.make("CartPole-v1")
    model = PPO("MlpPolicy", env, n_steps=64, verbose=0)
    path = tmp_path / "ppo.zip"
    model.save(str(path))
    return str(path)


def test_backtest_returns_metrics(tmp_path, monkeypatch):
    monkeypatch.setenv("RL_API_KEY", "test-key")
    monkeypatch.setenv("MODEL_DIR", str(tmp_path / "models"))
    from src.main import app
    client = TestClient(app)
    ckpt = _make_dummy_ppo(tmp_path)
    n = 30
    body = {
        "model_id": "m1",
        "checkpoint_path": ckpt,
        "algorithm": "PPO",
        "kind": "portfolio",
        "state_window": 5,
        "input_features": ["close"],
        "ohlcv": {
            "AAPL": [{"date": f"2026-03-{(i%28)+1:02d}", "open":1,"high":1,"low":1,"close":1.0+i*0.01,"volume":1} for i in range(n)],
            "MSFT": [{"date": f"2026-03-{(i%28)+1:02d}", "open":1,"high":1,"low":1,"close":1.0,"volume":1} for i in range(n)],
        },
        "rebalance_dates": [f"2026-03-{i+1:02d}" for i in range(5, n) if i+1 <= 28],
        "initial_capital": 10000.0,
    }
    resp = client.post("/backtest", headers={"X-RL-API-KEY": "test-key"}, json=body)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "total_return" in data
    assert "sharpe_ratio" in data
    assert "equity_curve" in data
    assert isinstance(data["equity_curve"], list)
    assert len(data["equity_curve"]) >= 1
