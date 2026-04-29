from fastapi import Header, HTTPException, status
from src.config import get_settings


def require_api_key(x_rl_api_key: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if not x_rl_api_key or x_rl_api_key != settings.rl_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or missing X-RL-API-KEY",
        )
