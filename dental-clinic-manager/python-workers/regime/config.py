"""Regime worker config (env-driven, no secrets in code)."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
FRED_API_KEY = os.environ["FRED_API_KEY"]
ECOS_API_KEY = os.environ["ECOS_API_KEY"]

MODEL_VERSION = "2026.05.18"

# 시장 지수 6개 — Phase 1 학습 대상
MARKETS = {
    "KOSPI":       {"market": "KR", "ticker": "^KS11"},
    "KOSDAQ":      {"market": "KR", "ticker": "^KQ11"},
    "SP500":       {"market": "US", "ticker": "^GSPC"},
    "NASDAQ":      {"market": "US", "ticker": "^IXIC"},
    "DOW":         {"market": "US", "ticker": "^DJI"},
    "RUSSELL2000": {"market": "US", "ticker": "^RUT"},
}

# GICS 11 섹터 (Phase 2)
GICS_SECTORS_KR = ["TECH","COMM","FIN","INDUS","CONS_DISC","CONS_STAPLE",
                   "HEALTH","ENERGY","UTIL","MATERIAL","REIT"]
GICS_SECTORS_US = GICS_SECTORS_KR[:]

# FRED 매크로 지표 — US
FRED_INDICATORS = [
    "VIXCLS",        # S&P500 변동성
    "DGS10",         # US 10Y 국채
    "DGS2",          # US 2Y 국채
    "T10Y2Y",        # 10Y-2Y 스프레드
    "DTWEXBGS",      # 달러지수 (광범위)
    "DFF",           # 연방기준금리 effective
    "BAMLH0A0HYM2",  # 하이일드 신용스프레드
]

# ECOS 매크로 지표 — KR (statCode, itemCode)
ECOS_INDICATORS = {
    "KR_BASE_RATE": ("722Y001", "0101000"),  # 한국 기준금리
    "KRW_USD":      ("731Y001", "0000001"),  # 원/달러 환율
}

STATES = ["bull", "bear", "sideways", "crisis"]
