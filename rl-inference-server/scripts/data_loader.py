"""Dow 30 OHLCV loader with parquet cache."""
from __future__ import annotations
from pathlib import Path
import pandas as pd

DEFAULT_UNIVERSE = [
    # WBA(Walgreens)는 2024-02 Dow에서 제외, AMZN로 대체.
    # 학습용으로 데이터 수급 안정적인 30종목 유지.
    "AAPL","MSFT","UNH","JNJ","V","WMT","PG","JPM","HD","CVX",
    "MA","KO","PFE","DIS","CSCO","VZ","ADBE","NKE","CRM","INTC",
    "MRK","AMZN","BA","CAT","GS","IBM","MMM","AXP","TRV","DOW",
]


def load_dow30(
    start: str = "2014-01-01",
    end: str | None = None,
    universe: list[str] | None = None,
    cache_dir: str | None = None,
) -> pd.DataFrame:
    """Return wide DataFrame indexed by date with columns = tickers; cells = adjusted close."""
    universe = universe or DEFAULT_UNIVERSE
    if cache_dir is not None:
        cache_path = Path(cache_dir) / f"dow30_{start}_{end or 'latest'}.parquet"
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        if cache_path.exists():
            return pd.read_parquet(cache_path)

    import yfinance as yf
    df = yf.download(
        tickers=" ".join(universe),
        start=start, end=end,
        auto_adjust=True, progress=False, threads=True, group_by="ticker",
    )
    # yfinance returns multi-index when multiple tickers; flatten to close-only
    closes = pd.DataFrame({t: df[t]["Close"] for t in universe if t in df.columns.get_level_values(0)})
    closes = closes.dropna(axis=0, how="any")
    if cache_dir is not None:
        closes.to_parquet(cache_path)
    return closes
