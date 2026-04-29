"""Minimal Dow 30 portfolio environment for SB3 training.

State: previous-day returns for each ticker (length N).
Action: portfolio weights in [-1, 1]^N. Internally we long-only normalize
        positive entries to sum=1 (equal split if all <=0).
Reward: portfolio log return on next step minus a small turnover penalty.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
import gymnasium as gym
from gymnasium import spaces


class Dow30PortfolioEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(
        self,
        prices: pd.DataFrame,
        window: int = 30,
        turnover_penalty: float = 1e-4,
    ) -> None:
        super().__init__()
        if prices.empty:
            raise ValueError("prices is empty")
        self._prices = prices.values.astype(np.float32)
        self._tickers = list(prices.columns)
        self._n = len(self._tickers)
        self._window = window
        self._turnover_penalty = turnover_penalty
        # Observation: previous `window` daily returns flattened → length N*window
        self.observation_space = spaces.Box(low=-1.0, high=1.0, shape=(self._n * window,), dtype=np.float32)
        self.action_space = spaces.Box(low=-1.0, high=1.0, shape=(self._n,), dtype=np.float32)
        self._t = 0
        self._weights = np.ones(self._n, dtype=np.float32) / self._n

    def _state(self) -> np.ndarray:
        # Past `window` log returns
        end = self._t
        start = end - self._window
        slice_ = self._prices[start:end]
        prev = self._prices[start - 1:end - 1]
        rets = np.log(np.clip(slice_ / np.clip(prev, 1e-6, None), 1e-6, None))
        return np.clip(rets.flatten(), -1.0, 1.0).astype(np.float32)

    def _normalize(self, action: np.ndarray) -> np.ndarray:
        a = np.clip(action, 0.0, None)
        s = a.sum()
        if s <= 0:
            return np.ones(self._n, dtype=np.float32) / self._n
        return (a / s).astype(np.float32)

    def reset(self, *, seed: int | None = None, options=None):
        super().reset(seed=seed)
        # Need at least window+1 rows for the first state
        self._t = self._window + 1
        self._weights = np.ones(self._n, dtype=np.float32) / self._n
        return self._state(), {}

    def step(self, action: np.ndarray):
        new_weights = self._normalize(np.asarray(action, dtype=np.float32))
        # Reward = portfolio log return from t-1 to t under previous weights
        ret = np.log(np.clip(self._prices[self._t] / self._prices[self._t - 1], 1e-6, None))
        portfolio_log_ret = float((self._weights * ret).sum())
        turnover = float(np.abs(new_weights - self._weights).sum())
        reward = portfolio_log_ret - self._turnover_penalty * turnover
        self._weights = new_weights
        self._t += 1
        terminated = False
        truncated = self._t >= len(self._prices)
        return self._state(), reward, terminated, truncated, {}
