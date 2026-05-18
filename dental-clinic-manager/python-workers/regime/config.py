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

# GICS 11 섹터 — US 는 SPDR XL 시리즈 정확 매핑, KR 은 KODEX 일부만 (정확 매핑 가능한 것)
SECTORS = {
    # US (SPDR Select Sector ETF — GICS 공식 매핑)
    "US_TECH":          {"market": "US", "ticker": "XLK",  "label": "Technology"},
    "US_FIN":           {"market": "US", "ticker": "XLF",  "label": "Financials"},
    "US_HEALTH":        {"market": "US", "ticker": "XLV",  "label": "Health Care"},
    "US_ENERGY":        {"market": "US", "ticker": "XLE",  "label": "Energy"},
    "US_INDUS":         {"market": "US", "ticker": "XLI",  "label": "Industrials"},
    "US_CONS_DISC":     {"market": "US", "ticker": "XLY",  "label": "Consumer Discretionary"},
    "US_CONS_STAPLE":   {"market": "US", "ticker": "XLP",  "label": "Consumer Staples"},
    "US_UTIL":          {"market": "US", "ticker": "XLU",  "label": "Utilities"},
    "US_MATERIAL":      {"market": "US", "ticker": "XLB",  "label": "Materials"},
    "US_REIT":          {"market": "US", "ticker": "XLRE", "label": "Real Estate"},
    "US_COMM":          {"market": "US", "ticker": "XLC",  "label": "Communication Services"},
    # KR (KODEX 섹터 ETF — GICS 매핑 가능한 것만)
    "KR_SEMI":          {"market": "KR", "ticker": "091160", "label": "반도체 (KODEX)"},
    "KR_BANK":          {"market": "KR", "ticker": "091170", "label": "은행 (KODEX)"},
    "KR_AUTO":          {"market": "KR", "ticker": "091180", "label": "자동차 (KODEX)"},
    "KR_BIO":           {"market": "KR", "ticker": "244580", "label": "바이오 (KODEX)"},
    "KR_SECURITIES":    {"market": "KR", "ticker": "102970", "label": "증권 (KODEX)"},
    "KR_BUILD":         {"market": "KR", "ticker": "117700", "label": "건설 (KODEX)"},
    "KR_STEEL":         {"market": "KR", "ticker": "117680", "label": "철강 (KODEX)"},
    "KR_ENERGY_CHEM":   {"market": "KR", "ticker": "117460", "label": "에너지화학 (KODEX)"},
    "KR_IT":            {"market": "KR", "ticker": "157490", "label": "IT (KODEX)"},
    "KR_CONS":          {"market": "KR", "ticker": "266390", "label": "필수소비재 (KODEX)"},
    "KR_TRANSPORT":     {"market": "KR", "ticker": "140710", "label": "운송 (KODEX)"},
}

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
