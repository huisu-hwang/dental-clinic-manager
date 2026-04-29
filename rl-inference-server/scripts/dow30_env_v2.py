"""Dow30PortfolioEnvV2 — reward shaping + 확장 state + regime feature.

v1 대비 변경:
  - Reward: log return − downside_penalty * max(0, -log_return)^2 − turnover_penalty * Σ|Δw|
    (Sortino-style: 손실에만 quadratic penalty, 이익은 그대로)
  - State 확장: 종목별 (log_returns, log_volumes, RSI14) × window
                + 시장 regime (cross-sectional vol of last `window` returns)
  - Action space는 v1과 동일 (Box(N,) [-1,1] long-only normalize)

Adapter 호환: portfolio.py가 raw_action.size == n_tickers면 그대로 weights로 매핑하므로 OK.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
import gymnasium as gym
from gymnasium import spaces


def _rsi(close: np.ndarray, period: int = 14) -> np.ndarray:
    """Wilder RSI on a 1-D array. 첫 period 길이는 50.0(중립)으로 채움."""
    n = close.shape[0]
    out = np.full(n, 50.0, dtype=np.float32)
    if n <= period:
        return out
    deltas = np.diff(close)
    up = np.clip(deltas, 0.0, None)
    dn = np.clip(-deltas, 0.0, None)
    avg_up = up[:period].mean()
    avg_dn = dn[:period].mean()
    for i in range(period, n):
        if i > period:
            avg_up = (avg_up * (period - 1) + up[i - 1]) / period
            avg_dn = (avg_dn * (period - 1) + dn[i - 1]) / period
        rs = avg_up / max(avg_dn, 1e-9)
        out[i] = 100.0 - 100.0 / (1.0 + rs)
    return out


class Dow30PortfolioEnvV2(gym.Env):
    metadata = {"render_modes": []}

    def __init__(
        self,
        prices: pd.DataFrame,
        volumes: pd.DataFrame | None = None,
        window: int = 30,
        turnover_penalty: float = 1e-4,
        downside_penalty: float = 5.0,
    ) -> None:
        super().__init__()
        if prices.empty:
            raise ValueError("prices is empty")
        # Align volumes (optional). 없으면 1.0으로 채움 → log volume = 0 (state는 0).
        if volumes is None or volumes.empty:
            volumes = pd.DataFrame(np.ones_like(prices.values), index=prices.index, columns=prices.columns)
        else:
            volumes = volumes.reindex_like(prices).ffill().fillna(1.0)
        self._prices = prices.values.astype(np.float32)
        self._volumes = np.clip(volumes.values.astype(np.float32), 1.0, None)
        self._tickers = list(prices.columns)
        self._n = len(self._tickers)
        self._window = window
        self._turnover_penalty = turnover_penalty
        self._downside_penalty = downside_penalty

        # RSI per ticker (precompute once)
        self._rsi = np.column_stack([_rsi(self._prices[:, j]) for j in range(self._n)]).astype(np.float32)
        # log volumes (per-ticker z-score over full series for stable scale)
        log_vol = np.log(self._volumes)
        self._log_vol_norm = ((log_vol - log_vol.mean(axis=0)) / (log_vol.std(axis=0) + 1e-6)).astype(np.float32)

        # State per step:
        #   - per-ticker × window: log_return + log_volume_z + rsi_norm  → 3 channels × N × window
        #   - market regime: cross-sectional vol of last `window` returns (1 scalar)
        #   - state size = 3 * N * window + 1
        self._state_dim = 3 * self._n * window + 1
        self.observation_space = spaces.Box(low=-5.0, high=5.0, shape=(self._state_dim,), dtype=np.float32)
        self.action_space = spaces.Box(low=-1.0, high=1.0, shape=(self._n,), dtype=np.float32)

        self._t = 0
        self._weights = np.ones(self._n, dtype=np.float32) / self._n

    def _state(self) -> np.ndarray:
        end = self._t
        start = end - self._window
        # log returns
        slice_p = self._prices[start:end]
        prev_p = self._prices[start - 1:end - 1]
        rets = np.log(np.clip(slice_p / np.clip(prev_p, 1e-6, None), 1e-6, None))
        rets = np.clip(rets, -1.0, 1.0)

        # log volumes (z-score)
        vols = self._log_vol_norm[start:end]
        vols = np.clip(vols, -5.0, 5.0)

        # RSI normalized to [-1, 1] (0..100 → -1..1)
        rsi = (self._rsi[start:end] - 50.0) / 50.0
        rsi = np.clip(rsi, -1.0, 1.0)

        # Market regime: cross-sectional vol of returns
        regime = float(np.std(rets))

        # Concat in (3, window, n_tickers) → flatten
        state = np.concatenate([rets.flatten(), vols.flatten(), rsi.flatten(), [regime]]).astype(np.float32)
        return state

    def _normalize(self, action: np.ndarray) -> np.ndarray:
        a = np.clip(action, 0.0, None)
        s = a.sum()
        if s <= 0:
            return np.ones(self._n, dtype=np.float32) / self._n
        return (a / s).astype(np.float32)

    def reset(self, *, seed: int | None = None, options=None):
        super().reset(seed=seed)
        self._t = self._window + 1
        self._weights = np.ones(self._n, dtype=np.float32) / self._n
        return self._state(), {}

    def step(self, action: np.ndarray):
        new_weights = self._normalize(np.asarray(action, dtype=np.float32))
        ret = np.log(np.clip(self._prices[self._t] / self._prices[self._t - 1], 1e-6, None))
        portfolio_log_ret = float((self._weights * ret).sum())

        # Sortino-style downside penalty: quadratic on negative returns only
        downside = max(0.0, -portfolio_log_ret)
        turnover = float(np.abs(new_weights - self._weights).sum())
        reward = portfolio_log_ret - self._downside_penalty * (downside ** 2) - self._turnover_penalty * turnover

        self._weights = new_weights
        self._t += 1
        terminated = False
        truncated = self._t >= len(self._prices)
        return self._state(), reward, terminated, truncated, {}
