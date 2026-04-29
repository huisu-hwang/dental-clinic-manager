"""Train PPO on Dow30PortfolioEnvV2 (reward shaping + 확장 state).

사용:
  python -m scripts.train_ppo_dow30_v2 \
    --start 2019-04-01 --end 2023-12-31 \
    --steps 60000 --n-envs 8 --lr 1e-3 --clip-range 0.1 \
    --output ./trained/ppo_dow30_v2.zip
"""
from __future__ import annotations
import argparse
import hashlib
import time
from pathlib import Path

from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv

from scripts.data_loader_v2 import load_dow30_with_volume
from scripts.dow30_env_v2 import Dow30PortfolioEnvV2


def main(args: argparse.Namespace) -> None:
    print(f"[train v2] loading {args.start} → {args.end}")
    prices, volumes = load_dow30_with_volume(start=args.start, end=args.end, cache_dir=args.cache_dir)
    print(f"[train v2] loaded {len(prices)} rows × {prices.shape[1]} tickers")

    def make_env():
        return Dow30PortfolioEnvV2(
            prices=prices, volumes=volumes,
            window=args.window,
            turnover_penalty=args.turnover_penalty,
            downside_penalty=args.downside_penalty,
        )

    if args.n_envs > 1:
        env = SubprocVecEnv([make_env for _ in range(args.n_envs)], start_method="spawn")
        print(f"[train v2] SubprocVecEnv n_envs={args.n_envs}")
    else:
        env = DummyVecEnv([make_env])

    model = PPO(
        "MlpPolicy", env,
        n_steps=args.n_steps, batch_size=args.batch_size,
        learning_rate=args.lr, clip_range=args.clip_range, gamma=args.gamma,
        verbose=1, device="cpu",
    )
    print(f"[train v2] {args.steps} steps (downside={args.downside_penalty}, turnover={args.turnover_penalty})")
    t0 = time.time()
    model.learn(total_timesteps=args.steps, progress_bar=False)
    wall = time.time() - t0
    print(f"[train v2] wall {wall:.1f}s ({args.steps / wall:.0f} steps/s)")

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    model.save(str(out))
    sha = hashlib.sha256(out.read_bytes()).hexdigest()
    size = out.stat().st_size
    print(f"\n[train v2] saved {out} ({size} bytes)")
    print(f"[train v2] sha256: {sha}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--start", default="2019-04-01")
    p.add_argument("--end", default="2023-12-31")
    p.add_argument("--steps", type=int, default=60_000)
    p.add_argument("--n-envs", type=int, default=8)
    p.add_argument("--n-steps", type=int, default=2048)
    p.add_argument("--batch-size", type=int, default=256)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--clip-range", type=float, default=0.1)
    p.add_argument("--gamma", type=float, default=0.99)
    p.add_argument("--window", type=int, default=30)
    p.add_argument("--turnover-penalty", type=float, default=1e-4)
    p.add_argument("--downside-penalty", type=float, default=5.0)
    p.add_argument("--cache-dir", default="./.cache/dow30")
    p.add_argument("--output", default="./trained/ppo_dow30_v2.zip")
    return p.parse_args()


if __name__ == "__main__":
    main(parse_args())
