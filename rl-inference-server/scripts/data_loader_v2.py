"""yfinance loader returning both close prices and volumes (for env v2)."""
from __future__ import annotations
from pathlib import Path
import pandas as pd

from scripts.data_loader import DEFAULT_UNIVERSE


def load_dow30_with_volume(
    start: str = "2014-01-01",
    end: str | None = None,
    universe: list[str] | None = None,
    cache_dir: str | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    universe = universe or DEFAULT_UNIVERSE
    if cache_dir is not None:
        cdir = Path(cache_dir)
        cdir.mkdir(parents=True, exist_ok=True)
        prices_path = cdir / f"v2_close_{start}_{end or 'latest'}.parquet"
        volumes_path = cdir / f"v2_volume_{start}_{end or 'latest'}.parquet"
        if prices_path.exists() and volumes_path.exists():
            return pd.read_parquet(prices_path), pd.read_parquet(volumes_path)

    import yfinance as yf
    df = yf.download(
        tickers=" ".join(universe),
        start=start, end=end,
        auto_adjust=True, progress=False, threads=True, group_by="ticker",
    )
    closes = pd.DataFrame({t: df[t]["Close"] for t in universe if t in df.columns.get_level_values(0)})
    volumes = pd.DataFrame({t: df[t]["Volume"] for t in universe if t in df.columns.get_level_values(0)})
    # 둘 다 같은 인덱스에서 dropna(any) → 일관된 시계열
    common_idx = closes.dropna(how="any").index.intersection(volumes.dropna(how="any").index)
    closes = closes.loc[common_idx]
    volumes = volumes.loc[common_idx]

    if cache_dir is not None:
        closes.to_parquet(prices_path)
        volumes.to_parquet(volumes_path)
    return closes, volumes
