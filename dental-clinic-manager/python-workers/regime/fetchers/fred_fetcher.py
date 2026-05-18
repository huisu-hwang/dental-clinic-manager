"""FRED API fetcher → macro_indicators upsert."""
import httpx
from datetime import date
from regime.config import FRED_API_KEY, FRED_INDICATORS
from regime.supabase_client import get_supabase

FRED_URL = "https://api.stlouisfed.org/fred/series/observations"


def fetch_indicator(indicator_id: str, start: date) -> list[dict]:
    """Fetch single FRED series from `start` onward."""
    params = {
        "series_id": indicator_id,
        "api_key": FRED_API_KEY,
        "file_type": "json",
        "observation_start": start.isoformat(),
    }
    r = httpx.get(FRED_URL, params=params, timeout=30)
    r.raise_for_status()
    rows = []
    for obs in r.json().get("observations", []):
        if obs["value"] == ".":  # FRED missing marker
            continue
        rows.append({
            "date": obs["date"],
            "source": "FRED",
            "indicator_id": indicator_id,
            "value": float(obs["value"]),
        })
    return rows


def upsert_macro(rows: list[dict]) -> int:
    if not rows:
        return 0
    res = get_supabase().table("macro_indicators").upsert(
        rows, on_conflict="date,source,indicator_id"
    ).execute()
    return len(res.data or [])


def fetch_all_fred(since: date) -> int:
    """Fetch all configured FRED indicators since date. Returns row count."""
    total = 0
    for ind in FRED_INDICATORS:
        rows = fetch_indicator(ind, since)
        total += upsert_macro(rows)
    return total
