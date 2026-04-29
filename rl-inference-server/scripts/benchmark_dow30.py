"""Benchmark RL ckpt against simple baselines on the same OOS period.

Baselines:
  - Buy & Hold: 첫 거래일에 1/N 동일 비중으로 매수 후 holding
  - Equal-weight monthly rebal: 매월 첫 거래일에 1/N로 rebalance
  - Min-variance monthly: 60일 lookback 기반 공분산 행렬로 min-var weights
  - RL (체크포인트): 매월 첫 거래일에 RL 모델로 rebalance

모두 동일 OOS 기간(2024-01-01 → latest)에서 Sharpe / Total return / Max drawdown.

사용:
  python -m scripts.benchmark_dow30 --checkpoint trained/sweep/trial_4.zip
"""
from __future__ import annotations
import argparse
import json
from typing import Callable

import numpy as np
import pandas as pd

from scripts.data_loader import load_dow30, DEFAULT_UNIVERSE
from src.adapters.sb3 import SB3Adapter
from src.inference.portfolio import PortfolioInferenceEngine
from src.schemas import PredictRequest, OHLCVRow


def _metrics(equity: np.ndarray) -> dict:
    if equity.size < 2:
        return {"total_return": 0.0, "sharpe": 0.0, "max_drawdown": 0.0}
    rets = np.diff(equity) / equity[:-1]
    total_return = float(equity[-1] / equity[0] - 1.0)
    sharpe = float(rets.mean() / rets.std() * np.sqrt(252)) if rets.std() > 0 else 0.0
    peak = np.maximum.accumulate(equity)
    drawdown = (equity - peak) / peak
    return {
        "total_return": total_return,
        "sharpe": sharpe,
        "max_drawdown": float(drawdown.min()),
    }


def _simulate(
    prices: pd.DataFrame,
    weights_at: Callable[[int, np.ndarray], np.ndarray],
    initial_capital: float = 10_000.0,
) -> np.ndarray:
    """주어진 weights 함수로 portfolio equity 곡선 산출.

    weights_at(i, prices_array): 인덱스 i에서 주어진 lookback 가격으로 next-day weights 반환.
    """
    arr = prices.values
    n = arr.shape[0]
    equity = np.empty(n)
    equity[0] = initial_capital
    weights = np.zeros(arr.shape[1])
    for i in range(1, n):
        if i > 0:
            ret = np.log(np.clip(arr[i] / arr[i - 1], 1e-6, None))
            equity[i] = equity[i - 1] * float(np.exp((weights * ret).sum()))
        else:
            equity[i] = equity[i - 1]
        weights = weights_at(i, arr)
    return equity


def _is_first_of_month(d: pd.Timestamp, prev: pd.Timestamp | None) -> bool:
    return prev is None or (d.month != prev.month) or (d.year != prev.year)


def buy_and_hold_weights(window: int) -> Callable[[int, np.ndarray], np.ndarray]:
    state = {"set": False}
    def fn(i: int, arr: np.ndarray) -> np.ndarray:
        if not state["set"]:
            state["set"] = True
            return np.ones(arr.shape[1]) / arr.shape[1]
        # already holding — no rebalance
        return state.setdefault("w", np.ones(arr.shape[1]) / arr.shape[1])
    return fn


def equal_weight_monthly(prices: pd.DataFrame, window: int) -> np.ndarray:
    arr = prices.values
    n = arr.shape[0]
    equity = np.empty(n)
    equity[0] = 10_000.0
    weights = np.ones(arr.shape[1]) / arr.shape[1]
    last_month: tuple[int, int] | None = None
    for i in range(1, n):
        ret = np.log(np.clip(arr[i] / arr[i - 1], 1e-6, None))
        equity[i] = equity[i - 1] * float(np.exp((weights * ret).sum()))
        d = prices.index[i]
        if _is_first_of_month(d, prices.index[i - 1] if i > 0 else None):
            weights = np.ones(arr.shape[1]) / arr.shape[1]
    return equity


def buy_and_hold_curve(prices: pd.DataFrame) -> np.ndarray:
    arr = prices.values
    n = arr.shape[0]
    equity = np.empty(n)
    equity[0] = 10_000.0
    weights = np.ones(arr.shape[1]) / arr.shape[1]
    for i in range(1, n):
        ret = np.log(np.clip(arr[i] / arr[i - 1], 1e-6, None))
        equity[i] = equity[i - 1] * float(np.exp((weights * ret).sum()))
    return equity


def min_variance_monthly(prices: pd.DataFrame, lookback: int = 60) -> np.ndarray:
    arr = prices.values
    n = arr.shape[0]
    equity = np.empty(n)
    equity[0] = 10_000.0
    weights = np.ones(arr.shape[1]) / arr.shape[1]
    for i in range(1, n):
        ret = np.log(np.clip(arr[i] / arr[i - 1], 1e-6, None))
        equity[i] = equity[i - 1] * float(np.exp((weights * ret).sum()))
        d = prices.index[i]
        is_first = i == 1 or (prices.index[i - 1].month != d.month)
        if is_first and i >= lookback:
            window = arr[i - lookback:i]
            log_ret = np.diff(np.log(np.clip(window, 1e-6, None)), axis=0)
            cov = np.cov(log_ret.T)
            ones = np.ones(arr.shape[1])
            try:
                inv = np.linalg.pinv(cov)
                raw = inv @ ones
                w = raw / raw.sum()
                w = np.clip(w, 0.0, None)
                if w.sum() > 0:
                    weights = w / w.sum()
            except np.linalg.LinAlgError:
                pass
    return equity


def rl_monthly(prices: pd.DataFrame, adapter: SB3Adapter, window: int = 30) -> np.ndarray:
    arr = prices.values
    tickers = list(prices.columns)
    n = arr.shape[0]
    equity = np.empty(n)
    equity[0] = 10_000.0
    weights = np.ones(arr.shape[1]) / arr.shape[1]
    engine = PortfolioInferenceEngine(adapter)

    for i in range(1, n):
        ret = np.log(np.clip(arr[i] / arr[i - 1], 1e-6, None))
        equity[i] = equity[i - 1] * float(np.exp((weights * ret).sum()))
        d = prices.index[i]
        is_first = i == 1 or (prices.index[i - 1].month != d.month)
        if is_first and i >= window:
            ohlcv: dict[str, list[OHLCVRow]] = {}
            for j, t in enumerate(tickers):
                rows: list[OHLCVRow] = []
                for k in range(i - window, i):
                    p = float(arr[k, j])
                    rows.append(OHLCVRow(date=str(prices.index[k].date()), open=p, high=p, low=p, close=p, volume=0))
                ohlcv[t] = rows
            req = PredictRequest(
                model_id="bench-rl",
                checkpoint_path="",
                algorithm="PPO",
                kind="portfolio",
                state_window=window,
                input_features=["log_returns_window"],
                ohlcv=ohlcv,
            )
            try:
                pred = engine.run(req)
                w_dict = pred.weights
                weights = np.array([w_dict.get(t, 0.0) for t in tickers], dtype=np.float32)
            except Exception:
                pass
    return equity


def main(args: argparse.Namespace) -> None:
    print(f"[bench] loading OOS {args.start} → {args.end or 'latest'}")
    prices = load_dow30(start=args.start, end=args.end, cache_dir=args.cache_dir)
    print(f"[bench] {len(prices)} rows × {prices.shape[1]} tickers")

    print("[bench] running buy_and_hold...")
    eq_bah = buy_and_hold_curve(prices)
    print("[bench] running equal_weight_monthly...")
    eq_eq = equal_weight_monthly(prices, window=args.window)
    print("[bench] running min_variance_monthly...")
    eq_mv = min_variance_monthly(prices, lookback=args.window * 2)
    print("[bench] running RL...")
    adapter = SB3Adapter.load(checkpoint_path=args.checkpoint, algorithm="PPO")
    eq_rl = rl_monthly(prices, adapter, window=args.window)

    summary = {
        "period": f"{args.start} → {args.end or 'latest'}",
        "n_days": len(prices),
        "n_tickers": prices.shape[1],
        "checkpoint": args.checkpoint,
        "results": {
            "buy_and_hold_1n": _metrics(eq_bah),
            "equal_weight_monthly": _metrics(eq_eq),
            "min_variance_monthly": _metrics(eq_mv),
            "rl_monthly": _metrics(eq_rl),
        },
    }
    print("\n" + "=" * 80)
    print("BENCHMARK SUMMARY")
    print(json.dumps(summary, indent=2, default=str))
    print("=" * 80)

    print("\n| Strategy                | Total Return | Sharpe | Max DD  |")
    print("|-------------------------|--------------|--------|---------|")
    for name, m in summary["results"].items():
        print(f"| {name:<23} | {m['total_return']:+.2%}      | {m['sharpe']:+.3f} | {m['max_drawdown']:+.2%} |")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--checkpoint", required=True)
    p.add_argument("--start", default="2024-01-01")
    p.add_argument("--end", default=None)
    p.add_argument("--window", type=int, default=30)
    p.add_argument("--cache-dir", default="./.cache/dow30")
    return p.parse_args()


if __name__ == "__main__":
    main(parse_args())
