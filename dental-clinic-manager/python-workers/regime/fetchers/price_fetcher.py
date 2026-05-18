"""Price fetcher — Supabase stock_price_cache 조회 + 시장지수는 yahoo fallback."""
import pandas as pd
from datetime import date
from regime.supabase_client import get_supabase
from regime.fetchers.yahoo_fetcher import fetch_index_prices

# Yahoo 직접 fetch 가 필요한 시장지수 ticker
INDEX_TICKERS = {"^KS11", "^KQ11", "^GSPC", "^IXIC", "^DJI", "^RUT"}


PAGE_SIZE = 1000


def fetch_prices(ticker: str, market: str, since: date) -> pd.DataFrame:
    """
    가격 조회 — 시장지수는 yahoo 직접 fetch, 그 외는 stock_price_cache 페이지네이션.
    Returns: DataFrame (index=date, columns=[open, high, low, close, volume])
    """
    # 시장지수는 cache 미포함 → yahoo direct
    if ticker in INDEX_TICKERS:
        return fetch_index_prices(ticker, since)

    sb = get_supabase()
    rows: list[dict] = []
    offset = 0
    while True:
        res = sb.table("stock_price_cache").select(
            "date, open, high, low, close, volume"
        ).eq("ticker", ticker).eq("market", market).gte(
            "date", since.isoformat()
        ).order("date").range(offset, offset + PAGE_SIZE - 1).execute()
        chunk = res.data or []
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").sort_index()
    # NUMERIC 컬럼이 string 으로 올 수 있음 → float 변환
    for col in ["open", "high", "low", "close", "volume"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df.dropna()
