"""Train a SB3 PPO agent on Dow 30 portfolio env, save the ckpt + sha256.

Usage:
  python -m scripts.train_ppo_dow30 \
    --start 2014-01-01 --end 2024-12-31 \
    --steps 50000 --output ./trained/ppo_dow30.zip
"""
from __future__ import annotations
import argparse
import hashlib
from pathlib import Path

import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv

from scripts.data_loader import load_dow30, DEFAULT_UNIVERSE
from scripts.dow30_env import Dow30PortfolioEnv


def main(args: argparse.Namespace) -> None:
    print(f"[train] loading OHLCV {args.start} → {args.end}")
    prices = load_dow30(start=args.start, end=args.end, cache_dir=args.cache_dir)
    print(f"[train] loaded {len(prices)} rows × {prices.shape[1]} tickers")

    def make_env():
        return Dow30PortfolioEnv(prices=prices, window=args.window)

    vec_env = DummyVecEnv([make_env])
    model = PPO(
        "MlpPolicy", vec_env,
        n_steps=args.n_steps,
        batch_size=args.batch_size,
        learning_rate=args.lr,
        gamma=0.99,
        verbose=1,
        device="cpu",
    )
    print(f"[train] starting {args.steps} timesteps...")
    model.learn(total_timesteps=args.steps, progress_bar=False)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    model.save(str(out))
    sha256 = hashlib.sha256(out.read_bytes()).hexdigest()
    size = out.stat().st_size
    print(f"\n[train] saved {out} ({size} bytes)")
    print(f"[train] sha256: {sha256}")
    print("\n[train] register with the API by inserting into rl_models with:")
    print(f"  source: 'custom'")
    print(f"  algorithm: 'PPO'")
    print(f"  kind: 'portfolio'")
    print(f"  state_window: {args.window}")
    print(f"  output_shape: {{type: 'continuous', dim: {len(prices.columns)}}}")
    print(f"  universe: {list(prices.columns)}")
    print(f"  checkpoint_url: file://{out.resolve()}")
    print(f"  checkpoint_sha256: {sha256}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--start", default="2014-01-01")
    p.add_argument("--end", default=None)
    p.add_argument("--steps", type=int, default=50_000)
    p.add_argument("--n-steps", type=int, default=2048)
    p.add_argument("--batch-size", type=int, default=64)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--window", type=int, default=30)
    p.add_argument("--cache-dir", default="./.cache/dow30")
    p.add_argument("--output", default="./trained/ppo_dow30.zip")
    return p.parse_args()


if __name__ == "__main__":
    main(parse_args())
