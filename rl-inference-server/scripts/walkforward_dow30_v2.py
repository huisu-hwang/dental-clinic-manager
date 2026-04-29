"""Walk-forward CV for env v2."""
from __future__ import annotations
import argparse
import json
import time
from pathlib import Path

from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv

from scripts.data_loader_v2 import load_dow30_with_volume
from scripts.dow30_env_v2 import Dow30PortfolioEnvV2
from scripts.eval_ppo_dow30_v2 import evaluate as evaluate_v2


def build_env(prices, volumes, window: int, n_envs: int):
    def make():
        return Dow30PortfolioEnvV2(prices=prices, volumes=volumes, window=window)
    if n_envs > 1:
        return SubprocVecEnv([make for _ in range(n_envs)], start_method="spawn")
    return DummyVecEnv([make])


def run_window(out_dir: Path, window_id: int, train_start: str, train_end: str,
               test_start: str, test_end: str | None,
               steps: int, n_envs: int, n_steps: int, batch_size: int,
               lr: float, clip_range: float, gamma: float, window: int, cache_dir: str) -> dict:
    print(f"\n[wf v2 {window_id}] train {train_start}→{train_end}  test {test_start}→{test_end or 'latest'}")
    prices, volumes = load_dow30_with_volume(start=train_start, end=train_end, cache_dir=cache_dir)
    print(f"[wf v2 {window_id}] train rows: {len(prices)}")

    env = build_env(prices, volumes, window, n_envs)
    model = PPO("MlpPolicy", env, n_steps=n_steps, batch_size=batch_size,
                learning_rate=lr, clip_range=clip_range, gamma=gamma,
                verbose=0, device="cpu")
    t0 = time.time()
    model.learn(total_timesteps=steps, progress_bar=False)
    train_wall = time.time() - t0
    if hasattr(env, "close"):
        env.close()

    ckpt = out_dir / f"wf_v2_{window_id}.zip"
    model.save(str(ckpt))
    test = evaluate_v2(str(ckpt), test_start, test_end, window, cache_dir, f"wf{window_id}")
    return {
        "window_id": window_id,
        "train_period": f"{train_start}..{train_end}",
        "test_period": f"{test_start}..{test_end or 'latest'}",
        "train_wall_sec": round(train_wall, 1),
        "sharpe": test["sharpe"],
        "total_return": test["total_return"],
        "max_drawdown": test["max_drawdown"],
    }


def main(args: argparse.Namespace) -> None:
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    train_start = "2019-04-01"
    test_years = [2021, 2022, 2023, 2024]
    results: list[dict] = []
    for i, ty in enumerate(test_years):
        r = run_window(
            out_dir=out_dir, window_id=i,
            train_start=train_start, train_end=f"{ty - 1}-12-31",
            test_start=f"{ty}-01-01", test_end=f"{ty}-12-31",
            steps=args.steps, n_envs=args.n_envs,
            n_steps=args.n_steps, batch_size=args.batch_size,
            lr=args.lr, clip_range=args.clip_range, gamma=args.gamma,
            window=args.window, cache_dir=args.cache_dir,
        )
        results.append(r)
        print(f"[wf v2 {i}] sharpe={r['sharpe']:+.3f} return={r['total_return']:+.2%} mdd={r['max_drawdown']:+.2%} wall={r['train_wall_sec']}s")

    sharpes = [r["sharpe"] for r in results]
    returns = [r["total_return"] for r in results]
    mean_sharpe = sum(sharpes) / len(sharpes)
    std_sharpe = (sum((s - mean_sharpe) ** 2 for s in sharpes) / len(sharpes)) ** 0.5
    print("\n" + "=" * 70)
    print(json.dumps({
        "n_windows": len(results),
        "mean_sharpe": round(mean_sharpe, 3),
        "std_sharpe": round(std_sharpe, 3),
        "mean_return": round(sum(returns) / len(returns), 4),
        "details": results,
    }, indent=2, default=str))
    print(f"\n[wf v2] mean Sharpe={mean_sharpe:+.3f} ± {std_sharpe:.3f}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--steps", type=int, default=60_000)
    p.add_argument("--n-envs", type=int, default=4)
    p.add_argument("--n-steps", type=int, default=2048)
    p.add_argument("--batch-size", type=int, default=256)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--clip-range", type=float, default=0.1)
    p.add_argument("--gamma", type=float, default=0.99)
    p.add_argument("--window", type=int, default=30)
    p.add_argument("--cache-dir", default="./.cache/dow30")
    p.add_argument("--out-dir", default="./trained/wf_v2")
    return p.parse_args()


if __name__ == "__main__":
    main(parse_args())
