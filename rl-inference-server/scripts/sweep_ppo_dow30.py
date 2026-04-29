"""Hyperparameter sweep for PPO Dow30 — manual grid over (lr, clip_range).

각 trial:
  1. 짧은 학습 (steps_per_trial)
  2. 학습 데이터 in-sample + 2024~ out-of-sample 백테스트
  3. out-of-sample Sharpe로 best 선정

목적은 best 모델 산출보다 "어느 hyperparam이 안정적이고 데이터에 적합한지" 빠르게 보는 것.
사용:
  python -m scripts.sweep_ppo_dow30 --steps 30000 --n-envs 4
"""
from __future__ import annotations
import argparse
import itertools
import json
import time
from pathlib import Path

from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv

from scripts.data_loader import load_dow30, DEFAULT_UNIVERSE
from scripts.dow30_env import Dow30PortfolioEnv
from scripts.eval_ppo_dow30 import evaluate_period
from src.adapters.sb3 import SB3Adapter


def build_env(prices, window: int, n_envs: int):
    def make():
        return Dow30PortfolioEnv(prices=prices, window=window)
    if n_envs > 1:
        return SubprocVecEnv([make for _ in range(n_envs)], start_method="spawn")
    return DummyVecEnv([make])


def run_trial(
    prices,
    out_dir: Path,
    trial_id: int,
    lr: float,
    clip_range: float,
    gamma: float,
    n_envs: int,
    steps: int,
    n_steps: int,
    batch_size: int,
    window: int,
) -> dict:
    print(f"\n[trial {trial_id}] lr={lr:.0e} clip={clip_range} gamma={gamma}")
    env = build_env(prices, window, n_envs)
    model = PPO(
        "MlpPolicy", env,
        n_steps=n_steps, batch_size=batch_size,
        learning_rate=lr, clip_range=clip_range, gamma=gamma,
        verbose=0, device="cpu",
    )
    t0 = time.time()
    model.learn(total_timesteps=steps, progress_bar=False)
    train_wall = time.time() - t0

    ckpt_path = out_dir / f"trial_{trial_id}.zip"
    model.save(str(ckpt_path))
    if hasattr(env, "close"):
        env.close()

    # Eval
    adapter = SB3Adapter.load(checkpoint_path=str(ckpt_path), algorithm="PPO")
    in_s = evaluate_period(
        adapter, str(ckpt_path), DEFAULT_UNIVERSE,
        "2014-01-01", "2023-12-31", window, f"trial{trial_id}_in", "./.cache/dow30",
    )
    out_s = evaluate_period(
        adapter, str(ckpt_path), DEFAULT_UNIVERSE,
        "2024-01-01", None, window, f"trial{trial_id}_out", "./.cache/dow30",
    )
    return {
        "trial": trial_id,
        "lr": lr, "clip_range": clip_range, "gamma": gamma,
        "train_wall_sec": round(train_wall, 1),
        "in_sample_sharpe": in_s["sharpe_ratio"],
        "out_of_sample_sharpe": out_s["sharpe_ratio"],
        "out_of_sample_return": out_s["total_return"],
        "out_of_sample_mdd": out_s["max_drawdown"],
    }


def main(args: argparse.Namespace) -> None:
    print(f"[sweep] loading prices ({args.start} → {args.end})")
    prices = load_dow30(start=args.start, end=args.end, cache_dir=args.cache_dir)
    print(f"[sweep] {len(prices)} rows × {prices.shape[1]} tickers")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Grid: 3 lr × 2 clip = 6 trials
    lrs = [1e-4, 3e-4, 1e-3]
    clips = [0.1, 0.3]
    gamma = 0.99

    results: list[dict] = []
    for i, (lr, clip) in enumerate(itertools.product(lrs, clips)):
        r = run_trial(
            prices=prices, out_dir=out_dir, trial_id=i,
            lr=lr, clip_range=clip, gamma=gamma,
            n_envs=args.n_envs, steps=args.steps,
            n_steps=args.n_steps, batch_size=args.batch_size, window=args.window,
        )
        results.append(r)
        print(f"[trial {i}] OOS sharpe={r['out_of_sample_sharpe']:.3f} "
              f"in={r['in_sample_sharpe']:.3f} return={r['out_of_sample_return']:+.2%} "
              f"wall={r['train_wall_sec']}s")

    results.sort(key=lambda x: x["out_of_sample_sharpe"], reverse=True)
    print("\n" + "=" * 70)
    print("SWEEP SUMMARY (sorted by OOS sharpe)")
    print(json.dumps(results, indent=2))
    print("=" * 70)
    best = results[0]
    print(f"\n[best] trial={best['trial']} lr={best['lr']:.0e} clip={best['clip_range']} "
          f"OOS_sharpe={best['out_of_sample_sharpe']:.3f}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--start", default="2014-01-01")
    p.add_argument("--end", default="2023-12-31")
    p.add_argument("--steps", type=int, default=30_000)
    p.add_argument("--n-envs", type=int, default=4)
    p.add_argument("--n-steps", type=int, default=2048)
    p.add_argument("--batch-size", type=int, default=256)
    p.add_argument("--window", type=int, default=30)
    p.add_argument("--cache-dir", default="./.cache/dow30")
    p.add_argument("--out-dir", default="./trained/sweep")
    return p.parse_args()


if __name__ == "__main__":
    main(parse_args())
