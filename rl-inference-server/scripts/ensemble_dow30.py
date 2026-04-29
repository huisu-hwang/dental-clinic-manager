"""Ensemble: blend PPO weights with Min-Variance weights and compare across α values.

매월 rebalance 시점에:
  ensemble_weights = α * PPO + (1 - α) * MinVar     (둘 다 long-only normalize)

α를 [0.0, 0.25, 0.5, 0.75, 1.0]에서 grid 비교 → OOS Sharpe/Return/MDD.

α=0.0 → Min-Var only
α=1.0 → PPO only
중간값 → blend

사용:
  python -m scripts.ensemble_dow30 --checkpoint trained/sweep/trial_4.zip
"""
from __future__ import annotations
import argparse
import json
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
    total = float(equity[-1] / equity[0] - 1.0)
    sharpe = float(rets.mean() / rets.std() * np.sqrt(252)) if rets.std() > 0 else 0.0
    peak = np.maximum.accumulate(equity)
    dd = (equity - peak) / peak
    return {"total_return": total, "sharpe": sharpe, "max_drawdown": float(dd.min())}


def _min_var_weights(window: np.ndarray, n: int) -> np.ndarray:
    log_ret = np.diff(np.log(np.clip(window, 1e-6, None)), axis=0)
    cov = np.cov(log_ret.T)
    ones = np.ones(n)
    try:
        inv = np.linalg.pinv(cov)
        raw = inv @ ones
        w = np.clip(raw / raw.sum(), 0.0, None)
        if w.sum() > 0:
            return w / w.sum()
    except np.linalg.LinAlgError:
        pass
    return np.ones(n) / n


def _ppo_weights(adapter: SB3Adapter, window_arr: np.ndarray, tickers: list[str], dates: list[pd.Timestamp]) -> np.ndarray:
    """v1-style portfolio engine을 호출 (tickers × window OHLCV)."""
    engine = PortfolioInferenceEngine(adapter)
    ohlcv: dict[str, list[OHLCVRow]] = {}
    for j, t in enumerate(tickers):
        rows: list[OHLCVRow] = []
        for k in range(window_arr.shape[0]):
            p = float(window_arr[k, j])
            rows.append(OHLCVRow(date=str(dates[k].date()), open=p, high=p, low=p, close=p, volume=0))
        ohlcv[t] = rows
    req = PredictRequest(
        model_id="ensemble", checkpoint_path="", algorithm="PPO", kind="portfolio",
        state_window=window_arr.shape[0], input_features=["log_returns_window"], ohlcv=ohlcv,
    )
    try:
        pred = engine.run(req)
        return np.array([pred.weights.get(t, 0.0) for t in tickers], dtype=np.float64)
    except Exception:
        return np.ones(len(tickers)) / len(tickers)


def simulate_ensemble(prices: pd.DataFrame, adapter: SB3Adapter, alpha: float, window: int = 30) -> np.ndarray:
    arr = prices.values.astype(np.float64)
    tickers = list(prices.columns)
    n_tickers = arr.shape[1]
    n_days = arr.shape[0]
    equity = np.empty(n_days)
    equity[0] = 10_000.0
    weights = np.ones(n_tickers) / n_tickers

    for i in range(1, n_days):
        ret = np.log(np.clip(arr[i] / arr[i - 1], 1e-6, None))
        equity[i] = equity[i - 1] * float(np.exp((weights * ret).sum()))
        d = prices.index[i]
        is_first = i == 1 or (prices.index[i - 1].month != d.month)
        if is_first and i >= window:
            window_arr = arr[i - window:i]
            ppo_w = _ppo_weights(adapter, window_arr, tickers, list(prices.index[i - window:i]))
            mv_w = _min_var_weights(window_arr, n_tickers)
            blend = alpha * ppo_w + (1.0 - alpha) * mv_w
            s = blend.sum()
            weights = blend / s if s > 0 else np.ones(n_tickers) / n_tickers
    return equity


def main(args: argparse.Namespace) -> None:
    print(f"[ensemble] loading {args.start} → {args.end or 'latest'}")
    prices = load_dow30(start=args.start, end=args.end, cache_dir=args.cache_dir)
    print(f"[ensemble] {len(prices)} rows × {prices.shape[1]} tickers")
    adapter = SB3Adapter.load(checkpoint_path=args.checkpoint, algorithm="PPO")

    alphas = [0.0, 0.25, 0.5, 0.75, 1.0]
    results: list[dict] = []
    for a in alphas:
        eq = simulate_ensemble(prices, adapter, alpha=a, window=args.window)
        m = _metrics(eq)
        results.append({"alpha": a, **m})
        print(f"[ensemble α={a:.2f}] return={m['total_return']:+.2%}  sharpe={m['sharpe']:+.3f}  mdd={m['max_drawdown']:+.2%}")

    # Sort by sharpe to highlight best blend
    best = max(results, key=lambda r: r["sharpe"])
    print("\n" + "=" * 70)
    print(json.dumps({"period": f"{args.start}..{args.end or 'latest'}", "results": results, "best": best}, indent=2, default=str))
    print("=" * 70)
    print(f"\n[best] α={best['alpha']:.2f}  Sharpe={best['sharpe']:+.3f}  Return={best['total_return']:+.2%}")


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
