import time
from fastapi import FastAPI, Depends
from src.auth import require_api_key
from src.config import get_settings
from src.model_registry import ModelRegistry

settings = get_settings()
START_TIME = time.time()
registry = ModelRegistry(model_dir=settings.model_dir)
app = FastAPI(title="rl-inference-server", version="0.1.0")


@app.get("/health", dependencies=[Depends(require_api_key)])
def health():
    return {
        "status": "ok",
        "loaded_models": registry.loaded_models(),
        "uptime_seconds": round(time.time() - START_TIME, 2),
    }
