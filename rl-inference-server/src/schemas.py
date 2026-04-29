from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field


class OHLCVRow(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class PredictRequest(BaseModel):
    model_id: str
    checkpoint_path: str
    algorithm: str
    kind: Literal["portfolio", "single_asset"]
    state_window: int = Field(ge=1, le=500)
    input_features: list[str]
    ohlcv: dict[str, list[OHLCVRow]]
    indicators: Optional[dict[str, dict[str, list[float]]]] = None
    current_positions: Optional[dict[str, dict]] = None


class PortfolioPredictResponse(BaseModel):
    kind: Literal["portfolio"] = "portfolio"
    weights: dict[str, float]
    confidence: float
    raw_action: list[float]
    metadata: dict


class SinglePredictResponse(BaseModel):
    kind: Literal["single_asset"] = "single_asset"
    action: Literal["buy", "sell", "hold"]
    size_hint: Optional[float] = None
    confidence: float
    metadata: dict


class BacktestRequest(PredictRequest):
    rebalance_dates: list[str]
    initial_capital: float = 10000.0


class EquityPoint(BaseModel):
    date: str
    equity: float


class BacktestResponse(BaseModel):
    total_return: float
    sharpe_ratio: float
    max_drawdown: float
    n_rebalances: int
    equity_curve: list[EquityPoint]
    metadata: dict
