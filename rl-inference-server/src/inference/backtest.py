from __future__ import annotations
import time
import numpy as np
from src.adapters.sb3 import SB3Adapter
from src.inference.portfolio import PortfolioInferenceEngine
from src.schemas import (
    BacktestRequest, BacktestResponse, EquityPoint, PredictRequest, TradeRecord,
)


def _days_between(start: str, end: str) -> int:
    from datetime import date
    sy, sm, sd = (int(x) for x in start.split("-"))
    ey, em, ed = (int(x) for x in end.split("-"))
    return (date(ey, em, ed) - date(sy, sm, sd)).days


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

    # 거래 내역 추적: 리밸런싱마다 종목별 (entry_date, entry_price, quantity) 저장 → 다음 리밸런싱 시 청산 처리
    open_positions: dict[str, dict] = {}  # ticker → {entry_date, entry_price, quantity}
    trades: list[TradeRecord] = []

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
                # 1) 기존 포지션 청산 (현재 가격으로 exit) → trade 기록 생성
                for t, pos in open_positions.items():
                    exit_price = float(prices[t])
                    pnl = (exit_price - pos["entry_price"]) * pos["quantity"]
                    pnl_pct = (exit_price / pos["entry_price"] - 1.0) * 100.0 if pos["entry_price"] > 0 else 0.0
                    trades.append(TradeRecord(
                        entry_date=pos["entry_date"], exit_date=date, ticker=t,
                        direction="buy",
                        entry_price=pos["entry_price"], exit_price=exit_price,
                        quantity=pos["quantity"],
                        pnl=pnl, pnl_percent=pnl_pct,
                        holding_days=max(0, _days_between(pos["entry_date"], date)),
                    ))
                # 2) 신규 가중치로 포지션 진입
                open_positions = {}
                new_weights = pred.weights
                for t in tickers:
                    w = float(new_weights.get(t, 0.0))
                    if w > 1e-6:
                        entry_price = float(prices[t])
                        qty = (equity * w) / entry_price if entry_price > 0 else 0.0
                        open_positions[t] = {
                            "entry_date": date,
                            "entry_price": entry_price,
                            "quantity": qty,
                        }
                weights = new_weights
                n_rebalances += 1
            except Exception:
                pass

        curve.append(EquityPoint(date=date, equity=equity))

    # 마지막 보유 포지션은 마지막 가격으로 청산 처리 (끝까지 들고 있던 케이스)
    if open_positions and curve:
        last_date = curve[-1].date
        last_prices = {t: rows_by_t[t].get(last_date) for t in tickers}
        for t, pos in open_positions.items():
            exit_price = float(last_prices.get(t) or pos["entry_price"])
            pnl = (exit_price - pos["entry_price"]) * pos["quantity"]
            pnl_pct = (exit_price / pos["entry_price"] - 1.0) * 100.0 if pos["entry_price"] > 0 else 0.0
            trades.append(TradeRecord(
                entry_date=pos["entry_date"], exit_date=last_date, ticker=t,
                direction="buy",
                entry_price=pos["entry_price"], exit_price=exit_price,
                quantity=pos["quantity"],
                pnl=pnl, pnl_percent=pnl_pct,
                holding_days=max(0, _days_between(pos["entry_date"], last_date)),
            ))

    if not curve:
        curve = [EquityPoint(date=all_dates[0] if all_dates else "1970-01-01", equity=equity)]

    equities = np.array([p.equity for p in curve], dtype=np.float64)
    rets = np.diff(equities) / equities[:-1] if equities.size >= 2 else np.array([0.0])
    total_return = float(equities[-1] / req.initial_capital - 1.0)
    sharpe = float(rets.mean() / rets.std() * np.sqrt(252)) if rets.std() > 0 else 0.0
    peak = np.maximum.accumulate(equities)
    drawdown = (equities - peak) / peak
    max_dd = float(drawdown.min()) if drawdown.size else 0.0
    # 승률: 일별 양수 수익 비율 (0~1.0)
    win_rate = float((rets > 0).sum() / len(rets)) if rets.size else 0.0

    # Buy & Hold (universe 동일가중 매수 후 보유) 비교 — curve 첫 날 가격 기준
    bh_curve: list[EquityPoint] = []
    bh_total_return = 0.0
    if curve:
        first_date = curve[0].date
        first_prices = {t: rows_by_t[t].get(first_date) for t in tickers}
        valid_tickers = [t for t in tickers if first_prices.get(t) and first_prices[t] > 0]
        if valid_tickers:
            w = 1.0 / len(valid_tickers)
            shares = {t: (req.initial_capital * w) / first_prices[t] for t in valid_tickers}
            for p in curve:
                d = p.date
                day_prices = {t: rows_by_t[t].get(d) for t in valid_tickers}
                if any(v is None for v in day_prices.values()):
                    bh_curve.append(EquityPoint(date=d, equity=req.initial_capital))
                    continue
                val = sum(shares[t] * day_prices[t] for t in valid_tickers)
                bh_curve.append(EquityPoint(date=d, equity=float(val)))
            bh_total_return = float(bh_curve[-1].equity / req.initial_capital - 1.0)

    return BacktestResponse(
        total_return=total_return,
        sharpe_ratio=sharpe,
        max_drawdown=max_dd,
        n_rebalances=n_rebalances,
        equity_curve=curve,
        buy_hold_return=bh_total_return,
        buy_hold_curve=bh_curve,
        win_rate=win_rate,
        trades=trades,
        metadata={
            "model_id": req.model_id,
            "latency_ms": round((time.time() - t0) * 1000, 2),
            "n_dates": len(all_dates),
        },
    )
