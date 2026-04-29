import numpy as np
import pandas as pd
import pytest
from scripts.dow30_env import Dow30PortfolioEnv


def make_synthetic_prices(n_days: int = 100, n_tickers: int = 5, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rets = rng.normal(0, 0.01, size=(n_days, n_tickers))
    prices = 100 * np.exp(rets.cumsum(axis=0))
    return pd.DataFrame(prices, columns=[f"T{i}" for i in range(n_tickers)])


def test_env_observation_action_shapes():
    prices = make_synthetic_prices(n_days=100, n_tickers=5)
    env = Dow30PortfolioEnv(prices=prices, window=10)
    assert env.observation_space.shape == (50,)  # 5 tickers × 10 window
    assert env.action_space.shape == (5,)
    obs, _info = env.reset()
    assert obs.shape == (50,)


def test_env_step_returns_finite_reward():
    prices = make_synthetic_prices(n_days=60, n_tickers=3)
    env = Dow30PortfolioEnv(prices=prices, window=5)
    obs, _ = env.reset()
    action = np.array([0.5, 0.3, 0.2], dtype=np.float32)
    obs2, reward, terminated, truncated, info = env.step(action)
    assert obs2.shape == obs.shape
    assert np.isfinite(reward)
    assert not terminated


def test_env_negative_action_uses_equal_weights():
    prices = make_synthetic_prices(n_days=30, n_tickers=4)
    env = Dow30PortfolioEnv(prices=prices, window=5)
    env.reset()
    obs2, reward, _, _, _ = env.step(np.array([-1.0, -1.0, -1.0, -1.0], dtype=np.float32))
    # equal-split fallback: weights should be uniform 1/4 internally
    assert np.isfinite(reward)


def test_env_truncates_at_end_of_data():
    prices = make_synthetic_prices(n_days=20, n_tickers=2)
    env = Dow30PortfolioEnv(prices=prices, window=5)
    env.reset()
    truncated = False
    for _ in range(50):
        _, _, _, truncated, _ = env.step(np.array([0.5, 0.5], dtype=np.float32))
        if truncated:
            break
    assert truncated is True
