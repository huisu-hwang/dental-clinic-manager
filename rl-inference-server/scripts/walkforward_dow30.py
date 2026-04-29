"""Walk-forward cross-validation for PPO Dow30.

여러 rolling windows에 대해 학습+OOS 평가를 반복해 robustness 측정.

기본:
  Window i: train [start, train_end_i], test [train_end_i+1day, train_end_i+1y]
  expanding window (start fixed, train_end 매년 증가)

사용:
  python -m scripts.walkforward_dow30 --steps 30000 --n-envs 4
"""
from __future__ import annotations
import argparse
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


def run_window(
    out_dir: Path,
    window_id: int,
    train_start: str,
    train_end: str,
    test_start: str,
    test_end: str | None,
    steps: int,
    n_envs: int,
    n_steps: int,
    batch_size: int,
    lr: float,
    clip_range: float,
    gamma: float,
    window: int,
    cache_dir: str,
) -> dict:
    print(f"\n[wf {window_id}] train {train_start}→{train_end}  test {test_start}→{test_end or 'latest'}")
    train_prices = load_dow30(start=train_start, end=train_end, cache_dir=cache_dir)
    print(f"[wf {window_id}] train rows: {len(train_prices)}")

    env = build_env(train_prices, window, n_envs)
    model = PPO(
        "MlpPolicy", env,
        n_steps=n_steps, batch_size=batch_size,
        learning_rate=lr, clip_range=clip_range, gamma=gamma,
        verbose=0, device="cpu",
    )
    t0 = time.time()
    model.learn(total_timesteps=steps, progress_bar=False)
    train_wall = time.time() - t0
    if hasattr(env, "close"):
        env.close()

    ckpt = out_dir / f"wf_{window_id}.zip"
    model.save(str(ckpt))
    adapter = SB3Adapter.load(checkpoint_path=str(ckpt), algorithm="PPO")
    test_metrics = evaluate_period(
        adapter, str(ckpt), DEFAULT_UNIVERSE,
        test_start, test_end, window, f"wf{window_id}_test", cache_dir,
    )
    return {
        "window_id": window_id,
        "train_period": f"{train_start}..{train_end}",
        "test_period": f"{test_start}..{test_end or 'latest'}",
        "train_wall_sec": round(train_wall, 1),
        "sharpe": test_metrics["sharpe_ratio"],
        "total_return": test_metrics["total_return"],
        "max_drawdown": test_metrics["max_drawdown"],
        "n_rebalances": test_metrics["n_rebalances"],
    }


def main(args: argparse.Namespace) -> None:
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # Expanding-window WF: train [2019-04, year_end], test [year+1].
    # 시작이 2019-04인 이유: DOW(Dow Inc.)가 2019-04 spinoff이므로 그 이전 데이터 없음 →
    # 30종목 dropna로 빈 데이터프레임이 됨. 2019-04부터는 30종목 모두 가용.
    train_start = "2019-04-01"
    test_years = [2021, 2022, 2023, 2024]  # train end는 (year-1)-12-31
    results: list[dict] = []
    for i, ty in enumerate(test_years):
        train_end = f"{ty - 1}-12-31"
        test_start = f"{ty}-01-01"
        test_end = f"{ty}-12-31"
        r = run_window(
            out_dir=out_dir, window_id=i,
            train_start=train_start, train_end=train_end,
            test_start=test_start, test_end=test_end,
            steps=args.steps, n_envs=args.n_envs,
            n_steps=args.n_steps, batch_size=args.batch_size,
            lr=args.lr, clip_range=args.clip_range, gamma=args.gamma,
            window=args.window, cache_dir=args.cache_dir,
        )
        results.append(r)
        print(f"[wf {i}] sharpe={r['sharpe']:+.3f} return={r['total_return']:+.2%} mdd={r['max_drawdown']:+.2%} wall={r['train_wall_sec']}s")

    sharpes = [r["sharpe"] for r in results]
    returns = [r["total_return"] for r in results]
    mean_sharpe = sum(sharpes) / len(sharpes)
    std_sharpe = (sum((s - mean_sharpe) ** 2 for s in sharpes) / len(sharpes)) ** 0.5
    mean_return = sum(returns) / len(returns)

    print("\n" + "=" * 80)
    print("WALK-FORWARD SUMMARY")
    print(json.dumps({
        "n_windows": len(results),
        "mean_sharpe": round(mean_sharpe, 3),
        "std_sharpe": round(std_sharpe, 3),
        "mean_return": round(mean_return, 4),
        "details": results,
    }, indent=2, default=str))
    print("=" * 80)
    print(f"\n[wf] mean Sharpe={mean_sharpe:+.3f} ± {std_sharpe:.3f}  mean return={mean_return:+.2%}")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--steps", type=int, default=30_000)
    p.add_argument("--n-envs", type=int, default=4)
    p.add_argument("--n-steps", type=int, default=2048)
    p.add_argument("--batch-size", type=int, default=256)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--clip-range", type=float, default=0.1)
    p.add_argument("--gamma", type=float, default=0.99)
    p.add_argument("--window", type=int, default=30)
    p.add_argument("--cache-dir", default="./.cache/dow30")
    p.add_argument("--out-dir", default="./trained/wf")
    return p.parse_args()


if __name__ == "__main__":
    main(parse_args())
