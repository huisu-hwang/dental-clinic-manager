"""학습된 PPO Dow30 ckpt를 backtest로 평가.

In-process로 SB3Adapter + run_backtest를 직접 호출하여 sharpe/MDD/total_return 산출.
학습 데이터 기간(in-sample) + 별도 검증 기간(out-of-sample) 두 번 돌려 overfitting을 본다.

사용:
  python -m scripts.eval_ppo_dow30 \
    --checkpoint trained/ppo_dow30_200k.zip \
    --train-start 2014-01-01 --train-end 2023-12-31 \
    --test-start 2024-01-01  --test-end 2026-04-29
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path

from src.adapters.sb3 import SB3Adapter
from src.inference.backtest import run_backtest
from src.schemas import BacktestRequest, OHLCVRow
from scripts.data_loader import load_dow30, DEFAULT_UNIVERSE


def _to_ohlcv(prices_df) -> dict[str, list[OHLCVRow]]:
    """yfinance close-only DataFrame을 BacktestRequest.ohlcv 형식으로 변환."""
    out: dict[str, list[OHLCVRow]] = {}
    for ticker in prices_df.columns:
        rows: list[OHLCVRow] = []
        for date, close in prices_df[ticker].items():
            d = date.strftime("%Y-%m-%d") if hasattr(date, "strftime") else str(date)
            close_f = float(close)
            rows.append(OHLCVRow(date=d, open=close_f, high=close_f, low=close_f, close=close_f, volume=0))
        out[ticker] = rows
    return out


def evaluate_period(
    adapter: SB3Adapter,
    ckpt: str,
    universe: list[str],
    start: str,
    end: str | None,
    state_window: int,
    label: str,
    cache_dir: str,
) -> dict:
    print(f"\n[eval:{label}] loading {start} → {end or 'latest'}")
    prices = load_dow30(start=start, end=end, universe=universe, cache_dir=cache_dir)
    print(f"[eval:{label}] {len(prices)} rows × {prices.shape[1]} tickers")
    if len(prices) <= state_window + 5:
        raise ValueError(f"{label}: 너무 짧은 기간 (rows={len(prices)})")

    ohlcv = _to_ohlcv(prices)
    # 매월 첫 거래일을 rebalance 시점으로 (최소 state_window 이후만)
    all_dates = sorted({r.date for rows in ohlcv.values() for r in rows})
    eligible = all_dates[state_window:]
    rebalance_dates: list[str] = []
    last_month: tuple[int, int] | None = None
    for d in eligible:
        y, m, _ = (int(x) for x in d.split("-"))
        if last_month != (y, m):
            rebalance_dates.append(d)
            last_month = (y, m)

    req = BacktestRequest(
        model_id=f"eval-{label}",
        checkpoint_path=ckpt,
        algorithm="PPO",
        kind="portfolio",
        state_window=state_window,
        input_features=["log_returns_window"],
        ohlcv=ohlcv,
        rebalance_dates=rebalance_dates,
        initial_capital=10_000.0,
    )
    resp = run_backtest(adapter, req)
    print(f"[eval:{label}] rebalances={resp.n_rebalances}  total_return={resp.total_return:.4f}  "
          f"sharpe={resp.sharpe_ratio:.4f}  max_dd={resp.max_drawdown:.4f}")
    return {
        "label": label,
        "start": start,
        "end": end,
        "rows": len(prices),
        "n_rebalances": resp.n_rebalances,
        "total_return": resp.total_return,
        "sharpe_ratio": resp.sharpe_ratio,
        "max_drawdown": resp.max_drawdown,
        "metadata": resp.metadata,
    }


def main(args: argparse.Namespace) -> None:
    ckpt = str(Path(args.checkpoint).resolve())
    print(f"[eval] checkpoint: {ckpt}")
    adapter = SB3Adapter.load(checkpoint_path=ckpt, algorithm="PPO")

    in_sample = evaluate_period(
        adapter, ckpt, DEFAULT_UNIVERSE, args.train_start, args.train_end,
        args.window, "in_sample", args.cache_dir,
    )
    out_sample = evaluate_period(
        adapter, ckpt, DEFAULT_UNIVERSE, args.test_start, args.test_end,
        args.window, "out_of_sample", args.cache_dir,
    )

    summary = {
        "checkpoint": ckpt,
        "in_sample": in_sample,
        "out_of_sample": out_sample,
    }
    print("\n" + "=" * 70)
    print("EVAL SUMMARY (JSON)")
    print(json.dumps(summary, indent=2, default=str))
    print("=" * 70)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--checkpoint", required=True)
    p.add_argument("--train-start", default="2014-01-01")
    p.add_argument("--train-end", default="2023-12-31")
    p.add_argument("--test-start", default="2024-01-01")
    p.add_argument("--test-end", default=None)
    p.add_argument("--window", type=int, default=30)
    p.add_argument("--cache-dir", default="./.cache/dow30")
    return p.parse_args()


if __name__ == "__main__":
    main(parse_args())
