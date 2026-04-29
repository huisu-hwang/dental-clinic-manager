import time
from fastapi import FastAPI, Depends, HTTPException
from src.auth import require_api_key
from src.config import get_settings
from src.model_registry import ModelRegistry
from src.adapters.sb3 import SB3Adapter
from src.inference.portfolio import PortfolioInferenceEngine
from src.schemas import (
    PredictRequest, PortfolioPredictResponse, SinglePredictResponse,
    BacktestRequest, BacktestUniverseRequest, BacktestResponse,
    DownloadRequest, DownloadResponse, OHLCVRow,
)
from src.model_registry import DownloadError, IntegrityError
from src.inference.backtest import run_backtest

settings = get_settings()
START_TIME = time.time()
registry = ModelRegistry(model_dir=settings.model_dir)
app = FastAPI(title="rl-inference-server", version="0.1.0")


def _get_or_load_adapter(req: PredictRequest) -> SB3Adapter:
    cached = registry.get_adapter(req.model_id)
    if isinstance(cached, SB3Adapter):
        return cached
    adapter = SB3Adapter.load(req.checkpoint_path, req.algorithm)
    registry.put_adapter(req.model_id, adapter)
    return adapter


@app.get("/health", dependencies=[Depends(require_api_key)])
def health():
    return {
        "status": "ok",
        "loaded_models": registry.loaded_models(),
        "uptime_seconds": round(time.time() - START_TIME, 2),
    }


@app.post(
    "/predict",
    dependencies=[Depends(require_api_key)],
    response_model=PortfolioPredictResponse | SinglePredictResponse,
)
def predict(req: PredictRequest):
    if req.kind != "portfolio":
        raise HTTPException(status_code=400, detail="single_asset is not supported in Phase 1")
    adapter = _get_or_load_adapter(req)
    engine = PortfolioInferenceEngine(adapter)
    try:
        return engine.run(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/backtest", dependencies=[Depends(require_api_key)], response_model=BacktestResponse)
def backtest(req: BacktestRequest):
    if req.kind != "portfolio":
        raise HTTPException(status_code=400, detail="single_asset backtest not supported in Phase 1")
    adapter = _get_or_load_adapter(req)
    return run_backtest(adapter, req)


@app.post("/backtest_universe", dependencies=[Depends(require_api_key)], response_model=BacktestResponse)
def backtest_universe(req: BacktestUniverseRequest):
    """Server-side fetch backtest: yfinance로 universe OHLCV를 가져와 시뮬레이션."""
    if req.kind != "portfolio":
        raise HTTPException(status_code=400, detail="single_asset backtest not supported in Phase 1")
    try:
        import yfinance as yf
        import pandas as pd
        import datetime as _dt
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"server missing yfinance: {e}")

    # state_window 봉 lookback 확보를 위해 시작일을 앞당김
    start = (_dt.datetime.fromisoformat(req.start_date) - _dt.timedelta(days=max(req.state_window * 2, 60))).strftime("%Y-%m-%d")
    df = yf.download(
        tickers=" ".join(req.universe), start=start, end=req.end_date,
        auto_adjust=True, progress=False, threads=True, group_by="ticker",
    )
    closes_dict = {t: df[t]["Close"] for t in req.universe if t in df.columns.get_level_values(0)}
    if not closes_dict:
        raise HTTPException(status_code=502, detail="yfinance returned no data for universe")
    closes = pd.DataFrame(closes_dict).dropna(axis=0, how="any")
    if len(closes) <= req.state_window + 5:
        raise HTTPException(
            status_code=400,
            detail=f"insufficient OHLCV after dropna: rows={len(closes)}, need >{req.state_window + 5}",
        )

    # OHLCVRow 객체로 변환 (close만 있어도 backtest 동작 — open/high/low/volume은 close로 채움)
    ohlcv: dict[str, list[OHLCVRow]] = {}
    for ticker in closes.columns:
        rows: list[OHLCVRow] = []
        for date_idx, close_val in closes[ticker].items():
            d = date_idx.strftime("%Y-%m-%d") if hasattr(date_idx, "strftime") else str(date_idx)
            cv = float(close_val)
            rows.append(OHLCVRow(date=d, open=cv, high=cv, low=cv, close=cv, volume=0))
        ohlcv[ticker] = rows

    # rebalance_dates: 매월 첫 거래일 (start_date 이후)
    all_dates = sorted({r.date for rows in ohlcv.values() for r in rows})
    eligible = [d for d in all_dates if d >= req.start_date]
    rebalance_dates: list[str] = []
    last_month: str | None = None
    for d in eligible:
        ym = d[:7]
        if ym != last_month:
            rebalance_dates.append(d)
            last_month = ym
    if not rebalance_dates:
        raise HTTPException(status_code=400, detail="no rebalance dates in given range")

    # Reuse predict adapter cache via dummy PredictRequest-like loader
    cached = registry.get_adapter(req.model_id)
    if isinstance(cached, SB3Adapter):
        adapter = cached
    else:
        adapter = SB3Adapter.load(req.checkpoint_path, req.algorithm)
        registry.put_adapter(req.model_id, adapter)

    inner_req = BacktestRequest(
        model_id=req.model_id, checkpoint_path=req.checkpoint_path,
        algorithm=req.algorithm, kind=req.kind, state_window=req.state_window,
        input_features=req.input_features, ohlcv=ohlcv,
        rebalance_dates=rebalance_dates, initial_capital=req.initial_capital,
    )
    return run_backtest(adapter, inner_req)


@app.post("/models/download", dependencies=[Depends(require_api_key)], response_model=DownloadResponse)
async def models_download(req: DownloadRequest):
    try:
        path = await registry.download(req.model_id, req.checkpoint_url, req.checkpoint_sha256)
    except IntegrityError as e:
        raise HTTPException(status_code=400, detail=f"sha256 mismatch: {e}")
    except DownloadError as e:
        raise HTTPException(status_code=502, detail=f"download failed: {e}")
    return DownloadResponse(model_id=req.model_id, path=path)
