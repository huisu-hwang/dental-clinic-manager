import time
from fastapi import FastAPI, Depends
from src.auth import require_api_key

START_TIME = time.time()
app = FastAPI(title="rl-inference-server", version="0.1.0")


@app.get("/health", dependencies=[Depends(require_api_key)])
def health():
    return {
        "status": "ok",
        "loaded_models": [],  # Task 4 will wire this to model registry
        "uptime_seconds": round(time.time() - START_TIME, 2),
    }
