"""macro_indicators 시계열 로딩 (PostgREST 페이지네이션 적용)."""
import pandas as pd
from datetime import date
from regime.supabase_client import get_supabase

PAGE_SIZE = 1000


def load_macro(since: date) -> pd.DataFrame:
    """
    macro_indicators 전체를 pivot 한 wide DataFrame 반환.
    index=date, columns=[indicator_id1, indicator_id2, ...]
    PostgREST 기본 max-rows=1000 이므로 range() 로 페이지 누적.
    """
    sb = get_supabase()
    rows: list[dict] = []
    offset = 0
    while True:
        res = sb.table("macro_indicators").select(
            "date, indicator_id, value"
        ).gte("date", since.isoformat()).order(
            "date"
        ).range(offset, offset + PAGE_SIZE - 1).execute()
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
    return df.pivot_table(
        index="date", columns="indicator_id", values="value",
        aggfunc="first",
    ).sort_index()
