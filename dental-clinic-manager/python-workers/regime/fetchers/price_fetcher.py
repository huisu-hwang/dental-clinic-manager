"""Price fetcher — Supabase stock_price_cache 조회."""
import pandas as pd
from datetime import date
from regime.supabase_client import get_supabase


PAGE_SIZE = 1000


def fetch_prices(ticker: str, market: str, since: date) -> pd.DataFrame:
    """
    stock_price_cache 테이블에서 가격 조회 (페이지네이션 적용).
    PostgREST 기본 max-rows=1000 이므로 .range() 로 페이지 누적.
    Returns: DataFrame (index=date, columns=[open, high, low, close, volume])
    """
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
