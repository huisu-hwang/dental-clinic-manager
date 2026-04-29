from __future__ import annotations
import time
import numpy as np
from src.adapters.sb3 import SB3Adapter
from src.inference.portfolio import PortfolioInferenceEngine
from src.schemas import BacktestRequest, BacktestResponse, EquityPoint, PredictRequest


def run_backtest(adapter: SB3Adapter, req: BacktestRequest) -> BacktestResponse:
    t0 = time.time()
    engine = PortfolioInferenceEngine(adapter)
    tickers = sorted(req.ohlcv.keys())
    rows_by_t = {t: {row.date: row.close for row in req.ohlcv[t]} for t in tickers}
    all_dates = sorted({row.date for t in tickers for row in req.ohlcv[t]})

    equity = float(req.initial_capital)
    weights: dict[str, float] = {t: 0.0 for t in tickers}
    curve: list[EquityPoint] = []
    n_rebalances = 0

    prev_prices: dict[str, float] | None = None
    rebal_set = set(req.rebalance_dates)

    for date in all_dates:
        prices = {t: rows_by_t[t].get(date) for t in tickers}
        if any(p is None for p in prices.values()):
            continue
        if prev_prices is not None and any(weights.values()):
            ret = sum(weights[t] * (prices[t] / prev_prices[t] - 1.0) for t in tickers)
            equity *= (1.0 + ret)
        prev_prices = prices

        if date in rebal_set:
            sub_req = PredictRequest(
                model_id=req.model_id,
                checkpoint_path=req.checkpoint_path,
                algorithm=req.algorithm,
                kind=req.kind,
                state_window=req.state_window,
                input_features=req.input_features,
                ohlcv={
                    t: [r for r in req.ohlcv[t] if r.date <= date][-req.state_window:]
                    for t in tickers
                },
            )
            try:
                pred = engine.run(sub_req)
                weights = pred.weights
                n_rebalances += 1
            except Exception:
                pass

        curve.append(EquityPoint(date=date, equity=equity))

    if not curve:
        curve = [EquityPoint(date=all_dates[0] if all_dates else "1970-01-01", equity=equity)]

    equities = np.array([p.equity for p in curve], dtype=np.float64)
    rets = np.diff(equities) / equities[:-1] if equities.size >= 2 else np.array([0.0])
    total_return = float(equities[-1] / req.initial_capital - 1.0)
    sharpe = float(rets.mean() / rets.std() * np.sqrt(252)) if rets.std() > 0 else 0.0
    peak = np.maximum.accumulate(equities)
    drawdown = (equities - peak) / peak
    max_dd = float(drawdown.min()) if drawdown.size else 0.0

    return BacktestResponse(
        total_return=total_return,
        sharpe_ratio=sharpe,
        max_drawdown=max_dd,
        n_rebalances=n_rebalances,
        equity_curve=curve,
        metadata={
            "model_id": req.model_id,
            "latency_ms": round((time.time() - t0) * 1000, 2),
            "n_dates": len(all_dates),
        },
    )
