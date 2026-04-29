"""SB3 adapter test: train a tiny PPO on CartPole-v1, save ckpt, load via adapter."""
from pathlib import Path
import numpy as np
import pytest


def _make_tiny_ppo_zip(tmp_path: Path) -> str:
    import gymnasium as gym
    from stable_baselines3 import PPO

    env = gym.make("CartPole-v1")
    model = PPO("MlpPolicy", env, n_steps=64, verbose=0)
    path = tmp_path / "ppo.zip"
    model.save(str(path))
    return str(path)


def test_sb3_adapter_loads_and_predicts(tmp_path):
    from src.adapters.sb3 import SB3Adapter

    ckpt = _make_tiny_ppo_zip(tmp_path)
    adapter = SB3Adapter.load(checkpoint_path=ckpt, algorithm="PPO")
    obs = np.zeros((4,), dtype=np.float32)
    raw_action, action_logits = adapter.predict_with_logits(obs)
    assert raw_action is not None
    assert action_logits is not None


def test_sb3_adapter_compute_confidence_returns_in_unit_range(tmp_path):
    from src.adapters.sb3 import SB3Adapter

    ckpt = _make_tiny_ppo_zip(tmp_path)
    adapter = SB3Adapter.load(checkpoint_path=ckpt, algorithm="PPO")
    obs = np.zeros((4,), dtype=np.float32)
    _, logits = adapter.predict_with_logits(obs)
    conf = adapter.compute_confidence(logits)
    assert 0.0 <= conf <= 1.0


def test_sb3_adapter_rejects_unknown_algorithm():
    from src.adapters.sb3 import SB3Adapter
    with pytest.raises(ValueError):
        SB3Adapter.load(checkpoint_path="/dev/null", algorithm="UNSUPPORTED")
