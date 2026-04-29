"""Eval PPO v2 ckpt by stepping env v2 directly (bypass portfolio.py adapter).

v2 obs shape이 v1과 달라 portfolio.py 매핑이 안 맞음 → env에서 매일 model.predict로
action 받아 equity 곡선 직접 시뮬레이션.

사용:
  python -m scripts.eval_ppo_dow30_v2 --checkpoint trained/ppo_dow30_v2.zip
"""
from __future__ import annotations
import argparse
import json
import numpy as np

from stable_baselines3 import PPO

from scripts.data_loader_v2 import load_dow30_with_volume
from scripts.dow30_env_v2 import Dow30PortfolioEnvV2


def _metrics(equity: np.ndarray) -> dict:
    if equity.size < 2:
        return {"total_return": 0.0, "sharpe": 0.0, "max_drawdown": 0.0}
    rets = np.diff(equity) / equity[:-1]
    total_return = float(equity[-1] / equity[0] - 1.0)
    sharpe = float(rets.mean() / rets.std() * np.sqrt(252)) if rets.std() > 0 else 0.0
    peak = np.maximum.accumulate(equity)
    drawdown = (equity - peak) / peak
    return {"total_return": total_return, "sharpe": sharpe, "max_drawdown": float(drawdown.min())}


def evaluate(checkpoint: str, start: str, end: str | None, window: int, cache_dir: str, label: str) -> dict:
    print(f"[eval v2:{label}] loading {start} → {end or 'latest'}")
    prices, volumes = load_dow30_with_volume(start=start, end=end, cache_dir=cache_dir)
    print(f"[eval v2:{label}] {len(prices)} rows × {prices.shape[1]} tickers")
    if len(prices) <= window + 5:
        return {"label": label, "skipped": True, "reason": "insufficient rows"}

    env = Dow30PortfolioEnvV2(prices=prices, volumes=volumes, window=window)
    model = PPO.load(checkpoint, device="cpu")
    obs, _info = env.reset()

    initial = 10_000.0
    equity_curve: list[float] = [initial]
    weights = np.ones(env._n) / env._n
    while True:
        action, _state = model.predict(obs, deterministic=True)
        # Manually replicate env price step but track equity ourselves (env doesn't return equity).
        new_w = env._normalize(np.asarray(action, dtype=np.float32))
        ret = np.log(np.clip(env._prices[env._t] / env._prices[env._t - 1], 1e-6, None))
        port_log_ret = float((weights * ret).sum())
        equity_curve.append(equity_curve[-1] * float(np.exp(port_log_ret)))
        weights = new_w
        obs, _r, _term, truncated, _info = env.step(action)
        if truncated:
            break

    eq = np.array(equity_curve, dtype=np.float64)
    m = _metrics(eq)
    print(f"[eval v2:{label}] return={m['total_return']:+.2%} sharpe={m['sharpe']:+.3f} mdd={m['max_drawdown']:+.2%}")
    return {"label": label, "start": start, "end": end, "rows": len(prices), **m}


def main(args: argparse.Namespace) -> None:
    in_s = evaluate(args.checkpoint, args.train_start, args.train_end, args.window, args.cache_dir, "in_sample")
    out_s = evaluate(args.checkpoint, args.test_start, args.test_end, args.window, args.cache_dir, "out_of_sample")
    print("\n" + "=" * 70)
    print("EVAL v2 SUMMARY")
    print(json.dumps({"checkpoint": args.checkpoint, "in_sample": in_s, "out_of_sample": out_s}, indent=2, default=str))
    print("=" * 70)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--checkpoint", required=True)
    p.add_argument("--train-start", default="2019-04-01")
    p.add_argument("--train-end", default="2023-12-31")
    p.add_argument("--test-start", default="2024-01-01")
    p.add_argument("--test-end", default=None)
    p.add_argument("--window", type=int, default=30)
    p.add_argument("--cache-dir", default="./.cache/dow30")
    return p.parse_args()


if __name__ == "__main__":
    main(parse_args())
