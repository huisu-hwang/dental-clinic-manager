"""ECOS Korea BOK API fetcher → macro_indicators upsert."""
import httpx
from datetime import date
from regime.config import ECOS_API_KEY, ECOS_INDICATORS
from regime.fetchers.fred_fetcher import upsert_macro


def fetch_indicator(stat_code: str, item_code: str,
                    start_yyyymmdd: str, end_yyyymmdd: str) -> list[dict]:
    """ECOS StatisticSearch API (daily cycle)."""
    url = (f"https://ecos.bok.or.kr/api/StatisticSearch/{ECOS_API_KEY}/json/kr/1/10000/"
           f"{stat_code}/D/{start_yyyymmdd}/{end_yyyymmdd}/{item_code}")
    r = httpx.get(url, timeout=30)
    r.raise_for_status()
    body = r.json()
    # ECOS returns {"StatisticSearch": {"row": [...]}} on success,
    # {"RESULT": {"CODE": "INFO-200", "MESSAGE": "..."}} on no-data
    data = body.get("StatisticSearch", {}).get("row", [])
    rows = []
    for d in data:
        t = d["TIME"]
        rows.append({
            "date": f"{t[:4]}-{t[4:6]}-{t[6:8]}",
            "source": "ECOS",
            "indicator_id": stat_code + "_" + item_code,
            "value": float(d["DATA_VALUE"]),
        })
    return rows


def fetch_all_ecos(since: date, until: date) -> int:
    """Fetch all configured ECOS indicators in range. Returns row count."""
    total = 0
    s, e = since.strftime("%Y%m%d"), until.strftime("%Y%m%d")
    for key, (stat, item) in ECOS_INDICATORS.items():
        rows = fetch_indicator(stat, item, s, e)
        # 통일된 indicator_id 로 변경 (KR_BASE_RATE 등)
        for r in rows:
            r["indicator_id"] = key
        total += upsert_macro(rows)
    return total
