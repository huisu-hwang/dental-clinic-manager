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


class BacktestUniverseRequest(BaseModel):
    """Server-side fetch 모드: OHLCV 페치를 server(yfinance)에 위임."""
    model_id: str
    checkpoint_path: str
    algorithm: str
    kind: Literal["portfolio"]
    state_window: int = Field(ge=1, le=500)
    input_features: list[str]
    universe: list[str]
    start_date: str
    end_date: str
    initial_capital: float = 10000.0


class EquityPoint(BaseModel):
    date: str
    equity: float


class TradeRecord(BaseModel):
    """리밸런싱 기간별 종목 보유 내역. entry→exit 쌍으로 표현."""
    entry_date: str
    exit_date: str
    ticker: str
    direction: Literal["buy", "sell"] = "buy"
    entry_price: float
    exit_price: float
    quantity: float
    pnl: float
    pnl_percent: float
    holding_days: int


class BacktestResponse(BaseModel):
    total_return: float
    sharpe_ratio: float
    max_drawdown: float
    n_rebalances: int
    equity_curve: list[EquityPoint]
    # Buy & Hold 비교 (universe 동일가중 매입 후 보유)
    buy_hold_return: float = 0.0
    buy_hold_curve: list[EquityPoint] = []
    # 거래일 중 양수 수익 비율 (0.0 ~ 1.0)
    win_rate: float = 0.0
    # 리밸런싱별 종목 보유 내역
    trades: list[TradeRecord] = []
    metadata: dict


class DownloadRequest(BaseModel):
    model_id: str
    checkpoint_url: str
    checkpoint_sha256: str


class DownloadResponse(BaseModel):
    model_id: str
    path: str
    status: Literal["ready"] = "ready"
