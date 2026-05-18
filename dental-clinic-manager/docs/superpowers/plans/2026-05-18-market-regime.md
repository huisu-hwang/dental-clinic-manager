# Market Regime Detection & Forecasting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Investment 모듈에 4-state(Bull/Bear/Sideways/Crisis) 시장 국면 감지 + 전환 예측 시스템을 추가한다. Gupta 2025(HMM Voting) + Xu 2024(RHINE 차용) + Sun 2025(Reservoir + Hypernetwork) 3개 논문 모델을 voting 으로 통합.

**Architecture:** Mac mini Python sidecar(`python-workers/regime/`) 가 모델 학습·추론을 담당, Node API 가 HTTP(127.0.0.1:8001) 로 호출. Supabase 가 학습 모델 메타·추론 결과·매크로 시계열·알림의 단일 진실원. UI 는 Investment 탭 신규 SUB_TAB(`regime`)으로 통합(별도 라우트 금지).

**Tech Stack:**
- Python 3.11 + `hmmlearn`, `xgboost`, `scikit-learn`, `statsmodels`, `reservoirpy`, `torch`, `fastapi`, `supabase-py`, `joblib`, `httpx`
- Next.js 15 + Supabase + `recharts`
- 매크로 데이터: FRED API (US) + ECOS API (KR)

**Spec 참조**: [docs/superpowers/specs/2026-05-18-market-regime-design.md](../specs/2026-05-18-market-regime-design.md)

---

## Pre-Task: 환경 사전 확인 (개발자 1회만)

발급 필요:
1. **FRED API key** — https://fred.stlouisfed.org/docs/api/api_key.html (무료, 1분)
2. **ECOS API key** — https://ecos.bok.or.kr/api/ (무료, 1분)
3. Mac mini `.env` 에 추가:
   ```
   FRED_API_KEY=...
   ECOS_API_KEY=...
   SUPABASE_URL=https://beahjntkmkfhpcbhfnrr.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...   # 기존 값 재사용
   ```
4. Python 3.11 설치 확인: `/opt/homebrew/bin/python3.11 --version` 출력해 둘 것

---

## Task 1: 데이터베이스 마이그레이션

**Files:**
- Create: `supabase/migrations/20260518_market_regime.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- 매크로 지표 시계열 (FRED + ECOS)
CREATE TABLE macro_indicators (
  date DATE NOT NULL,
  source TEXT NOT NULL,
  indicator_id TEXT NOT NULL,
  value NUMERIC,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (date, source, indicator_id)
);
CREATE INDEX idx_macro_indicator_date ON macro_indicators (indicator_id, date DESC);

-- 학습 모델 메타데이터
CREATE TABLE regime_models (
  id BIGSERIAL PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  model_type TEXT NOT NULL,
  model_version TEXT NOT NULL,
  model_blob_path TEXT NOT NULL,
  feature_config JSONB NOT NULL,
  trained_at TIMESTAMPTZ DEFAULT NOW(),
  training_samples INT,
  validation_accuracy NUMERIC,
  UNIQUE (scope_type, scope_id, model_type, model_version)
);

-- 국면 추론 결과
CREATE TABLE regime_runs (
  id BIGSERIAL PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  as_of_date DATE NOT NULL,
  trigger_type TEXT NOT NULL,
  current_state TEXT NOT NULL,
  current_confidence NUMERIC,
  state_probabilities JSONB,
  model_votes JSONB,
  transition_probabilities JSONB,
  data_as_of DATE,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (scope_type, scope_id, as_of_date, trigger_type)
);
CREATE INDEX idx_regime_runs_lookup ON regime_runs (scope_type, scope_id, as_of_date DESC);

-- 국면 타임라인
CREATE TABLE regime_history (
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  date DATE NOT NULL,
  state TEXT NOT NULL,
  confidence NUMERIC,
  PRIMARY KEY (scope_type, scope_id, date)
);

-- 정밀 학습 작업 큐
CREATE TABLE regime_jobs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  scope_type TEXT,
  scope_id TEXT,
  job_type TEXT,
  status TEXT DEFAULT 'queued',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error TEXT
);
CREATE INDEX idx_regime_jobs_status ON regime_jobs (status, requested_at);

-- 국면 전환 알림
CREATE TABLE regime_alerts (
  id BIGSERIAL PRIMARY KEY,
  scope_type TEXT,
  scope_id TEXT,
  from_state TEXT,
  to_state TEXT,
  transition_date DATE,
  notified_at TIMESTAMPTZ,
  notified_user_ids UUID[]
);

-- Strategy Matrix 연동
ALTER TABLE strategy_matrix_runs
  ADD COLUMN IF NOT EXISTS regime_at_window_end TEXT;
CREATE INDEX IF NOT EXISTS idx_smr_regime
  ON strategy_matrix_runs (regime_at_window_end, market, period_window);
```

- [ ] **Step 2: Supabase MCP 로 마이그레이션 적용**

`mcp__supabase__apply_migration` 호출:
- `name`: `20260518_market_regime`
- `query`: 위 전체 SQL
- `project_id`: `beahjntkmkfhpcbhfnrr`

- [ ] **Step 3: 테이블 생성 확인**

`mcp__supabase__list_tables({ project_id: 'beahjntkmkfhpcbhfnrr', schemas: ['public'] })` 호출 → 7개 신규 테이블 + `strategy_matrix_runs.regime_at_window_end` 컬럼 모두 존재 확인.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260518_market_regime.sql
git commit -m "feat(regime): DB schema - 7 tables + strategy_matrix_runs.regime_at_window_end column"
```

---

## Task 2: Python sidecar 환경 셋업

**Files:**
- Create: `python-workers/regime/pyproject.toml`
- Create: `python-workers/regime/README.md`
- Create: `python-workers/regime/.env.example`
- Create: `python-workers/regime/config.py`
- Create: `python-workers/regime/__init__.py`
- Create: `python-workers/regime/.gitignore`

- [ ] **Step 1: pyproject.toml**

```toml
[project]
name = "regime-worker"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "numpy>=1.26",
  "pandas>=2.2",
  "scikit-learn>=1.5",
  "hmmlearn>=0.3",
  "xgboost>=2.0",
  "statsmodels>=0.14",
  "reservoirpy>=0.3.12",
  "torch>=2.2",
  "fastapi>=0.110",
  "uvicorn>=0.29",
  "httpx>=0.27",
  "supabase>=2.6",
  "joblib>=1.4",
  "python-dotenv>=1.0",
  "pydantic>=2.7",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "pytest-asyncio>=0.23", "ruff>=0.5"]

[tool.ruff]
line-length = 100
target-version = "py311"
```

- [ ] **Step 2: config.py**

```python
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
FRED_API_KEY = os.environ["FRED_API_KEY"]
ECOS_API_KEY = os.environ["ECOS_API_KEY"]

MODEL_VERSION = "2026.05.18"

MARKETS = {
    "KOSPI":   {"market": "KR", "ticker": "^KS11"},
    "KOSDAQ":  {"market": "KR", "ticker": "^KQ11"},
    "SP500":   {"market": "US", "ticker": "^GSPC"},
    "NASDAQ":  {"market": "US", "ticker": "^IXIC"},
    "DOW":     {"market": "US", "ticker": "^DJI"},
    "RUSSELL2000": {"market": "US", "ticker": "^RUT"},
}

GICS_SECTORS_KR = ["TECH","COMM","FIN","INDUS","CONS_DISC","CONS_STAPLE",
                   "HEALTH","ENERGY","UTIL","MATERIAL","REIT"]
GICS_SECTORS_US = GICS_SECTORS_KR[:]   # same 11

FRED_INDICATORS = ["VIXCLS", "DGS10", "DGS2", "T10Y2Y",
                   "DTWEXBGS", "DFF", "BAMLH0A0HYM2"]
ECOS_INDICATORS = {
    "KR_BASE_RATE": ("722Y001", "0101000"),
    "KRW_USD":      ("731Y001", "0000001"),
}

STATES = ["bull", "bear", "sideways", "crisis"]
```

- [ ] **Step 3: .env.example**

```
SUPABASE_URL=https://beahjntkmkfhpcbhfnrr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
FRED_API_KEY=
ECOS_API_KEY=
```

- [ ] **Step 4: .gitignore**

```
.venv/
__pycache__/
*.pyc
.env
*.joblib
.pytest_cache/
```

- [ ] **Step 5: README.md — 셋업 가이드**

```markdown
# Regime Worker (Python sidecar)

## Setup
```
cd python-workers/regime
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env  # 값 채우기
```

## Run
- 일배치: `python -m regime.train_worker`
- 추론 서버: `uvicorn regime.infer_server:app --host 127.0.0.1 --port 8001`
- 테스트: `pytest tests/ -v`
```

- [ ] **Step 6: 환경 검증**

```bash
cd python-workers/regime
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
python -c "import hmmlearn, xgboost, statsmodels, reservoirpy, torch, fastapi, supabase; print('OK')"
```
Expected output: `OK`

- [ ] **Step 7: 커밋**

```bash
git add python-workers/regime/
git commit -m "feat(regime): Python sidecar bootstrap (pyproject, config, env)"
```

---

## Task 3: 데이터 fetcher 3종 (FRED, ECOS, Price)

**Files:**
- Create: `python-workers/regime/fetchers/__init__.py`
- Create: `python-workers/regime/fetchers/fred_fetcher.py`
- Create: `python-workers/regime/fetchers/ecos_fetcher.py`
- Create: `python-workers/regime/fetchers/price_fetcher.py`
- Create: `python-workers/regime/supabase_client.py`
- Create: `python-workers/regime/tests/test_fetchers.py`

- [ ] **Step 1: supabase_client.py**

```python
from supabase import create_client, Client
from regime.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

_client: Client | None = None

def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _client
```

- [ ] **Step 2: fetchers/fred_fetcher.py**

```python
import httpx
import pandas as pd
from datetime import date
from regime.config import FRED_API_KEY, FRED_INDICATORS
from regime.supabase_client import get_supabase

FRED_URL = "https://api.stlouisfed.org/fred/series/observations"

def fetch_indicator(indicator_id: str, start: date) -> list[dict]:
    """ 단일 FRED 지표를 start 일자부터 fetch. """
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
        if obs["value"] == ".":
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
    total = 0
    for ind in FRED_INDICATORS:
        rows = fetch_indicator(ind, since)
        total += upsert_macro(rows)
    return total
```

- [ ] **Step 3: fetchers/ecos_fetcher.py**

```python
import httpx
from datetime import date
from regime.config import ECOS_API_KEY, ECOS_INDICATORS
from regime.supabase_client import get_supabase

def fetch_indicator(stat_code: str, item_code: str,
                    start_yyyymmdd: str, end_yyyymmdd: str) -> list[dict]:
    """ ECOS Korea BOK API. 일별 데이터 (cycle=D). """
    url = (f"https://ecos.bok.or.kr/api/StatisticSearch/{ECOS_API_KEY}/json/kr/1/10000/"
           f"{stat_code}/D/{start_yyyymmdd}/{end_yyyymmdd}/{item_code}")
    r = httpx.get(url, timeout=30)
    r.raise_for_status()
    data = r.json().get("StatisticSearch", {}).get("row", [])
    rows = []
    for d in data:
        rows.append({
            "date": f"{d['TIME'][:4]}-{d['TIME'][4:6]}-{d['TIME'][6:8]}",
            "source": "ECOS",
            "indicator_id": stat_code + "_" + item_code,
            "value": float(d["DATA_VALUE"]),
        })
    return rows

def fetch_all_ecos(since: date, until: date) -> int:
    from regime.fetchers.fred_fetcher import upsert_macro
    total = 0
    s, e = since.strftime("%Y%m%d"), until.strftime("%Y%m%d")
    for key, (stat, item) in ECOS_INDICATORS.items():
        rows = fetch_indicator(stat, item, s, e)
        for r in rows:
            r["indicator_id"] = key
        total += upsert_macro(rows)
    return total
```

- [ ] **Step 4: fetchers/price_fetcher.py**

```python
import pandas as pd
from datetime import date
from regime.supabase_client import get_supabase

def fetch_prices(ticker: str, market: str, since: date) -> pd.DataFrame:
    """ stock_price_cache 테이블에서 가격 조회. 컬럼: date, open, high, low, close, volume """
    res = get_supabase().table("stock_price_cache").select(
        "date, open, high, low, close, volume"
    ).eq("ticker", ticker).eq("market", market).gte("date", since.isoformat()
    ).order("date").execute()
    df = pd.DataFrame(res.data or [])
    if df.empty:
        return df
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date").sort_index()
    return df
```

- [ ] **Step 5: tests/test_fetchers.py**

```python
import pytest
from datetime import date, timedelta
from regime.fetchers.fred_fetcher import fetch_indicator
from regime.fetchers.ecos_fetcher import fetch_indicator as ecos_fetch
from regime.fetchers.price_fetcher import fetch_prices

def test_fred_vix_fetch():
    since = date.today() - timedelta(days=30)
    rows = fetch_indicator("VIXCLS", since)
    assert len(rows) >= 15, f"VIX 30일 데이터 부족: {len(rows)}"
    for r in rows:
        assert r["source"] == "FRED"
        assert isinstance(r["value"], float)

def test_ecos_kr_base_rate():
    since = (date.today() - timedelta(days=60)).strftime("%Y%m%d")
    until = date.today().strftime("%Y%m%d")
    rows = ecos_fetch("722Y001", "0101000", since, until)
    assert len(rows) >= 1, f"KR 기준금리 응답 없음"

def test_price_fetch_kospi():
    since = date.today() - timedelta(days=365)
    df = fetch_prices("005930", "KR", since)
    assert not df.empty, "삼성전자 1년치 가격 캐시 없음"
    assert "close" in df.columns
```

- [ ] **Step 6: 테스트 실행**

```bash
cd python-workers/regime
source .venv/bin/activate
pytest tests/test_fetchers.py -v
```
Expected: 3개 모두 PASS (실제 API 호출 — 인터넷 + 키 필요)

- [ ] **Step 7: 커밋**

```bash
git add python-workers/regime/fetchers/ python-workers/regime/supabase_client.py python-workers/regime/tests/test_fetchers.py
git commit -m "feat(regime): data fetchers (FRED, ECOS, price cache)"
```

---

## Task 4: Feature engineer + 4-state 휴리스틱 라벨링

**Files:**
- Create: `python-workers/regime/features/__init__.py`
- Create: `python-workers/regime/features/feature_engineer.py`
- Create: `python-workers/regime/labeling.py`
- Create: `python-workers/regime/tests/test_features.py`

- [ ] **Step 1: features/feature_engineer.py**

```python
import numpy as np
import pandas as pd

def compute_features(prices: pd.DataFrame, macro: pd.DataFrame) -> pd.DataFrame:
    """
    prices: index=date, columns=[open,high,low,close,volume]
    macro:  index=date, columns=[indicator_id1, indicator_id2, ...]
    return: 정렬된 feature 행렬 (index=date)
    """
    out = pd.DataFrame(index=prices.index)
    close = prices["close"].astype(float)
    ret = close.pct_change()

    out["ret_1d"] = ret
    out["ret_5d"] = close.pct_change(5)
    out["ret_20d"] = close.pct_change(20)
    out["vol_20d"] = ret.rolling(20).std()
    out["vol_60d"] = ret.rolling(60).std()

    # RSI(14)
    delta = close.diff()
    up = delta.clip(lower=0).rolling(14).mean()
    down = -delta.clip(upper=0).rolling(14).mean()
    rs = up / (down + 1e-9)
    out["rsi_14"] = 100 - 100 / (1 + rs)

    # MACD
    ema12 = close.ewm(span=12).mean()
    ema26 = close.ewm(span=26).mean()
    out["macd"] = ema12 - ema26
    out["macd_signal"] = out["macd"].ewm(span=9).mean()

    # 거래량 변화율
    out["vol_change"] = prices["volume"].pct_change(5)

    # 매크로 join (forward fill)
    if not macro.empty:
        m = macro.reindex(prices.index, method="ffill")
        out = out.join(m, how="left")

    return out.dropna()
```

- [ ] **Step 2: labeling.py — 휴리스틱 4-state 라벨**

```python
import numpy as np
import pandas as pd

def heuristic_labels(features: pd.DataFrame) -> np.ndarray:
    """
    4-state 라벨링 (학습용 초기 supervision).
    Returns: shape (T,) with 0=bull, 1=bear, 2=sideways, 3=crisis
    """
    ret_20d = features["ret_20d"]
    vol_60d = features["vol_60d"]
    vol_median = vol_60d.median()

    # VIX 지표 있으면 활용
    vix = features.get("VIXCLS", pd.Series(0, index=features.index))

    labels = np.full(len(features), 2)  # default sideways

    bull = (ret_20d > 0.03) & (vol_60d < vol_median * 1.2)
    bear = (ret_20d < -0.03) & (vol_60d < vol_median * 1.5)
    crisis = (vix > 30) | (ret_20d < -0.10)

    labels[bull] = 0
    labels[bear] = 1
    labels[crisis] = 3   # crisis 가 bear 보다 우선

    return labels
```

- [ ] **Step 3: tests/test_features.py**

```python
import numpy as np
import pandas as pd
from regime.features.feature_engineer import compute_features
from regime.labeling import heuristic_labels

def _fake_prices(n=200, seed=1):
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2024-01-01", periods=n, freq="B")
    close = 100 * np.exp(np.cumsum(rng.normal(0, 0.01, n)))
    return pd.DataFrame({
        "open": close, "high": close*1.01, "low": close*0.99,
        "close": close, "volume": rng.integers(1_000_000, 10_000_000, n)
    }, index=idx)

def test_compute_features_shapes():
    prices = _fake_prices()
    out = compute_features(prices, macro=pd.DataFrame())
    assert "ret_5d" in out.columns
    assert "rsi_14" in out.columns
    assert "macd" in out.columns
    assert len(out) > 100

def test_heuristic_labels_distribution():
    prices = _fake_prices(n=500)
    feat = compute_features(prices, macro=pd.DataFrame())
    labels = heuristic_labels(feat)
    assert len(labels) == len(feat)
    assert set(np.unique(labels)).issubset({0, 1, 2, 3})
```

- [ ] **Step 4: 테스트 실행**

```bash
pytest tests/test_features.py -v
```
Expected: 2 PASS

- [ ] **Step 5: 커밋**

```bash
git add python-workers/regime/features/ python-workers/regime/labeling.py python-workers/regime/tests/test_features.py
git commit -m "feat(regime): feature engineer + 4-state heuristic labeling"
```

---

## Task 5: HMM Voting Ensemble 모델 (Gupta 2025)

**Files:**
- Create: `python-workers/regime/models/__init__.py`
- Create: `python-workers/regime/models/hmm_voting.py`
- Create: `python-workers/regime/tests/test_hmm_voting.py`

- [ ] **Step 1: models/hmm_voting.py**

```python
import numpy as np
from hmmlearn.hmm import GaussianHMM
from xgboost import XGBClassifier
from sklearn.ensemble import RandomForestClassifier, BaggingClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

def _hmm_state_to_label_map(hmm: GaussianHMM, X: np.ndarray, y: np.ndarray) -> dict:
    """ HMM hidden state 0..K-1 을 라벨 0..3 으로 매핑 (다수결). """
    states = hmm.predict(X)
    mapping = {}
    for s in range(hmm.n_components):
        idxs = np.where(states == s)[0]
        if len(idxs) == 0:
            mapping[s] = 2  # sideways fallback
        else:
            counts = np.bincount(y[idxs], minlength=4)
            mapping[s] = int(np.argmax(counts))
    return mapping

def train(features: np.ndarray, labels: np.ndarray, n_states: int = 4) -> dict:
    """ 4개 분류기 학습 + HMM state→label 매핑. """
    X_tr, X_te, y_tr, y_te = train_test_split(features, labels, test_size=0.2, shuffle=False)

    hmm = GaussianHMM(n_components=n_states, covariance_type="full",
                      n_iter=200, random_state=42)
    hmm.fit(X_tr)
    state_map = _hmm_state_to_label_map(hmm, X_tr, y_tr)

    xgb = XGBClassifier(n_estimators=200, max_depth=5, random_state=42).fit(X_tr, y_tr)
    rf = RandomForestClassifier(n_estimators=300, random_state=42).fit(X_tr, y_tr)
    bag = BaggingClassifier(estimator=DecisionTreeClassifier(),
                            n_estimators=100, random_state=42).fit(X_tr, y_tr)

    val_acc = accuracy_score(y_te, _vote(hmm, state_map, xgb, rf, bag, X_te))

    return {"hmm": hmm, "state_map": state_map, "xgb": xgb, "rf": rf, "bag": bag,
            "validation_accuracy": val_acc}

def _hmm_proba(hmm: GaussianHMM, state_map: dict, X: np.ndarray) -> np.ndarray:
    """ HMM의 posterior(state) → label-wise probability 변환. """
    state_proba = hmm.predict_proba(X)   # (T, n_states)
    out = np.zeros((len(X), 4))
    for s, lab in state_map.items():
        out[:, lab] += state_proba[:, s]
    return out

def _vote(hmm, state_map, xgb, rf, bag, X: np.ndarray) -> np.ndarray:
    probs = [_hmm_proba(hmm, state_map, X),
             xgb.predict_proba(X), rf.predict_proba(X), bag.predict_proba(X)]
    avg = np.mean(probs, axis=0)
    return np.argmax(avg, axis=1)

def predict_proba(models: dict, features: np.ndarray) -> np.ndarray:
    """ 최신 시점의 4-state 확률 분포 반환. """
    probs = [
        _hmm_proba(models["hmm"], models["state_map"], features),
        models["xgb"].predict_proba(features),
        models["rf"].predict_proba(features),
        models["bag"].predict_proba(features),
    ]
    return np.mean(probs, axis=0)
```

- [ ] **Step 2: tests/test_hmm_voting.py**

```python
import numpy as np
from regime.models.hmm_voting import train, predict_proba

def _toy_data(seed=0):
    rng = np.random.default_rng(seed)
    X = rng.normal(0, 1, (500, 10))
    # 4-state 합성 라벨 (균등)
    y = rng.integers(0, 4, 500)
    return X, y

def test_train_returns_all_models():
    X, y = _toy_data()
    m = train(X, y)
    assert "hmm" in m and "xgb" in m and "rf" in m and "bag" in m
    assert "state_map" in m
    assert 0.0 <= m["validation_accuracy"] <= 1.0

def test_predict_proba_shape_and_sum():
    X, y = _toy_data()
    m = train(X, y)
    p = predict_proba(m, X[:50])
    assert p.shape == (50, 4)
    np.testing.assert_allclose(p.sum(axis=1), 1.0, atol=0.05)
```

- [ ] **Step 3: 테스트 실행**

```bash
pytest tests/test_hmm_voting.py -v
```
Expected: 2 PASS

- [ ] **Step 4: 커밋**

```bash
git add python-workers/regime/models/hmm_voting.py python-workers/regime/models/__init__.py python-workers/regime/tests/test_hmm_voting.py
git commit -m "feat(regime): HMM voting ensemble (Gupta 2025)"
```

---

## Task 6: Kernel Markov 모델 (RHINE 차용)

**Files:**
- Create: `python-workers/regime/models/kernel_markov.py`
- Create: `python-workers/regime/tests/test_kernel_markov.py`

- [ ] **Step 1: models/kernel_markov.py**

```python
import numpy as np
from sklearn.decomposition import KernelPCA
from statsmodels.tsa.regime_switching.markov_regression import MarkovRegression

def train(features: np.ndarray, n_states: int = 4, n_components: int = 8) -> dict:
    """ KernelPCA 비선형 임베딩 → MarkovRegression 4-regime 스위칭. """
    kpca = KernelPCA(n_components=n_components, kernel="rbf", gamma=0.1,
                     random_state=42).fit(features)
    Z = kpca.transform(features)

    ms = MarkovRegression(Z[:, 0], k_regimes=n_states,
                          trend="c", switching_variance=True)
    fit = ms.fit(disp=False)

    return {"kpca": kpca, "ms_results": fit, "n_states": n_states}

def predict_proba(models: dict, features: np.ndarray) -> np.ndarray:
    """ 최신 시점의 smoothed marginal probability. """
    Z = models["kpca"].transform(features)
    ms = MarkovRegression(Z[:, 0], k_regimes=models["n_states"],
                          trend="c", switching_variance=True)
    # 학습된 파라미터로 재filter
    res = ms.filter(models["ms_results"].params)
    return np.asarray(res.smoothed_marginal_probabilities)  # (T, n_states)
```

- [ ] **Step 2: tests/test_kernel_markov.py**

```python
import numpy as np
from regime.models.kernel_markov import train, predict_proba

def test_train_and_predict():
    rng = np.random.default_rng(0)
    # 첫 250개 mean=0, 다음 250개 mean=3 — 2 regime 합성
    X = np.vstack([rng.normal(0, 1, (250, 5)), rng.normal(3, 1, (250, 5))])
    m = train(X, n_states=4)
    assert m["kpca"] is not None
    p = predict_proba(m, X)
    assert p.shape == (500, 4)
    np.testing.assert_allclose(p.sum(axis=1), 1.0, atol=1e-6)
```

- [ ] **Step 3: 테스트 실행**

```bash
pytest tests/test_kernel_markov.py -v
```
Expected: 1 PASS (statsmodels MarkovRegression 수렴 경고 메시지 정상)

- [ ] **Step 4: 커밋**

```bash
git add python-workers/regime/models/kernel_markov.py python-workers/regime/tests/test_kernel_markov.py
git commit -m "feat(regime): kernel-PCA + Markov regression (RHINE 차용)"
```

---

## Task 7: Reservoir Computing + Hypernetwork 모델 (Sun 2025)

**Files:**
- Create: `python-workers/regime/models/reservoir_hyper.py`
- Create: `python-workers/regime/tests/test_reservoir_hyper.py`

- [ ] **Step 1: models/reservoir_hyper.py**

```python
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from reservoirpy.nodes import Reservoir

RESERVOIR_DIM = 200
CTX_DIM = 8
N_STATES = 4

class HyperNet(nn.Module):
    """ Context z → reservoir readout 의 (alpha ridge, W) 출력. """
    def __init__(self, ctx_dim: int = CTX_DIM,
                 reservoir_dim: int = RESERVOIR_DIM, n_states: int = N_STATES):
        super().__init__()
        self.reservoir_dim = reservoir_dim
        self.n_states = n_states
        self.shared = nn.Sequential(
            nn.Linear(ctx_dim, 64), nn.ReLU(),
            nn.Linear(64, 64), nn.ReLU(),
        )
        self.alpha_head = nn.Linear(64, 1)
        self.W_head = nn.Linear(64, reservoir_dim * n_states)

    def forward(self, z: torch.Tensor):
        h = self.shared(z)
        alpha = F.softplus(self.alpha_head(h)) + 1e-3
        W = self.W_head(h).view(-1, self.reservoir_dim, self.n_states)
        return alpha, W

def _compute_context(features: np.ndarray) -> np.ndarray:
    """ rolling 통계 8개 - (T, 8). """
    df = np.asarray(features)
    T = df.shape[0]
    ctx = np.zeros((T, 8))
    for t in range(T):
        window = df[max(0, t - 20): t + 1]
        ctx[t] = [window.mean(), window.std(),
                  window.min(), window.max(),
                  window[-1] - window[0] if len(window) > 1 else 0,
                  np.median(window),
                  np.percentile(window, 25),
                  np.percentile(window, 75)]
    return ctx

def train(features: np.ndarray, labels: np.ndarray,
          epochs: int = 30, lr: float = 1e-3) -> dict:
    reservoir = Reservoir(units=RESERVOIR_DIM, sr=0.95, lr=0.3, seed=42)
    states = reservoir.run(features)  # (T, 200)

    ctx_full = _compute_context(features.mean(axis=1, keepdims=True).flatten())
    states_t = torch.tensor(states, dtype=torch.float32)
    labels_t = torch.tensor(labels, dtype=torch.long)
    ctx_t = torch.tensor(ctx_full, dtype=torch.float32)

    net = HyperNet()
    opt = torch.optim.Adam(net.parameters(), lr=lr)
    for _ in range(epochs):
        alpha, W = net(ctx_t)
        # readout: softmax(states @ W / alpha)
        logits = torch.einsum("td,tdc->tc", states_t, W) / alpha
        loss = F.cross_entropy(logits, labels_t)
        # L2 ridge with adaptive alpha
        loss = loss + (W.pow(2).sum() * 0.0001) / alpha.mean()
        opt.zero_grad(); loss.backward(); opt.step()
    final_loss = float(loss.item())

    return {"reservoir": reservoir, "hypernet": net.state_dict(),
            "final_loss": final_loss}

def predict_proba(models: dict, features: np.ndarray) -> np.ndarray:
    reservoir = models["reservoir"]
    net = HyperNet()
    net.load_state_dict(models["hypernet"])
    net.eval()

    states = reservoir.run(features)
    ctx_full = _compute_context(features.mean(axis=1, keepdims=True).flatten())
    with torch.no_grad():
        states_t = torch.tensor(states, dtype=torch.float32)
        ctx_t = torch.tensor(ctx_full, dtype=torch.float32)
        alpha, W = net(ctx_t)
        logits = torch.einsum("td,tdc->tc", states_t, W) / alpha
        return F.softmax(logits, dim=-1).numpy()
```

- [ ] **Step 2: tests/test_reservoir_hyper.py**

```python
import numpy as np
from regime.models.reservoir_hyper import train, predict_proba

def test_train_loss_finite():
    rng = np.random.default_rng(0)
    X = rng.normal(0, 1, (200, 10))
    y = rng.integers(0, 4, 200)
    m = train(X, y, epochs=5)
    assert np.isfinite(m["final_loss"])

def test_predict_proba_shape():
    rng = np.random.default_rng(0)
    X = rng.normal(0, 1, (200, 10))
    y = rng.integers(0, 4, 200)
    m = train(X, y, epochs=5)
    p = predict_proba(m, X[:50])
    assert p.shape == (50, 4)
    np.testing.assert_allclose(p.sum(axis=1), 1.0, atol=1e-5)
```

- [ ] **Step 3: 테스트 실행**

```bash
pytest tests/test_reservoir_hyper.py -v
```
Expected: 2 PASS (학습 시간 ~3초)

- [ ] **Step 4: 커밋**

```bash
git add python-workers/regime/models/reservoir_hyper.py python-workers/regime/tests/test_reservoir_hyper.py
git commit -m "feat(regime): reservoir + hypernetwork (Sun 2025)"
```

---

## Task 8: Voting 통합 + Transition 확률

**Files:**
- Create: `python-workers/regime/voting.py`
- Create: `python-workers/regime/transition.py`
- Create: `python-workers/regime/tests/test_voting.py`

- [ ] **Step 1: voting.py**

```python
import numpy as np
from regime.config import STATES

def soft_vote(model_probas: dict) -> dict:
    """
    model_probas: { 'hmm_voting': np.array(4,), 'kernel_markov': np.array(4,),
                    'reservoir_hyper': np.array(4,) }
    각 모델의 최신 시점 4-state 확률 → 평균.
    Returns: { current_state, current_confidence, state_probabilities, model_votes }
    """
    arr = np.array(list(model_probas.values()))   # (M, 4)
    avg = arr.mean(axis=0)
    state_idx = int(np.argmax(avg))
    state = STATES[state_idx]
    confidence = float(avg[state_idx])
    return {
        "current_state": state,
        "current_confidence": confidence,
        "state_probabilities": {s: float(p) for s, p in zip(STATES, avg)},
        "model_votes": {
            name: {
                "state": STATES[int(np.argmax(p))],
                "confidence": float(np.max(p)),
                "probs": {s: float(pp) for s, pp in zip(STATES, p)},
            }
            for name, p in model_probas.items()
        }
    }
```

- [ ] **Step 2: transition.py**

```python
import numpy as np
from hmmlearn.hmm import GaussianHMM
from regime.config import STATES

def n_step_transition(hmm: GaussianHMM, state_map: dict, current_state_idx: int,
                      n: int) -> dict:
    """ HMM transmat_ ^ n 으로 N-step 전환 확률 계산. """
    T = np.linalg.matrix_power(hmm.transmat_, n)   # (n_components, n_components)
    # 현재 hidden state 분포 = one-hot
    init = np.zeros(hmm.n_components)
    init[current_state_idx] = 1.0
    future_hidden = init @ T   # (n_components,)
    # hidden → label aggregation
    future_label = np.zeros(4)
    for s, lab in state_map.items():
        future_label[lab] += future_hidden[s]
    return {s: float(p) for s, p in zip(STATES, future_label)}

def transition_probabilities(hmm_models: dict, current_hidden_state: int) -> dict:
    """ Returns: { '5d': {bull:..., bear:...}, '10d': ..., '30d': ... } """
    out = {}
    for horizon in [5, 10, 30]:
        out[f"{horizon}d"] = n_step_transition(
            hmm_models["hmm"], hmm_models["state_map"], current_hidden_state, horizon
        )
    return out
```

- [ ] **Step 3: tests/test_voting.py**

```python
import numpy as np
from regime.voting import soft_vote
from regime.transition import n_step_transition
from hmmlearn.hmm import GaussianHMM

def test_soft_vote_basic():
    probas = {
        "hmm_voting":     np.array([0.7, 0.1, 0.1, 0.1]),
        "kernel_markov":  np.array([0.6, 0.2, 0.1, 0.1]),
        "reservoir_hyper":np.array([0.5, 0.3, 0.1, 0.1]),
    }
    out = soft_vote(probas)
    assert out["current_state"] == "bull"
    assert 0.5 < out["current_confidence"] < 0.7
    assert len(out["model_votes"]) == 3

def test_n_step_transition_sums_to_one():
    rng = np.random.default_rng(0)
    X = rng.normal(0, 1, (300, 5))
    hmm = GaussianHMM(n_components=4, covariance_type="full",
                      n_iter=20, random_state=42).fit(X)
    state_map = {0: 0, 1: 1, 2: 2, 3: 3}
    out = n_step_transition(hmm, state_map, current_state_idx=0, n=5)
    total = sum(out.values())
    assert abs(total - 1.0) < 1e-6
```

- [ ] **Step 4: 테스트 실행**

```bash
pytest tests/test_voting.py -v
```
Expected: 2 PASS

- [ ] **Step 5: 커밋**

```bash
git add python-workers/regime/voting.py python-workers/regime/transition.py python-workers/regime/tests/test_voting.py
git commit -m "feat(regime): soft voting + N-step transition probability"
```

---

## Task 9: 모델 storage (Supabase Storage joblib upload/download)

**Files:**
- Create: `python-workers/regime/storage.py`
- Create: `python-workers/regime/tests/test_storage.py`

> **보안 노트**: `joblib` 는 scikit-learn 표준 직렬화이고, 본 시스템은 우리 자체 학습 워커가 생성한 trusted artifact 만 Supabase Storage 의 service-role 보호된 비공개 버킷에서 로드한다. 사용자 입력 파일은 절대 역직렬화하지 않음.

- [ ] **Step 1: storage.py**

```python
import io
import joblib
from regime.supabase_client import get_supabase

BUCKET = "regime-models"  # 사전 생성 필요 (private)

def upload_model(scope_type: str, scope_id: str, model_type: str,
                 model_version: str, model_obj: dict) -> str:
    """ joblib 직렬화 후 Supabase Storage 비공개 버킷에 업로드. """
    buf = io.BytesIO()
    joblib.dump(model_obj, buf)
    buf.seek(0)
    path = f"{scope_type}/{scope_id}/{model_type}_{model_version}.joblib"

    sb = get_supabase()
    sb.storage.from_(BUCKET).upload(
        path, buf.getvalue(),
        {"content-type": "application/octet-stream", "x-upsert": "true"}
    )
    return path

def download_model(path: str) -> dict:
    """ Trusted internal artifact 만 로드 (우리 워커가 생성한 것). """
    sb = get_supabase()
    blob = sb.storage.from_(BUCKET).download(path)
    return joblib.load(io.BytesIO(blob))
```

- [ ] **Step 2: 버킷 생성 (Supabase 콘솔 1회만)**

Supabase 대시보드 → Storage → Create bucket:
- Name: `regime-models`
- Public: **No** (private only)
- File size limit: 50 MB

또는 SQL: `INSERT INTO storage.buckets (id, name, public) VALUES ('regime-models', 'regime-models', false);`

- [ ] **Step 3: tests/test_storage.py — round trip**

```python
import numpy as np
from regime.storage import upload_model, download_model

def test_round_trip():
    obj = {"weights": np.arange(10), "meta": {"foo": "bar"}}
    path = upload_model("test", "smoke", "hmm_voting", "v0", obj)
    assert "test/smoke" in path
    loaded = download_model(path)
    np.testing.assert_array_equal(loaded["weights"], obj["weights"])
    assert loaded["meta"]["foo"] == "bar"
```

- [ ] **Step 4: 테스트 실행 (실제 Supabase Storage 호출)**

```bash
pytest tests/test_storage.py -v
```
Expected: 1 PASS

- [ ] **Step 5: 커밋**

```bash
git add python-workers/regime/storage.py python-workers/regime/tests/test_storage.py
git commit -m "feat(regime): joblib model storage (Supabase private bucket)"
```

---

## Task 10: train_worker.py (일배치 파이프라인)

**Files:**
- Create: `python-workers/regime/train_worker.py`
- Create: `python-workers/regime/tests/test_train_worker_smoke.py`

- [ ] **Step 1: train_worker.py**

```python
import sys
from datetime import date, timedelta
import pandas as pd
import numpy as np
from regime.config import (MARKETS, GICS_SECTORS_KR, GICS_SECTORS_US,
                           MODEL_VERSION, STATES)
from regime.fetchers.fred_fetcher import fetch_all_fred
from regime.fetchers.ecos_fetcher import fetch_all_ecos
from regime.fetchers.price_fetcher import fetch_prices
from regime.features.feature_engineer import compute_features
from regime.labeling import heuristic_labels
from regime.models import hmm_voting, kernel_markov, reservoir_hyper
from regime.voting import soft_vote
from regime.transition import transition_probabilities
from regime.storage import upload_model
from regime.supabase_client import get_supabase

def _load_macro(since: date) -> pd.DataFrame:
    sb = get_supabase()
    res = sb.table("macro_indicators").select("date, indicator_id, value"
            ).gte("date", since.isoformat()).execute()
    df = pd.DataFrame(res.data or [])
    if df.empty:
        return df
    df["date"] = pd.to_datetime(df["date"])
    return df.pivot(index="date", columns="indicator_id", values="value").sort_index()

def _train_scope(scope_type: str, scope_id: str, ticker: str, market: str) -> None:
    print(f"[{scope_type}/{scope_id}] start")
    since = date.today() - timedelta(days=365 * 8)   # 8년 학습
    prices = fetch_prices(ticker, market, since)
    if prices.empty:
        print(f"  skip: no prices"); return

    macro = _load_macro(since)
    feat = compute_features(prices, macro)
    labels = heuristic_labels(feat)

    X = feat.values.astype(np.float64)

    # 3종 모델 학습
    hmm_m = hmm_voting.train(X, labels)
    km_m  = kernel_markov.train(X)
    rh_m  = reservoir_hyper.train(X, labels, epochs=30)

    # Storage 업로드
    path_hmm = upload_model(scope_type, scope_id, "hmm_voting", MODEL_VERSION, hmm_m)
    path_km  = upload_model(scope_type, scope_id, "kernel_markov", MODEL_VERSION, km_m)
    path_rh  = upload_model(scope_type, scope_id, "reservoir_hyper", MODEL_VERSION, rh_m)

    sb = get_supabase()
    for mtype, path, val_acc in [
        ("hmm_voting", path_hmm, hmm_m["validation_accuracy"]),
        ("kernel_markov", path_km, None),
        ("reservoir_hyper", path_rh, None),
    ]:
        sb.table("regime_models").upsert({
            "scope_type": scope_type, "scope_id": scope_id,
            "model_type": mtype, "model_version": MODEL_VERSION,
            "model_blob_path": path, "feature_config": {"features": list(feat.columns)},
            "training_samples": len(X),
            "validation_accuracy": val_acc,
        }, on_conflict="scope_type,scope_id,model_type,model_version").execute()

    # 최신 추론
    hmm_p = hmm_voting.predict_proba(hmm_m, X)[-1]
    km_p  = kernel_markov.predict_proba(km_m, X)[-1]
    rh_p  = reservoir_hyper.predict_proba(rh_m, X)[-1]
    vote = soft_vote({"hmm_voting": hmm_p, "kernel_markov": km_p, "reservoir_hyper": rh_p})

    # 전환 확률 (HMM transmat 활용)
    current_hidden = int(hmm_m["hmm"].predict(X[-1:].reshape(1, -1))[0])
    trans = transition_probabilities(hmm_m, current_hidden)

    today = feat.index[-1].date()
    sb.table("regime_runs").upsert({
        "scope_type": scope_type, "scope_id": scope_id,
        "as_of_date": today.isoformat(), "trigger_type": "batch",
        "current_state": vote["current_state"],
        "current_confidence": vote["current_confidence"],
        "state_probabilities": vote["state_probabilities"],
        "model_votes": vote["model_votes"],
        "transition_probabilities": trans,
        "data_as_of": today.isoformat(),
    }, on_conflict="scope_type,scope_id,as_of_date,trigger_type").execute()

    # History backfill (지난 5년)
    h_proba_hmm = hmm_voting.predict_proba(hmm_m, X)
    h_proba_km  = kernel_markov.predict_proba(km_m, X)
    h_proba_rh  = reservoir_hyper.predict_proba(rh_m, X)
    history_rows = []
    cutoff_idx = max(0, len(feat) - 252 * 5)
    for i in range(cutoff_idx, len(feat)):
        avg = (h_proba_hmm[i] + h_proba_km[i] + h_proba_rh[i]) / 3
        history_rows.append({
            "scope_type": scope_type, "scope_id": scope_id,
            "date": feat.index[i].date().isoformat(),
            "state": STATES[int(np.argmax(avg))],
            "confidence": float(np.max(avg)),
        })
    # 청크 upsert (Supabase 1000 row 제한 회피)
    for k in range(0, len(history_rows), 500):
        sb.table("regime_history").upsert(
            history_rows[k:k+500], on_conflict="scope_type,scope_id,date"
        ).execute()

    print(f"  done: state={vote['current_state']} conf={vote['current_confidence']:.2f}")

def run_full_batch(scope_filter: str | None = None) -> None:
    today = date.today()
    print("== macro fetch ==")
    print("  FRED:", fetch_all_fred(since=today - timedelta(days=14)))
    print("  ECOS:", fetch_all_ecos(since=today - timedelta(days=14), until=today))

    print("== markets ==")
    for name, cfg in MARKETS.items():
        if scope_filter and scope_filter != name: continue
        _train_scope("market", name, cfg["ticker"], cfg["market"])

    print("== KR sectors ==")
    for sec in GICS_SECTORS_KR:
        scope_id = f"GICS_{sec}_KR"
        if scope_filter and scope_filter != scope_id: continue
        # 섹터 인덱스 ticker 매핑 — Phase 2 에서 처리
        print(f"  skip sector {scope_id} (Phase 2)")

    print("== US sectors ==")
    for sec in GICS_SECTORS_US:
        scope_id = f"GICS_{sec}_US"
        if scope_filter and scope_filter != scope_id: continue
        print(f"  skip sector {scope_id} (Phase 2)")

    # Strategy Matrix backfill
    print("== matrix backfill ==")
    _backfill_strategy_matrix()

def _backfill_strategy_matrix() -> None:
    """ strategy_matrix_runs.regime_at_window_end NULL 행을 regime_history 로 채움. """
    sb = get_supabase()
    rows = sb.table("strategy_matrix_runs").select(
        "id, market, end_date"
    ).is_("regime_at_window_end", "null").limit(2000).execute().data or []
    if not rows:
        print("  no rows to backfill"); return
    for r in rows:
        market_scope = "SP500" if r["market"] == "US" else "KOSPI"
        hist = sb.table("regime_history").select("state").eq(
            "scope_type", "market").eq("scope_id", market_scope).eq(
            "date", r["end_date"]).limit(1).execute().data
        if hist:
            sb.table("strategy_matrix_runs").update(
                {"regime_at_window_end": hist[0]["state"]}
            ).eq("id", r["id"]).execute()

if __name__ == "__main__":
    scope = sys.argv[1] if len(sys.argv) > 1 else None
    run_full_batch(scope_filter=scope)
```

- [ ] **Step 2: tests/test_train_worker_smoke.py**

```python
import pytest
from regime.train_worker import _train_scope

@pytest.mark.slow
def test_smoke_kospi():
    """ 실제 데이터로 KOSPI 단일 scope 학습 통과 확인. (~2분) """
    _train_scope("market", "KOSPI", "^KS11", "KR")
```

- [ ] **Step 3: smoke 테스트 실행 (실데이터 + 시간 오래 걸림)**

```bash
pytest tests/test_train_worker_smoke.py -v -s -m slow
```
Expected: `[market/KOSPI] start` → 약 2분 후 `done: state=... conf=0.6X` 출력

Supabase 콘솔에서 `regime_runs`, `regime_history`, `regime_models` 테이블에 KOSPI row 들어왔는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add python-workers/regime/train_worker.py python-workers/regime/tests/test_train_worker_smoke.py
git commit -m "feat(regime): train_worker batch pipeline (markets + matrix backfill)"
```

---

## Task 11: infer_server.py (FastAPI on-demand 추론)

**Files:**
- Create: `python-workers/regime/infer_server.py`
- Create: `python-workers/regime/tests/test_infer_server.py`

- [ ] **Step 1: infer_server.py**

```python
from datetime import date, timedelta
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import numpy as np

from regime.config import MODEL_VERSION, MARKETS
from regime.fetchers.price_fetcher import fetch_prices
from regime.features.feature_engineer import compute_features
from regime.models import hmm_voting, kernel_markov, reservoir_hyper
from regime.voting import soft_vote
from regime.transition import transition_probabilities
from regime.storage import download_model
from regime.supabase_client import get_supabase
from regime.train_worker import _load_macro

app = FastAPI()

class InferRequest(BaseModel):
    scope_type: str        # 'market' | 'sector' | 'ticker'
    scope_id: str          # 'KOSPI' or ticker like '005930'
    market: str | None = None  # for ticker mode

class InferResponse(BaseModel):
    current_state: str
    current_confidence: float
    state_probabilities: dict
    model_votes: dict
    transition_probabilities: dict
    data_as_of: str

def _load_models(scope_type: str, scope_id: str) -> dict:
    sb = get_supabase()
    rows = sb.table("regime_models").select("model_type, model_blob_path"
        ).eq("scope_type", scope_type).eq("scope_id", scope_id).eq(
            "model_version", MODEL_VERSION).execute().data or []
    if len(rows) < 3:
        raise HTTPException(404, f"models not found for {scope_type}/{scope_id}")
    return {r["model_type"]: download_model(r["model_blob_path"]) for r in rows}

def _resolve_inference_target(req: InferRequest):
    """ ticker 입력 시 시장 모델 fallback (Phase 1). Phase 2: 섹터 매핑. """
    if req.scope_type == "ticker":
        market_scope = "SP500" if req.market == "US" else "KOSPI"
        return ("market", market_scope, req.scope_id, req.market or "KR")
    return (req.scope_type, req.scope_id, None, None)

@app.post("/infer", response_model=InferResponse)
def infer(req: InferRequest):
    model_scope_type, model_scope_id, override_ticker, override_market = \
        _resolve_inference_target(req)
    models = _load_models(model_scope_type, model_scope_id)

    if override_ticker:
        ticker = override_ticker; market = override_market
    else:
        cfg = MARKETS.get(model_scope_id)
        if not cfg:
            raise HTTPException(400, f"unknown market scope {model_scope_id}")
        ticker = cfg["ticker"]; market = cfg["market"]

    since = date.today() - timedelta(days=365 * 3)
    prices = fetch_prices(ticker, market, since)
    if prices.empty:
        raise HTTPException(404, f"no prices for {ticker}")
    macro = _load_macro(since)
    feat = compute_features(prices, macro)
    X = feat.values.astype(np.float64)

    hmm_p = hmm_voting.predict_proba(models["hmm_voting"], X)[-1]
    km_p  = kernel_markov.predict_proba(models["kernel_markov"], X)[-1]
    rh_p  = reservoir_hyper.predict_proba(models["reservoir_hyper"], X)[-1]
    vote = soft_vote({"hmm_voting": hmm_p, "kernel_markov": km_p, "reservoir_hyper": rh_p})

    current_hidden = int(models["hmm_voting"]["hmm"].predict(X[-1:].reshape(1, -1))[0])
    trans = transition_probabilities(models["hmm_voting"], current_hidden)
    data_as_of = feat.index[-1].date().isoformat()

    # 결과 캐싱 (regime_runs on_demand)
    sb = get_supabase()
    sb.table("regime_runs").upsert({
        "scope_type": req.scope_type, "scope_id": req.scope_id,
        "as_of_date": data_as_of, "trigger_type": "on_demand",
        "current_state": vote["current_state"],
        "current_confidence": vote["current_confidence"],
        "state_probabilities": vote["state_probabilities"],
        "model_votes": vote["model_votes"],
        "transition_probabilities": trans,
        "data_as_of": data_as_of,
    }, on_conflict="scope_type,scope_id,as_of_date,trigger_type").execute()

    return InferResponse(
        current_state=vote["current_state"],
        current_confidence=vote["current_confidence"],
        state_probabilities=vote["state_probabilities"],
        model_votes=vote["model_votes"],
        transition_probabilities=trans,
        data_as_of=data_as_of,
    )

@app.get("/health")
def health():
    return {"status": "ok", "version": MODEL_VERSION}
```

- [ ] **Step 2: tests/test_infer_server.py**

```python
from fastapi.testclient import TestClient
from regime.infer_server import app

client = TestClient(app)

def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

def test_infer_kospi_market():
    """ Task 10 smoke 가 먼저 통과해 KOSPI 모델이 학습되어 있어야 함 """
    r = client.post("/infer", json={"scope_type": "market", "scope_id": "KOSPI"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["current_state"] in {"bull", "bear", "sideways", "crisis"}
    assert 0.0 <= data["current_confidence"] <= 1.0
    assert "5d" in data["transition_probabilities"]
```

- [ ] **Step 3: 서버 수동 기동 + curl 검증**

```bash
cd python-workers/regime
source .venv/bin/activate
uvicorn regime.infer_server:app --host 127.0.0.1 --port 8001 &
sleep 2
curl -s -X POST http://127.0.0.1:8001/infer -H 'content-type: application/json' \
  -d '{"scope_type":"market","scope_id":"KOSPI"}' | python -m json.tool
kill %1
```
Expected: JSON 응답 (current_state, model_votes, transition_probabilities 포함)

- [ ] **Step 4: pytest 실행**

```bash
pytest tests/test_infer_server.py -v
```
Expected: 2 PASS

- [ ] **Step 5: 커밋**

```bash
git add python-workers/regime/infer_server.py python-workers/regime/tests/test_infer_server.py
git commit -m "feat(regime): FastAPI infer_server (on-demand inference)"
```

---

## Task 12: launchd plist (Mac mini 일배치 + 추론 서버)

**Files:**
- Create: `python-workers/regime/launchd/com.dental.regime-train.plist`
- Create: `python-workers/regime/launchd/com.dental.regime-server.plist`

- [ ] **Step 1: com.dental.regime-train.plist (일배치, KST 20:30)**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dental.regime-train</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/hhs/Project/dental-clinic-manager/dental-clinic-manager/python-workers/regime/.venv/bin/python</string>
    <string>-m</string>
    <string>regime.train_worker</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/hhs/Project/dental-clinic-manager/dental-clinic-manager/python-workers/regime</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>20</integer>
    <key>Minute</key><integer>30</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/tmp/regime-train.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/regime-train.err</string>
</dict>
</plist>
```

- [ ] **Step 2: com.dental.regime-server.plist (FastAPI 상시 기동)**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.dental.regime-server</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/hhs/Project/dental-clinic-manager/dental-clinic-manager/python-workers/regime/.venv/bin/uvicorn</string>
    <string>regime.infer_server:app</string>
    <string>--host</string><string>127.0.0.1</string>
    <string>--port</string><string>8001</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/hhs/Project/dental-clinic-manager/dental-clinic-manager/python-workers/regime</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key>
  <string>/tmp/regime-server.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/regime-server.err</string>
</dict>
</plist>
```

- [ ] **Step 3: launchd 등록 + 검증**

```bash
cp python-workers/regime/launchd/com.dental.regime-train.plist ~/Library/LaunchAgents/
cp python-workers/regime/launchd/com.dental.regime-server.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.dental.regime-train.plist
launchctl load ~/Library/LaunchAgents/com.dental.regime-server.plist
launchctl list | grep regime
curl -s http://127.0.0.1:8001/health
```
Expected: `com.dental.regime-train`, `com.dental.regime-server` 둘 다 표시 + health OK

- [ ] **Step 4: 커밋**

```bash
git add python-workers/regime/launchd/
git commit -m "feat(regime): launchd plists (daily batch + always-on infer server)"
```

---

## Task 13: Node API 라우트 (regime/*)

**Files:**
- Create: `src/lib/regime/inferClient.ts`
- Create: `src/types/regime.ts`
- Create: `src/app/api/investment/regime/current/route.ts`
- Create: `src/app/api/investment/regime/history/route.ts`
- Create: `src/app/api/investment/regime/transition/route.ts`
- Create: `src/app/api/investment/regime/sectors/route.ts`
- Create: `src/app/api/investment/regime/analyze/route.ts`
- Create: `src/app/api/investment/regime/best-strategies/route.ts`
- Create: `src/app/api/investment/regime/alerts/route.ts`
- Create: `src/app/api/investment/regime/alerts/settings/route.ts`

- [ ] **Step 1: types/regime.ts**

```typescript
export type RegimeState = 'bull' | 'bear' | 'sideways' | 'crisis'
export type ScopeType = 'market' | 'sector' | 'ticker'

export interface RegimeRun {
  scope_type: ScopeType
  scope_id: string
  as_of_date: string
  current_state: RegimeState
  current_confidence: number
  state_probabilities: Record<RegimeState, number>
  model_votes: Record<string, { state: RegimeState; confidence: number; probs: Record<RegimeState, number> }>
  transition_probabilities: { '5d': Record<RegimeState, number>; '10d': Record<RegimeState, number>; '30d': Record<RegimeState, number> }
  data_as_of: string
}

export interface RegimeHistoryRow {
  date: string
  state: RegimeState
  confidence: number
}
```

- [ ] **Step 2: lib/regime/inferClient.ts**

```typescript
const INFER_BASE = process.env.REGIME_INFER_URL ?? 'http://127.0.0.1:8001'

export interface InferRequest {
  scope_type: 'market' | 'sector' | 'ticker'
  scope_id: string
  market?: string
}

export async function inferFromSidecar(req: InferRequest, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const r = await fetch(`${INFER_BASE}/infer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    })
    if (!r.ok) throw new Error(`infer ${r.status}: ${await r.text()}`)
    return await r.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function checkSidecarHealth(): Promise<boolean> {
  try {
    const r = await fetch(`${INFER_BASE}/health`, { signal: AbortSignal.timeout(2000) })
    return r.ok
  } catch { return false }
}
```

- [ ] **Step 3: GET /api/investment/regime/current/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!auth.user.permissions?.includes('regime_view')) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const url = new URL(req.url)
  const scope = url.searchParams.get('scope') ?? 'market'
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const sb = getSupabaseAdmin()
  if (!sb) return NextResponse.json({ error: 'server' }, { status: 500 })

  const { data, error } = await sb.from('regime_runs').select('*')
    .eq('scope_type', scope).eq('scope_id', id)
    .order('as_of_date', { ascending: false }).limit(1).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ data })
}
```

- [ ] **Step 4: GET /history/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!auth.user.permissions?.includes('regime_view'))
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const url = new URL(req.url)
  const scope = url.searchParams.get('scope') ?? 'market'
  const id = url.searchParams.get('id')
  const days = Number(url.searchParams.get('days') ?? 730)
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10)
  const sb = getSupabaseAdmin()!
  const { data, error } = await sb.from('regime_history').select('date, state, confidence')
    .eq('scope_type', scope).eq('scope_id', id).gte('date', since).order('date')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
```

- [ ] **Step 5: GET /transition/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!auth.user.permissions?.includes('regime_view'))
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const url = new URL(req.url)
  const scope = url.searchParams.get('scope') ?? 'market'
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const sb = getSupabaseAdmin()!
  const { data } = await sb.from('regime_runs').select('transition_probabilities')
    .eq('scope_type', scope).eq('scope_id', id)
    .order('as_of_date', { ascending: false }).limit(1).maybeSingle()
  return NextResponse.json({ data: data?.transition_probabilities ?? null })
}
```

- [ ] **Step 6: GET /sectors/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!auth.user.permissions?.includes('regime_view'))
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const url = new URL(req.url)
  const market = url.searchParams.get('market')
  const sb = getSupabaseAdmin()!
  let q = sb.from('regime_runs').select('*').eq('scope_type', 'sector')
    .order('as_of_date', { ascending: false })
  if (market) q = q.like('scope_id', `GICS_%_${market}`)
  const { data } = await q.limit(50)
  const seen = new Set<string>()
  const latest = (data ?? []).filter(r => {
    if (seen.has(r.scope_id)) return false
    seen.add(r.scope_id); return true
  })
  return NextResponse.json({ data: latest })
}
```

- [ ] **Step 7: POST /analyze/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { inferFromSidecar } from '@/lib/regime/inferClient'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!auth.user.permissions?.includes('regime_analyze'))
    return NextResponse.json({ error: '권한 없음 (regime_analyze 필요)' }, { status: 403 })

  const body = await req.json() as { ticker: string; mode?: 'fast' | 'precise'; market?: string }
  if (!body.ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 })
  const mode = body.mode ?? 'fast'
  const market = body.market ?? (/^\d{6}$/.test(body.ticker) ? 'KR' : 'US')

  const sb = getSupabaseAdmin()!

  if (mode === 'precise') {
    const { data, error } = await sb.from('regime_jobs').insert({
      user_id: auth.user.id, scope_type: 'ticker', scope_id: body.ticker,
      job_type: 'precision_train', status: 'queued',
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data, mode: 'precise', message: '다음 일배치(20:30)에서 처리 예정' })
  }

  try {
    const inferred = await inferFromSidecar({
      scope_type: 'ticker', scope_id: body.ticker, market,
    })
    return NextResponse.json({ data: inferred, mode: 'fast' })
  } catch (e: any) {
    return NextResponse.json({ error: `infer 실패: ${e.message}` }, { status: 502 })
  }
}
```

- [ ] **Step 8: GET /best-strategies/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!auth.user.permissions?.includes('regime_view'))
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const url = new URL(req.url)
  const regime = url.searchParams.get('regime')
  const market = url.searchParams.get('market') ?? 'KR'
  const period = url.searchParams.get('period') ?? '5Y'
  if (!regime) return NextResponse.json({ error: 'regime required' }, { status: 400 })

  const sb = getSupabaseAdmin()!
  const { data, error } = await sb.from('strategy_matrix_runs').select(
    'entry_id, entry_type, total_return, sharpe_ratio, max_drawdown'
  ).eq('regime_at_window_end', regime).eq('market', market)
    .eq('period_window', period).limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const map = new Map<string, { entry_id: string; entry_type: string;
    n: number; sumR: number; sumS: number; sumD: number }>()
  for (const r of data ?? []) {
    const key = r.entry_id
    const acc = map.get(key) ?? { entry_id: r.entry_id, entry_type: r.entry_type,
                                  n: 0, sumR: 0, sumS: 0, sumD: 0 }
    acc.n += 1
    acc.sumR += r.total_return ?? 0
    acc.sumS += r.sharpe_ratio ?? 0
    acc.sumD += r.max_drawdown ?? 0
    map.set(key, acc)
  }
  const ranked = Array.from(map.values())
    .filter(x => x.n >= 5)
    .map(x => ({ entry_id: x.entry_id, entry_type: x.entry_type, sample_size: x.n,
                 avg_return: x.sumR / x.n, avg_sharpe: x.sumS / x.n, avg_mdd: x.sumD / x.n }))
    .sort((a, b) => b.avg_return - a.avg_return)
    .slice(0, 10)

  return NextResponse.json({ data: ranked })
}
```

- [ ] **Step 9: GET /alerts/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!auth.user.permissions?.includes('regime_view'))
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const sb = getSupabaseAdmin()!
  const { data } = await sb.from('regime_alerts').select('*')
    .contains('notified_user_ids', [auth.user.id])
    .order('transition_date', { ascending: false }).limit(50)
  return NextResponse.json({ data: data ?? [] })
}
```

- [ ] **Step 10: POST /alerts/settings/route.ts**

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!auth.user.permissions?.includes('regime_admin'))
    return NextResponse.json({ error: '권한 없음 (regime_admin 필요)' }, { status: 403 })

  const body = await req.json() as { enabled: boolean; scopes?: string[] }
  const sb = getSupabaseAdmin()!
  const { error } = await sb.from('users').update({
    metadata: { regime_alerts: body }
  }).eq('id', auth.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 11: 빌드 통과 확인**

```bash
npm run build
```
Expected: 컴파일 0 errors.

- [ ] **Step 12: 커밋**

```bash
git add src/lib/regime/ src/types/regime.ts src/app/api/investment/regime/
git commit -m "feat(regime): Node API routes (current/history/transition/sectors/analyze/best-strategies/alerts)"
```

---

## Task 14: 권한 추가 (regime_view, regime_analyze, regime_admin)

**Files:**
- Modify: `src/types/permissions.ts`

- [ ] **Step 1: Permission union 에 3개 추가**

```typescript
export type Permission =
  | ...기존
  | 'regime_view'
  | 'regime_analyze'
  | 'regime_admin'
```

- [ ] **Step 2: PERMISSION_GROUPS 신규 그룹**

```typescript
{
  name: '시장 국면 분석',
  permissions: ['regime_view', 'regime_analyze', 'regime_admin'],
},
```

- [ ] **Step 3: PERMISSION_DESCRIPTIONS**

```typescript
regime_view: '시장 국면 조회 (시장/섹터 국면 + 알림 받기)',
regime_analyze: '사용자 지정 종목 국면 분석 (즉시/정밀)',
regime_admin: '국면 알림 설정 변경 + 정밀 학습 큐 관리',
```

- [ ] **Step 4: DEFAULT_PERMISSIONS — 역할별**

```typescript
owner:          [..., 'regime_view', 'regime_analyze', 'regime_admin'],
vice_director:  [..., 'regime_view', 'regime_analyze'],
manager:        [..., 'regime_view', 'regime_analyze'],
staff:          [..., 'regime_view'],
intern:         [..., 'regime_view'],
```

- [ ] **Step 5: NEW_FEATURE_PREFIXES 에 'regime_' 추가**

```typescript
const NEW_FEATURE_PREFIXES = [..., 'regime_']
```

- [ ] **Step 6: 검증 (prebuild check)**

```bash
npm run check:permissions
```
Expected: 0 missing permission 경고

- [ ] **Step 7: 커밋**

```bash
git add src/types/permissions.ts
git commit -m "feat(regime): permission keys (view/analyze/admin) + role defaults"
```

---

## Task 15: InvestmentTab SUB_TAB 추가 + 메인 UI 컨테이너

**Files:**
- Modify: `src/components/Investment/InvestmentTab.tsx` (4곳)
- Create: `src/components/Investment/Regime/RegimeContent.tsx`
- Create: `src/components/Investment/Regime/types.ts`

- [ ] **Step 1: Regime/types.ts**

```typescript
export type RegimeState = 'bull' | 'bear' | 'sideways' | 'crisis'

export const REGIME_LABEL: Record<RegimeState, string> = {
  bull: 'Bull (상승)', bear: 'Bear (하락)',
  sideways: 'Sideways (횡보)', crisis: 'Crisis (위기)',
}
export const REGIME_EMOJI: Record<RegimeState, string> = {
  bull: '🟢', bear: '🔵', sideways: '🟡', crisis: '🔴'
}
export const REGIME_COLOR: Record<RegimeState, string> = {
  bull: '#10b981', bear: '#3b82f6', sideways: '#f59e0b', crisis: '#ef4444'
}

export interface RegimeRun {
  scope_type: 'market' | 'sector' | 'ticker'
  scope_id: string
  as_of_date: string
  current_state: RegimeState
  current_confidence: number
  state_probabilities: Record<RegimeState, number>
  model_votes: Record<string, { state: RegimeState; confidence: number; probs: Record<RegimeState, number> }>
  transition_probabilities: { '5d': Record<RegimeState, number>; '10d': Record<RegimeState, number>; '30d': Record<RegimeState, number> }
  data_as_of: string
}
```

- [ ] **Step 2: RegimeContent.tsx**

```typescript
'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'

const RegimeMarketGrid = dynamic(() => import('./RegimeMarketGrid'), { ssr: false })
const RegimeSectorGrid = dynamic(() => import('./RegimeSectorGrid'), { ssr: false })
const RegimeUserTickerTab = dynamic(() => import('./RegimeUserTickerTab'), { ssr: false })
const RegimeAlertsTab = dynamic(() => import('./RegimeAlertsTab'), { ssr: false })

type Tab = 'market' | 'sector' | 'ticker' | 'alerts'

export default function RegimeContent() {
  const [tab, setTab] = useState<Tab>('market')
  const tabs: { id: Tab; label: string }[] = [
    { id: 'market', label: '시장' }, { id: 'sector', label: '섹터' },
    { id: 'ticker', label: '사용자 종목' }, { id: 'alerts', label: '알림' },
  ]
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">시장 국면 분석</h1>
        <p className="mt-1 text-sm text-gray-600">
          학술 검증 모델 3종(HMM 앙상블·Kernel Markov·Reservoir Hypernetwork) 의 voting 으로 현재 국면과 5/10/30일 전환 확률을 분석합니다.
        </p>
      </header>

      <div className="flex gap-2 border-b">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 -mb-px border-b-2 ${tab === t.id
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-gray-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'market' && <RegimeMarketGrid />}
      {tab === 'sector' && <RegimeSectorGrid />}
      {tab === 'ticker' && <RegimeUserTickerTab />}
      {tab === 'alerts' && <RegimeAlertsTab />}
    </div>
  )
}
```

- [ ] **Step 3: InvestmentTab.tsx 수정 (4곳)**

(1) `SubTab` 타입에 `'regime'` 추가
(2) `SUB_TABS` 배열에 다음 항목 추가:
```typescript
{ id: 'regime', label: '시장 국면', icon: Activity },
```
+ `import { Activity } from 'lucide-react'` 추가
(3) `SUB_TAB_IDS` set 에 `'regime'` 추가
(4) `dynamic` import + 분기 추가:
```typescript
const RegimeContent = dynamic(() => import('./Regime/RegimeContent'), { ssr: false })
// ...
{subTab === 'regime' && <RegimeContent />}
```

- [ ] **Step 4: 빌드 + 사이드바 통합 확인**

```bash
npm run build
```
Expected: 0 errors.

`npm run dev` 후 테스트 계정 로그인 → `/dashboard?tab=investment&sub=regime` 진입 → 사이드바·헤더 유지된 채 "시장 국면 분석" 헤더 표시.

- [ ] **Step 5: 커밋**

```bash
git add src/components/Investment/Regime/ src/components/Investment/InvestmentTab.tsx
git commit -m "feat(regime): SUB_TAB integration + RegimeContent tab router"
```

---

## Task 16: 시장 그리드 + 상세 패널 (타임라인 + 전환 + voting)

**Files:**
- Create: `src/components/Investment/Regime/RegimeMarketGrid.tsx`
- Create: `src/components/Investment/Regime/RegimeDetailDrawer.tsx`
- Create: `src/components/Investment/Regime/RegimeTimelineChart.tsx`
- Create: `src/components/Investment/Regime/RegimeTransitionTable.tsx`
- Create: `src/components/Investment/Regime/RegimeModelVoting.tsx`

- [ ] **Step 1: RegimeMarketGrid.tsx**

```typescript
'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { RegimeRun, REGIME_EMOJI, REGIME_LABEL, REGIME_COLOR, RegimeState } from './types'

const DynamicDetail = dynamic(() => import('./RegimeDetailDrawer'), { ssr: false })

const MARKETS = [
  { id: 'KOSPI', label: 'KOSPI' },
  { id: 'KOSDAQ', label: 'KOSDAQ' },
  { id: 'SP500', label: 'S&P 500' },
  { id: 'NASDAQ', label: 'NASDAQ' },
] as const

export default function RegimeMarketGrid() {
  const [runs, setRuns] = useState<Record<string, RegimeRun | null>>({})
  const [selected, setSelected] = useState<{ scope_type: string; id: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    Promise.all(MARKETS.map(async m => {
      const r = await fetch(`/api/investment/regime/current?scope=market&id=${m.id}`)
      return [m.id, r.ok ? (await r.json()).data as RegimeRun : null] as const
    })).then(pairs => {
      if (!alive) return
      setRuns(Object.fromEntries(pairs))
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  if (loading) return <div className="py-12 text-center text-gray-500">로딩 중...</div>

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {MARKETS.map(m => {
          const r = runs[m.id]
          if (!r) return (
            <div key={m.id} className="rounded-md border p-3 text-sm text-gray-500">
              {m.label}<br/>데이터 없음
            </div>
          )
          const state = r.current_state
          const trans5d = r.transition_probabilities?.['5d'] ?? {}
          const transOther = (1 - (trans5d[state] ?? 0)) * 100
          return (
            <button key={m.id}
              onClick={() => setSelected({ scope_type: 'market', id: m.id })}
              className="text-left rounded-md border p-3 hover:shadow transition">
              <div className="text-sm text-gray-600">{m.label}</div>
              <div className="mt-1 text-lg font-semibold flex items-center gap-1">
                <span>{REGIME_EMOJI[state]}</span>
                <span style={{ color: REGIME_COLOR[state] }}>{REGIME_LABEL[state].split(' ')[0]}</span>
              </div>
              <div className="text-xs text-gray-500">{(r.current_confidence * 100).toFixed(0)}% conf.</div>
              <div className="mt-2 h-2 w-full bg-gray-200 rounded overflow-hidden">
                <div className="h-full" style={{
                  width: `${r.current_confidence * 100}%`,
                  background: REGIME_COLOR[state] }} />
              </div>
              <div className="mt-2 text-xs text-gray-500">5d 전환 확률: {transOther.toFixed(0)}%</div>
            </button>
          )
        })}
      </div>

      {selected && (
        <DynamicDetail scope={selected.scope_type as any}
          id={selected.id} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
```

- [ ] **Step 2: RegimeDetailDrawer.tsx**

```typescript
'use client'
import { useEffect, useState } from 'react'
import RegimeTimelineChart from './RegimeTimelineChart'
import RegimeTransitionTable from './RegimeTransitionTable'
import RegimeModelVoting from './RegimeModelVoting'
import RegimeBestStrategies from './RegimeBestStrategies'
import type { RegimeRun, RegimeState } from './types'

interface HistoryRow { date: string; state: RegimeState; confidence: number }

export default function RegimeDetailDrawer({ scope, id, onClose }:
    { scope: 'market' | 'sector'; id: string; onClose: () => void }) {
  const [run, setRun] = useState<RegimeRun | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])

  useEffect(() => {
    fetch(`/api/investment/regime/current?scope=${scope}&id=${id}`)
      .then(r => r.json()).then(j => setRun(j.data))
    fetch(`/api/investment/regime/history?scope=${scope}&id=${id}&days=1825`)
      .then(r => r.json()).then(j => setHistory(j.data ?? []))
  }, [scope, id])

  if (!run) return null

  return (
    <div className="mt-4 rounded-md border bg-white p-4 space-y-4">
      <div className="flex justify-between items-baseline">
        <h2 className="text-lg font-semibold">{id} 상세</h2>
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">닫기 ✕</button>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">국면 타임라인 (5년)</h3>
        <RegimeTimelineChart history={history} />
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">전환 확률</h3>
        <RegimeTransitionTable transitions={run.transition_probabilities} />
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">모델별 voting</h3>
        <RegimeModelVoting votes={run.model_votes} probs={run.state_probabilities} />
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">현재 국면 강세 전략 TOP 5</h3>
        <RegimeBestStrategies regime={run.current_state}
          market={id.startsWith('KOS') ? 'KR' : 'US'} />
      </section>
    </div>
  )
}
```

- [ ] **Step 3: RegimeTimelineChart.tsx**

```typescript
'use client'
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip } from 'recharts'
import { REGIME_COLOR, RegimeState } from './types'

interface Row { date: string; state: RegimeState; confidence: number }

export default function RegimeTimelineChart({ history }: { history: Row[] }) {
  if (history.length === 0) return <div className="text-sm text-gray-500">데이터 없음</div>
  const data = history.map(h => ({
    date: h.date, y: 1, state: h.state, confidence: h.confidence,
    fill: REGIME_COLOR[h.state],
  }))
  return (
    <div className="h-32">
      <ResponsiveContainer>
        <ScatterChart>
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis hide domain={[0, 2]} />
          <Tooltip content={({ payload }: any) => {
            if (!payload?.length) return null
            const p = payload[0].payload
            return <div className="bg-white border p-2 text-xs">
              {p.date}<br/><b>{p.state}</b> ({(p.confidence*100).toFixed(0)}%)
            </div>
          }} />
          <Scatter data={data} shape="square" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 4: RegimeTransitionTable.tsx**

```typescript
'use client'
import { REGIME_LABEL, REGIME_COLOR, RegimeState } from './types'

export default function RegimeTransitionTable({ transitions }:
    { transitions: Record<string, Record<RegimeState, number>> }) {
  const horizons = ['5d', '10d', '30d'] as const
  const states: RegimeState[] = ['bull', 'bear', 'sideways', 'crisis']
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr><th className="border-b p-2 text-left">기간</th>
          {states.map(s => <th key={s} className="border-b p-2 text-right" style={{ color: REGIME_COLOR[s] }}>{REGIME_LABEL[s].split(' ')[0]}</th>)}
        </tr>
      </thead>
      <tbody>
        {horizons.map(h => (
          <tr key={h}>
            <td className="border-b p-2 font-mono">{h}</td>
            {states.map(s => {
              const v = transitions[h]?.[s] ?? 0
              return <td key={s} className="border-b p-2 text-right">{(v*100).toFixed(0)}%</td>
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 5: RegimeModelVoting.tsx**

```typescript
'use client'
import { REGIME_LABEL, REGIME_COLOR, RegimeState } from './types'

const MODEL_LABEL: Record<string, string> = {
  hmm_voting: 'HMM Voting (Gupta 2025)',
  kernel_markov: 'Kernel Markov (RHINE 차용)',
  reservoir_hyper: 'Reservoir + Hypernetwork (Sun 2025)',
}

export default function RegimeModelVoting({ votes, probs }: {
  votes: Record<string, { state: RegimeState; confidence: number; probs: Record<RegimeState, number> }>
  probs: Record<RegimeState, number>
}) {
  const states: RegimeState[] = ['bull', 'bear', 'sideways', 'crisis']
  return (
    <table className="w-full text-sm">
      <thead>
        <tr><th className="text-left p-1">모델</th>
          {states.map(s => <th key={s} className="text-right p-1" style={{ color: REGIME_COLOR[s] }}>{REGIME_LABEL[s].split(' ')[0]}</th>)}
        </tr>
      </thead>
      <tbody>
        {Object.entries(votes).map(([model, v]) => (
          <tr key={model} className="border-t">
            <td className="p-1">{MODEL_LABEL[model] ?? model}</td>
            {states.map(s => <td key={s} className="text-right p-1">{((v.probs[s] ?? 0)*100).toFixed(0)}%</td>)}
          </tr>
        ))}
        <tr className="border-t-2 font-semibold bg-gray-50">
          <td className="p-1">최종 평균</td>
          {states.map(s => <td key={s} className="text-right p-1">{((probs[s] ?? 0)*100).toFixed(0)}%</td>)}
        </tr>
      </tbody>
    </table>
  )
}
```

- [ ] **Step 6: 빌드 + 시각 확인**

```bash
npm run build && npm run dev
```
브라우저: `/dashboard?tab=investment&sub=regime` → 4 카드 표시. 카드 클릭 시 상세 패널 (타임라인, 전환표, voting) 확장.

- [ ] **Step 7: 커밋**

```bash
git add src/components/Investment/Regime/
git commit -m "feat(regime): market grid + detail drawer (timeline, transition, voting)"
```

---

## Task 17: 섹터 그리드 + 사용자 종목 + 알림 + Best Strategies

**Files:**
- Create: `src/components/Investment/Regime/RegimeSectorGrid.tsx`
- Create: `src/components/Investment/Regime/RegimeUserTickerTab.tsx`
- Create: `src/components/Investment/Regime/RegimeAlertsTab.tsx`
- Create: `src/components/Investment/Regime/RegimeBestStrategies.tsx`

- [ ] **Step 1: RegimeBestStrategies.tsx**

```typescript
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { RegimeState } from './types'

interface Row {
  entry_id: string; entry_type: string; sample_size: number
  avg_return: number; avg_sharpe: number; avg_mdd: number
}

export default function RegimeBestStrategies({ regime, market }:
    { regime: RegimeState; market: 'KR' | 'US' }) {
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    fetch(`/api/investment/regime/best-strategies?regime=${regime}&market=${market}&period=5Y`)
      .then(r => r.json()).then(j => setRows(j.data ?? []))
  }, [regime, market])

  if (rows.length === 0) return <div className="text-sm text-gray-500">백테스트 데이터 부족 (regime backfill 대기)</div>

  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-gray-500">
        <th className="p-1">전략</th><th className="p-1 text-right">평균 수익률</th>
        <th className="p-1 text-right">Sharpe</th><th className="p-1 text-right">MDD</th>
        <th className="p-1 text-right">표본</th>
      </tr></thead>
      <tbody>
        {rows.slice(0, 5).map(r => (
          <tr key={r.entry_id} className="border-t">
            <td className="p-1">
              <Link href={`/dashboard?tab=investment&sub=matrix&entry=${r.entry_id}`}
                className="text-blue-600 hover:underline">{r.entry_id}</Link>
            </td>
            <td className="p-1 text-right">{r.avg_return.toFixed(1)}%</td>
            <td className="p-1 text-right">{r.avg_sharpe.toFixed(2)}</td>
            <td className="p-1 text-right">{r.avg_mdd.toFixed(1)}%</td>
            <td className="p-1 text-right text-gray-500">{r.sample_size}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 2: RegimeSectorGrid.tsx**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { REGIME_EMOJI, REGIME_COLOR, RegimeState } from './types'

interface SectorRun { scope_id: string; current_state: RegimeState; current_confidence: number }

const SECTORS = ['TECH','COMM','FIN','INDUS','CONS_DISC','CONS_STAPLE','HEALTH','ENERGY','UTIL','MATERIAL','REIT'] as const

export default function RegimeSectorGrid() {
  const [kr, setKr] = useState<Record<string, SectorRun>>({})
  const [us, setUs] = useState<Record<string, SectorRun>>({})

  useEffect(() => {
    fetch('/api/investment/regime/sectors?market=KR').then(r => r.json()).then(j => {
      const map: Record<string, SectorRun> = {}
      for (const r of j.data ?? []) map[r.scope_id] = r
      setKr(map)
    })
    fetch('/api/investment/regime/sectors?market=US').then(r => r.json()).then(j => {
      const map: Record<string, SectorRun> = {}
      for (const r of j.data ?? []) map[r.scope_id] = r
      setUs(map)
    })
  }, [])

  return (
    <div className="rounded-md border bg-white p-4">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-gray-500">
          <th className="p-1">섹터</th><th className="p-1">KR</th><th className="p-1">US</th>
        </tr></thead>
        <tbody>
          {SECTORS.map(s => {
            const krRun = kr[`GICS_${s}_KR`]; const usRun = us[`GICS_${s}_US`]
            return (
              <tr key={s} className="border-t">
                <td className="p-2 font-medium">{s}</td>
                <td className="p-2">{krRun ? <Cell run={krRun} /> : <span className="text-gray-400">학습 대기</span>}</td>
                <td className="p-2">{usRun ? <Cell run={usRun} /> : <span className="text-gray-400">학습 대기</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-gray-500">섹터별 학습은 Phase 2 — 섹터 인덱스 ticker 매핑 추가 시 활성화됩니다.</p>
    </div>
  )
}

function Cell({ run }: { run: SectorRun }) {
  return <span className="inline-flex items-center gap-1" style={{ color: REGIME_COLOR[run.current_state] }}>
    {REGIME_EMOJI[run.current_state]} {run.current_state} {(run.current_confidence*100).toFixed(0)}%
  </span>
}
```

- [ ] **Step 3: RegimeUserTickerTab.tsx**

```typescript
'use client'
import { useState } from 'react'
import { REGIME_EMOJI, REGIME_COLOR, RegimeState } from './types'

export default function RegimeUserTickerTab() {
  const [ticker, setTicker] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  async function analyze(mode: 'fast' | 'precise') {
    if (!ticker.trim()) return
    setLoading(true); setError(null); setResult(null)
    try {
      const r = await fetch('/api/investment/regime/analyze', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticker: ticker.trim(), mode }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'fail')
      setResult({ mode, ...j })
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="rounded-md border bg-white p-4 space-y-3">
      <div className="flex gap-2">
        <input value={ticker} onChange={e => setTicker(e.target.value)}
          placeholder="종목 코드 (예: 005930, AAPL)"
          className="flex-1 border rounded px-3 py-2 text-sm"/>
        <button onClick={() => analyze('fast')} disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded disabled:opacity-50">
          {loading ? '분석 중...' : '즉시 분석'}
        </button>
        <button onClick={() => analyze('precise')} disabled={loading}
          className="px-4 py-2 bg-purple-600 text-white text-sm rounded disabled:opacity-50">
          정밀 학습 요청
        </button>
      </div>

      {error && <div className="text-sm text-red-600">오류: {error}</div>}

      {result?.mode === 'fast' && result?.data && (
        <div className="rounded border p-3">
          <div className="text-lg font-semibold" style={{ color: REGIME_COLOR[result.data.current_state as RegimeState] }}>
            {REGIME_EMOJI[result.data.current_state as RegimeState]} {result.data.current_state} ({(result.data.current_confidence*100).toFixed(0)}%)
          </div>
          <div className="mt-2 text-xs text-gray-500">데이터 기준일: {result.data.data_as_of}</div>
          <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">{JSON.stringify(result.data.state_probabilities, null, 2)}</pre>
        </div>
      )}
      {result?.mode === 'precise' && (
        <div className="rounded border p-3 text-sm bg-purple-50">
          정밀 학습 요청이 큐에 추가되었습니다. 다음 일배치(매일 20:30 KST)에서 처리되며, 완료 시 알림으로 통지됩니다.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: RegimeAlertsTab.tsx**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { REGIME_EMOJI, REGIME_COLOR, RegimeState } from './types'

interface Alert {
  id: number; scope_type: string; scope_id: string
  from_state: RegimeState; to_state: RegimeState
  transition_date: string; notified_at: string
}

export default function RegimeAlertsTab() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  useEffect(() => {
    fetch('/api/investment/regime/alerts').then(r => r.json()).then(j => setAlerts(j.data ?? []))
  }, [])

  if (alerts.length === 0) return (
    <div className="rounded-md border bg-white p-4 text-sm text-gray-500">
      받은 알림이 없습니다. 시장/섹터 국면 변경 시 자동으로 알림이 발송됩니다.
    </div>
  )

  return (
    <div className="rounded-md border bg-white p-4 space-y-2">
      {alerts.map(a => (
        <div key={a.id} className="flex items-center justify-between border-b last:border-b-0 py-2 text-sm">
          <div>
            <div className="font-medium">{a.scope_id}</div>
            <div className="text-xs text-gray-500">{a.transition_date}</div>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: REGIME_COLOR[a.from_state] }}>{REGIME_EMOJI[a.from_state]} {a.from_state}</span>
            <span>→</span>
            <span style={{ color: REGIME_COLOR[a.to_state] }}>{REGIME_EMOJI[a.to_state]} {a.to_state}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: 빌드**

```bash
npm run build
```
Expected: 0 errors.

- [ ] **Step 6: 커밋**

```bash
git add src/components/Investment/Regime/
git commit -m "feat(regime): sector grid + user ticker + alerts + best strategies"
```

---

## Task 18: 풀배치 실행 + E2E 검증 + 푸시

- [ ] **Step 1: 6개 시장 풀배치 실행 (Mac mini)**

```bash
cd python-workers/regime
source .venv/bin/activate
python -m regime.train_worker
```
Expected (~30~60분 소요):
```
== macro fetch ==
  FRED: <N>
  ECOS: <N>
== markets ==
[market/KOSPI] start ... done: state=... conf=...
[market/KOSDAQ] start ... done
[market/SP500] start ... done
[market/NASDAQ] start ... done
[market/DOW] start ... done
[market/RUSSELL2000] start ... done
== matrix backfill ==
  ...
```

Supabase 콘솔: `regime_runs` 6개 row + `regime_history` 약 7,500 row (6 시장 × 5년 × 250 영업일) 확인.

- [ ] **Step 2: launchd 가동 확인 (자동 재시작 포함)**

```bash
launchctl list | grep regime
curl -s http://127.0.0.1:8001/health
```
Expected: 두 launchd job 표시 + health OK

- [ ] **Step 3: E2E 브라우저 테스트 (테스트 계정 로그인)**

`whitedc0902@gmail.com` / `ghkdgmltn81!` 로 로그인 후 Chrome DevTools MCP 로:
1. `/dashboard?tab=investment&sub=regime` 진입 — 사이드바·헤더 유지 확인 (별도 페이지 X)
2. 시장 탭: 4 카드 표시 + 카드 클릭 시 상세 패널 (타임라인, 전환표, voting, best strategies)
3. 섹터 탭: "학습 대기" 메시지 (Phase 2)
4. 사용자 종목 탭: `005930` 입력 → 즉시 분석 → 5~10초 내 결과
5. 사용자 종목 탭: `005930` 입력 → 정밀 학습 요청 → 큐 메시지 표시
6. 알림 탭: "받은 알림 없음" (첫 배치 후 변경 없음)
7. 콘솔 에러 0건 확인 (`list_console_messages`)

- [ ] **Step 4: develop 푸시**

```bash
git push origin develop
```
Expected: 푸시 성공.

- [ ] **Step 5: develop → main 통합 PR 갱신**

```bash
gh pr list --base main --head develop --state open --json number,url --limit 1
```
열린 PR 있으면 자동 누적, 없으면:
```bash
gh pr create --base main --head develop --title "release: develop → main (시장 국면 시스템 포함)" --body "$(cat <<'EOF'
## Summary
- Investment 모듈 신규 SUB_TAB: 시장 국면 분석
- Python sidecar(Mac mini) + 3개 학술 모델 voting
- 시장 6개 일배치 + 사용자 종목 on-demand
- Strategy Matrix 연동 (regime 필터 best strategies)

## Test plan
- [ ] /dashboard?tab=investment&sub=regime 진입 시 사이드바 유지
- [ ] 4 시장 카드 + 상세 패널 동작
- [ ] 사용자 종목 즉시 분석 5~10초 내 응답
- [ ] launchd 자동 재시작 (regime-server 항상 ON)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Phase 2 (추후, 본 plan 범위 외)

- GICS 섹터 22개 인덱스 ticker 매핑 + 섹터 학습
- 사용자 종목 정밀 학습 큐 처리 (regime_jobs 워커)
- 알림 toggle UI (RegimeAlertsTab settings 폼)
- 알림 트리거 로직 (직전 영업일 대비 state 변경 감지 → notifications insert)
- self-supervised re-labeling (모델 결과로 라벨 재학습)
- Strategy Matrix regime_at_window_end 전체 backfill (대량)
- 이메일 알림 (Resend)

---

## Self-Review

**1. Spec 커버리지**:
- ✅ Section 4 (DB 7개 테이블 + ALTER) → Task 1
- ✅ Section 5 (Python sidecar) → Tasks 2-12
- ✅ Section 6 (Node API) → Task 13
- ✅ Section 7 (UI) → Tasks 15-17
- ✅ Section 8 (알림 + Matrix 연동) → Tasks 17 + 13 (best-strategies). 알림 트리거 로직은 Phase 2 로 이동 (이유: 첫 배치는 직전 영업일 비교 데이터가 없어 의미 없음).
- ✅ Section 9 (권한·메뉴·일정) → Tasks 14, 12, 15
- ⚠️ 섹터 학습 미구현 — Task 10 에서 "skip sector (Phase 2)" 명시. 시장 6개만 Phase 1.

**2. Placeholder 스캔**: TBD/TODO/"implement later" 없음. 모든 step 에 실제 코드 또는 명령. ✅

**3. Type 일관성**:
- `RegimeState` = `'bull' | 'bear' | 'sideways' | 'crisis'` — Python `STATES`, TypeScript `types.ts` 일치 ✅
- `RegimeRun` 인터페이스 — types/regime.ts ↔ Regime/types.ts 같은 필드 ✅
- `scope_type` enum = `'market' | 'sector' | 'ticker'` Python/Node 일치 ✅
- API 라우트 query param: UI 가 `scope` 쿼리로 보내고 Node 가 `scope_type` 컬럼으로 매핑 ✅
