import time
from fastapi import FastAPI, Depends, HTTPException
from src.auth import require_api_key
from src.config import get_settings
from src.model_registry import ModelRegistry
from src.adapters.sb3 import SB3Adapter
from src.inference.portfolio import PortfolioInferenceEngine
from src.schemas import PredictRequest, PortfolioPredictResponse, SinglePredictResponse, BacktestRequest, BacktestResponse, DownloadRequest, DownloadResponse
from src.model_registry import DownloadError, IntegrityError
from src.inference.backtest import run_backtest

settings = get_settings()
START_TIME = time.time()
registry = ModelRegistry(model_dir=settings.model_dir)
app = FastAPI(title="rl-inference-server", version="0.1.0")


def _get_or_load_adapter(req: PredictRequest) -> SB3Adapter:
    cached = registry._cache_get(req.model_id)
    if isinstance(cached, SB3Adapter):
        return cached
    adapter = SB3Adapter.load(req.checkpoint_path, req.algorithm)
    registry._cache_set(req.model_id, adapter)
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


@app.post("/models/download", dependencies=[Depends(require_api_key)], response_model=DownloadResponse)
async def models_download(req: DownloadRequest):
    try:
        path = await registry.download(req.model_id, req.checkpoint_url, req.checkpoint_sha256)
    except IntegrityError as e:
        raise HTTPException(status_code=400, detail=f"sha256 mismatch: {e}")
    except DownloadError as e:
        raise HTTPException(status_code=502, detail=f"download failed: {e}")
    return DownloadResponse(model_id=req.model_id, path=path)
