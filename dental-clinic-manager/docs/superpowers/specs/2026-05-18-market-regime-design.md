# 시장 국면 감지·예측 시스템 디자인

> **작성일**: 2026-05-18
> **상태**: 디자인 승인 완료, 구현 계획 작성 대기
> **위치**: Investment 모듈 신규 SUB_TAB (`regime`)

## 1. 목적

사용자가 "현재 시장이 어떤 국면(Bull/Bear/Sideways/Crisis)에 있는지" 와 "가까운 미래(5/10/30일) 에 다른 국면으로 전환할 확률은 얼마인지" 를 학술 검증된 모델로 답하는 기능을 제공한다. Smart Money(종목 미시구조) 와 Strategy Matrix(전략×종목 백테스트) 와는 역할이 분리된 **시장 매크로 의사결정 도구** 로 자리잡는다.

근거 논문:
- **Gupta et al., 2025** — *A forest of opinions: A multi-model ensemble-HMM voting framework for market regime shift detection and trading* (DSFE, AIMS)
- **Xu et al., 2024** — *RHINE: A Regime-Switching Model with Nonlinear Representation for Discovering and Forecasting Regimes in Financial Markets* (SIAM SDM)
- **Sun et al., 2025** — *Adaptive Ensemble Learning for Financial Time-Series Forecasting: A Hypernetwork-Enhanced Reservoir Computing Framework with Multi-Scale Temporal Modeling* (MDPI Axioms)

## 2. 핵심 결정 사항 (브레인스토밍 확정)

| # | 결정 | 사유 |
|---|---|---|
| 1 | **Python sidecar** (Mac mini, Node가 HTTP 호출) | 논문 모델(hmmlearn, statsmodels, reservoirpy, PyTorch) 충실 재현 위해 Python 생태계 필수 |
| 2 | **분석 단위**: 시장 지수 6 + GICS 섹터 22 + 사용자 지정 종목 | 매크로 의사결정 + 섹터 로테이션 + 종목 단위 활용까지 단계적으로 커버 |
| 3 | **사용자 종목 추론**: 즉시 추론(섹터 모델 재사용) + 정밀 학습 옵션(백그라운드 큐) | 즉시 응답 UX + 종목 특유 패턴 학습 모두 제공 |
| 4 | **입력 특징**: 가격 + 매크로 (FRED + ECOS) | 매크로 stress 시그널(VIX/금리/스프레드)이 Crisis 국면 판별에 결정적 |
| 5 | **국면 수**: 4-state (Bull / Bear / Sideways / Crisis) | Bear 와 Crisis 구분이 사용자 의사결정에 핵심, Smart Money(Wyckoff)와 역할 분리 |
| 6 | **출력 범위**: 현재 국면 + 전환 예측 + 모델 voting 투명성 + 알림 + Strategy Matrix 연동 | 논문 3편 핵심 가치 모두 노출, 의사결정 지원 완결 |
| 7 | **업데이트 주기**: 일배치 (시장/섹터) + on-demand (사용자 종목) | 매크로 일 1회 갱신과 정합, 사용자 종목 즉시성 보장 |
| 8 | **모델 구현 충실도**: **하이브리드** — Gupta 100% 재현 + RHINE 라이브러리 조합 + Sun Hypernetwork from-scratch | RHINE 저자 코드 없음(from-scratch 위험), Hypernetwork는 구조 단순(~50줄 PyTorch)이라 from-scratch 가능 |

## 3. 전체 아키텍처

```
[사용자]
  ↓
[Next.js Dashboard]  ── Investment > 시장 국면 sub_tab
  ↓
[Node.js API]  /api/investment/regime/*
  ↓ ↑                  ↓ ↑ HTTP localhost:8001
[Supabase]   ─────  [Mac mini Python sidecar]
                     ├ regime_train_worker.py  (launchd KST 20:30, 일배치)
                     └ regime_infer_server.py  (FastAPI, on-demand 추론)
                           ↓
                     [모델 3종]
                       ├ HMM Voting Ensemble        — Gupta 2025 충실 (라이브러리)
                       ├ KernelPCA + MarkovRegression — RHINE 핵심 차용 (라이브러리)
                       └ Reservoir + Hypernetwork     — reservoirpy + custom PyTorch HyperNet
                           ↓
                     [데이터 fetcher]
                       ├ FRED API   (US 매크로)
                       ├ ECOS API   (KR 매크로)
                       └ stockDataService (기존, Supabase 가격 캐시)
```

**경계 원칙**:
- **Python sidecar**: 입력 JSON → 출력 JSON, stateless. 모델 학습/추론만 책임.
- **Supabase**: 모든 상태의 단일 진실원 (학습된 모델 메타·추론 결과·전환 알림·매크로 시계열).
- **Node API**: 인증/권한/오케스트레이션만. 모델 내부 로직 모름.

## 4. 데이터 모델

신규 마이그레이션 파일: `supabase/migrations/20260518_market_regime.sql`

```sql
-- 매크로 지표 시계열 (FRED + ECOS)
CREATE TABLE macro_indicators (
  date DATE NOT NULL,
  source TEXT NOT NULL,           -- 'FRED' | 'ECOS'
  indicator_id TEXT NOT NULL,     -- 'VIXCLS', 'DGS10', 'KR_BASE_RATE' 등
  value NUMERIC,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (date, source, indicator_id)
);
CREATE INDEX idx_macro_indicator_date ON macro_indicators (indicator_id, date DESC);

-- 학습 모델 메타데이터 (시장 6 + 섹터 22 = 28 scope × model_type 3 = 84 모델)
CREATE TABLE regime_models (
  id BIGSERIAL PRIMARY KEY,
  scope_type TEXT NOT NULL,       -- 'market' | 'sector'
  scope_id TEXT NOT NULL,         -- 'KOSPI', 'GICS_TECH_US'
  model_type TEXT NOT NULL,       -- 'hmm_voting' | 'kernel_markov' | 'reservoir_hyper'
  model_version TEXT NOT NULL,    -- '2026.05.18'
  model_blob_path TEXT NOT NULL,  -- Supabase Storage 경로 'models/regime/{scope}/{type}_{ver}.joblib'
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
  trigger_type TEXT NOT NULL,      -- 'batch' | 'on_demand' | 'precision'
  current_state TEXT NOT NULL,     -- 'bull' | 'bear' | 'sideways' | 'crisis'
  current_confidence NUMERIC,
  state_probabilities JSONB,       -- {bull: 0.65, bear: 0.10, sideways: 0.20, crisis: 0.05}
  model_votes JSONB,               -- {hmm:{state,conf}, kernel:{...}, reservoir:{...}}
  transition_probabilities JSONB,  -- {5d:{...}, 10d:{...}, 30d:{...}}
  data_as_of DATE,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (scope_type, scope_id, as_of_date, trigger_type)
);
CREATE INDEX idx_regime_runs_lookup ON regime_runs (scope_type, scope_id, as_of_date DESC);

-- 국면 타임라인 (지난 N년 일자별)
CREATE TABLE regime_history (
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  date DATE NOT NULL,
  state TEXT NOT NULL,
  confidence NUMERIC,
  PRIMARY KEY (scope_type, scope_id, date)
);

-- 정밀 학습 작업 큐 (사용자 종목)
CREATE TABLE regime_jobs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  scope_type TEXT,
  scope_id TEXT,
  job_type TEXT,                   -- 'precision_train' | 'on_demand_infer'
  status TEXT DEFAULT 'queued',    -- 'queued' | 'running' | 'done' | 'failed'
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

-- Strategy Matrix 연동 (기존 테이블 확장, 단일 컬럼 추가만 — 기존 기능 영향 없음)
ALTER TABLE strategy_matrix_runs
  ADD COLUMN regime_at_window_end TEXT;
CREATE INDEX idx_smr_regime ON strategy_matrix_runs (regime_at_window_end, market, period_window);
```

**범위**:
- 시장 지수 6개: KOSPI, KOSDAQ, S&P500, NASDAQ, DOW, RUSSELL2000
- GICS 섹터 22개: KR 11 + US 11
- 총 28 scope × 모델 3종 = 84 모델

**매크로 지표 목록 (FRED)**:
- `VIXCLS` (S&P500 변동성 지수)
- `DGS10` (US 10Y 국채 수익률)
- `DGS2` (US 2Y 국채 수익률)
- `T10Y2Y` (10Y-2Y 스프레드)
- `DTWEXBGS` (달러지수)
- `DFF` (연방기준금리)
- `BAMLH0A0HYM2` (하이일드 신용스프레드)

**매크로 지표 목록 (ECOS — 한국은행)**:
- 한국 기준금리 (722Y001)
- 원/달러 환율 (731Y001)

## 5. Python sidecar

신규 디렉토리 `python-workers/regime/`:

```
python-workers/regime/
├── pyproject.toml              # hmmlearn, xgboost, scikit-learn, statsmodels,
│                                 reservoirpy, torch, fastapi, supabase-py, httpx, joblib
├── README.md
├── config.py                   # FRED/ECOS API key, Supabase URL, model versions
├── fetchers/
│   ├── __init__.py
│   ├── fred_fetcher.py         # FRED API → macro_indicators upsert
│   ├── ecos_fetcher.py         # ECOS API → macro_indicators upsert
│   └── price_fetcher.py        # Supabase 가격 캐시 SELECT
├── features/
│   ├── __init__.py
│   └── feature_engineer.py     # 가격 → ret/vol/RSI/MACD + 매크로 정렬
├── models/
│   ├── __init__.py
│   ├── hmm_voting.py           # Gupta 2025
│   ├── kernel_markov.py        # RHINE 차용
│   └── reservoir_hyper.py      # Sun 2025
├── voting.py                   # 3개 모델 결과 → 최종 state + confidence
├── transition.py               # 전환 확률 (5/10/30d)
├── labeling.py                 # 초기 학습용 휴리스틱 라벨링 (수익률/변동성 임계값)
├── storage.py                  # Supabase Storage joblib 업/다운로드 (모델 직렬화는 sklearn 표준 joblib 사용)
├── train_worker.py             # launchd 진입점 (일배치)
├── infer_server.py             # FastAPI :8001 (on-demand)
└── launchd/
    └── com.dental.regime.plist  # KST 20:30
```

> **모델 직렬화 보안 노트**: 모델 아티팩트는 `joblib` (scikit-learn 표준) 으로 직렬화하여 Supabase Storage 의 service-role-key 보호된 비공개 버킷에만 저장/로드한다. 외부 사용자 입력으로 받은 파일은 절대 역직렬화하지 않으며, 우리 자체 학습 워커가 생성한 trusted artifact 만 로드한다.

### 5.1 모델 알고리즘 핵심

**hmm_voting.py (Gupta 2025 충실)**
```python
def train(features: np.ndarray, labels: np.ndarray) -> dict:
    hmm = GaussianHMM(n_components=4, covariance_type='full').fit(features)
    xgb = XGBClassifier(n_estimators=200, max_depth=5).fit(features, labels)
    rf  = RandomForestClassifier(n_estimators=300).fit(features, labels)
    bag = BaggingClassifier(estimator=DecisionTreeClassifier(),
                            n_estimators=100).fit(features, labels)
    return {'hmm': hmm, 'xgb': xgb, 'rf': rf, 'bag': bag}

def predict_proba(models: dict, features: np.ndarray) -> np.ndarray:
    # HMM은 hidden state → label mapping 필요 (Viterbi)
    hmm_proba = _hmm_state_to_label_proba(models['hmm'], features)
    others = [models[k].predict_proba(features) for k in ['xgb', 'rf', 'bag']]
    return np.mean([hmm_proba] + others, axis=0)
```

**kernel_markov.py (RHINE 핵심 차용)**
```python
def train(features: np.ndarray) -> dict:
    kpca = KernelPCA(n_components=8, kernel='rbf', gamma=0.1).fit(features)
    Z = kpca.transform(features)
    # statsmodels MarkovRegression: 1차 마르코프, 4 regime, switching variance
    ms = MarkovRegression(Z[:,0], k_regimes=4, switching_variance=True,
                          trend='c').fit()
    return {'kpca': kpca, 'ms': ms}

def predict_proba(models: dict, features: np.ndarray) -> np.ndarray:
    Z = models['kpca'].transform(features)
    # Hamilton filter 로 smoothed marginal probabilities 추출
    smoothed = models['ms'].smoothed_marginal_probabilities
    return smoothed
```

**reservoir_hyper.py (Sun 2025: reservoir 라이브러리 + from-scratch HyperNet)**
```python
class HyperNet(nn.Module):
    """ Context 통계 → reservoir readout 의 가중치/정규화 출력 (~50줄) """
    def __init__(self, ctx_dim: int, reservoir_dim: int, n_states: int):
        super().__init__()
        self.shared = nn.Sequential(nn.Linear(ctx_dim, 64), nn.ReLU(),
                                    nn.Linear(64, 64), nn.ReLU())
        self.alpha_head = nn.Linear(64, 1)            # adaptive ridge
        self.W_head = nn.Linear(64, reservoir_dim * n_states)

    def forward(self, z: torch.Tensor):
        h = self.shared(z)
        alpha = F.softplus(self.alpha_head(h))        # > 0
        W = self.W_head(h).view(-1, reservoir_dim, n_states)
        return alpha, W

def train(features: np.ndarray, labels: np.ndarray) -> dict:
    esn = ESN(units=200, sr=0.95, lr=0.3, seed=42)
    states = esn.run(features)                         # (T, 200)
    ctx = _compute_context(features)                   # 변동성/추세 통계 (T, 8)
    hypernet = HyperNet(ctx_dim=8, reservoir_dim=200,
                        n_states=4).train_with_adaptive_loss(states, labels, ctx)
    return {'esn': esn, 'hypernet': hypernet}

def predict_proba(models: dict, features: np.ndarray) -> np.ndarray:
    states = models['esn'].run(features)
    ctx = _compute_context(features)
    alpha, W = models['hypernet'](torch.tensor(ctx[-1]))
    # readout: softmax(states @ W / alpha)
    return F.softmax(states[-1] @ W / alpha, dim=-1).numpy()
```

### 5.2 train_worker.py 흐름

1. Macro fetcher 실행: FRED + ECOS 신규 일자만 fetch → `macro_indicators` upsert
2. 28 scope 순회 (시장 6 + 섹터 22):
   - 가격(Supabase 캐시) + 매크로 결합 → feature engineer
   - 4-state 휴리스틱 라벨링 (초기 학습용 supervision):
     - Bull: 20일 수익률 > +3%, 60일 변동성 < median × 1.2
     - Bear: 20일 수익률 < -3%, 60일 변동성 < median × 1.5
     - Crisis: VIX > 30 OR 20일 수익률 < -10%
     - Sideways: 나머지
   - 3개 모델 학습 → joblib 직렬화 → Supabase Storage 업로드 (위 보안 노트 준수)
   - 모델로 최신일 추론 → `regime_runs` upsert (trigger_type='batch')
   - 지난 5년 backfill → `regime_history` upsert
3. `regime_jobs` 큐 처리 (사용자 정밀 학습 요청)
4. 직전 영업일 대비 state 변경 감지 → `regime_alerts` insert + `notifications` insert
5. `strategy_matrix_runs.regime_at_window_end` backfill (NULL 행만)

### 5.3 infer_server.py (on-demand)

- `POST /infer { scope_type, scope_id, ticker?, mode }` → 5~10초 내 결과
- 종목 입력 시 (`mode='fast'`): 종목의 GICS 섹터 자동 매칭 → 해당 섹터 사전학습 모델로 추론
- Node.js API 가 localhost:8001 로 HTTP 호출 (외부 노출 X, listen 127.0.0.1 only)
- 결과는 `regime_runs` upsert (trigger_type='on_demand'), 1일 캐싱

## 6. Node.js API

신규 라우트 `src/app/api/investment/regime/`:

```
GET  /current?scope=market&id=KOSPI            → 최신 regime_runs 단건
GET  /history?scope=market&id=KOSPI&days=730   → regime_history 시계열
GET  /transition?scope=market&id=KOSPI         → 전환 확률
GET  /sectors?market=KR                        → 섹터 11개 현재 국면
POST /analyze                                  → on-demand 종목 분석
       body: { ticker: '005930', mode: 'fast' | 'precise' }
       fast: infer_server에 위임 (5~10초)
       precise: regime_jobs 큐잉 + 다음 배치 처리, 사용자에게 알림
GET  /best-strategies?regime=bull&market=KR&period=5Y
       → strategy_matrix_runs WHERE regime_at_window_end=X
GET  /alerts                                    → regime_alerts 본인 대상
POST /alerts/settings                            → 알림 ON/OFF
```

각 라우트는 기존 `requireAuth` + 권한 체크 (`permissions.includes('regime_view')` 등) 미들웨어 재사용.

## 7. 프론트엔드 UI

### 7.1 SUB_TAB 추가

`src/components/Investment/InvestmentTab.tsx`:
- `SubTab` 타입에 `'regime'` 추가
- `SUB_TABS` 배열에 `{ id: 'regime', label: '시장 국면', icon: Activity }` 추가
- `SUB_TAB_IDS` set 에 `'regime'` 추가
- 분기 (`subTab === 'regime'`) 4곳에 추가
- 무거운 컴포넌트는 `next/dynamic` 으로 import

진입 링크: `/dashboard?tab=investment&sub=regime`

### 7.2 컴포넌트 구조

```
src/components/Investment/Regime/
├── RegimeContent.tsx           # 메인 컨테이너 + 탭 라우팅
├── RegimeMarketGrid.tsx        # 상단 4 시장 카드 그리드
├── RegimeDetailDrawer.tsx      # 시장/섹터 클릭 시 상세
├── RegimeTimelineChart.tsx     # 국면 색상 오버레이 타임라인 (recharts)
├── RegimeTransitionTable.tsx   # 전환 확률 표
├── RegimeModelVoting.tsx       # 모델별 투명성 패널
├── RegimeBestStrategies.tsx    # Strategy Matrix 연동 (regime 필터)
├── RegimeSectorGrid.tsx        # 섹터 22개 그리드
├── RegimeUserTickerTab.tsx     # 종목 검색 + 즉시/정밀 분석
├── RegimeAlertsTab.tsx         # 알림 목록 + 설정
└── types.ts                    # RegimeState, RegimeRun, ModelVote 등
```

### 7.3 UI 와이어

```
[헤더] 시장 국면 분석    [마지막 업데이트: 2026-05-18 20:30 KST]

[상단 4 그리드: 주요 시장 지수 카드]
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ KOSPI       │ │ KOSDAQ      │ │ S&P 500     │ │ NASDAQ      │
│ 🟢 Bull     │ │ 🟡 Sideways │ │ 🟢 Bull     │ │ 🔴 Crisis   │
│ 78% conf.   │ │ 62% conf.   │ │ 84% conf.   │ │ 71% conf.   │
│ ▮▮▮▮▮░░░    │ │ ▮▮▮▮░░░░    │ │ ▮▮▮▮▮▮░     │ │ ▮▮▮▮▮░░     │
│ 5d 전환: 4% │ │ 5d 전환:22% │ │ 5d 전환: 8% │ │ 5d 전환:35% │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘

[탭: 시장 / 섹터 / 사용자 종목 / 알림]

(시장 탭) 상세 패널 (카드 클릭 시 확장)
  ▸ 지수 가격 + 국면 색상 오버레이 타임라인 (지난 5년, recharts ComposedChart)
  ▸ 전환 예측 표 (5d/10d/30d × 4-state 확률)
  ▸ 모델 voting 투명성 패널 (HMM/Kernel/Reservoir 각 결과 + 최종 평균)
  ▸ 현재 국면에서 잘 작동한 전략 TOP 5 (Strategy Matrix 연동)

(섹터 탭) GICS 22개 색상 그리드 (행 11개 섹터 × 열 KR/US)

(사용자 종목 탭) 검색 입력 + [분석] + [정밀 학습 요청]

(알림 탭) regime_alerts 본인 대상 N건 + 설정
```

## 8. 알림 + Strategy Matrix 연동

### 8.1 알림
1. Mac mini 일배치 종료 후 `train_worker.py` 가 직전 영업일 대비 state 변경 감지
2. 변경된 scope 별로 `regime_alerts` insert
3. 동시에 기존 `notifications` 테이블에 `type='regime_alert'`, `user_ids=owner+vice_director+manager` insert
4. 사용자가 대시보드 접속 시 기존 알림 종(NotificationBell) 에 표시

### 8.2 Strategy Matrix 연동
1. `train_worker.py` 가 일배치 후 추가 작업:
   - `strategy_matrix_runs.regime_at_window_end IS NULL` 행 backfill
   - 각 row 의 `end_date` 와 `market` 으로 `regime_history` 조회 → `regime_at_window_end` 기록
2. 신규 API `GET /api/investment/regime/best-strategies` 가 그룹 집계 → Top 10
3. UI `RegimeBestStrategies.tsx` 가 호출 → 클릭 시 Matrix 페이지로 이동 (URL 쿼리로 필터 전달)

## 9. 권한·메뉴·일정

### 9.1 권한 (`src/types/permissions.ts`)
- `regime_view` (모든 직원): 시장/섹터 국면 조회, 알림 받기
- `regime_analyze` (manager+): 사용자 지정 종목 분석 (즉시/정밀)
- `regime_admin` (owner+): 알림 설정 변경, 정밀 학습 큐 관리

업데이트 항목:
- `Permission` union에 위 3개 키 추가
- `PERMISSION_GROUPS` 신규 그룹 추가
- `PERMISSION_DESCRIPTIONS` 한글 설명 추가
- `DEFAULT_PERMISSIONS` 역할별 추가 (owner 전부, vice_director: view+analyze, manager: view+analyze, 일반 직원: view)
- `NEW_FEATURE_PREFIXES` 에 `regime_` 추가

### 9.2 메뉴 (`src/config/menuConfig.ts`)
- 신규 메뉴 없음 — Investment 탭 SUB_TAB 으로만 통합 (별도 라우트 금지 규칙 준수)

### 9.3 Mac mini launchd
- `com.dental.regime.plist`: KST **20:30** (Strategy Matrix 19시와 시간 분리)
- 첫 풀배치: 약 2~3시간 (28 scope × 3 모델 + 5년 backfill)
- 일배치: 매크로 fetch + 추론만 → 약 10~15분

### 9.4 환경변수 (Mac mini `.env`)
- 신규: `FRED_API_KEY` (https://fred.stlouisfed.org/docs/api/api_key.html 무료 등록)
- 신규: `ECOS_API_KEY` (https://ecos.bok.or.kr/api/ 무료 등록)
- 기존: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## 10. 검증 계획

1. **마이그레이션 적용**: Supabase MCP `apply_migration` → `list_tables` 로 7개 테이블 + ALTER 컬럼 확인
2. **Python 환경 셋업**: `python-workers/regime/` 에 `python -m venv .venv && pip install -e .` → 모든 import 성공 확인
3. **데이터 fetcher 단위 테스트**:
   - FRED: VIXCLS 지난 30일 fetch → 30 row insert 확인
   - ECOS: 한국 기준금리 fetch → 정상 응답 확인
4. **모델 학습 단위 테스트** (각 모델 1 scope = KOSPI 5Y):
   - HMM Voting: validation_accuracy > 0.55 (4-state baseline 25% 대비 의미 있음)
   - Kernel Markov: smoothed prob 합 ≈ 1.0
   - Reservoir Hyper: loss 수렴 확인
5. **infer_server 통합 테스트**: `curl POST :8001/infer` → 5~10초 내 JSON 응답
6. **Node API 통합 테스트**: `/api/investment/regime/current?scope=market&id=KOSPI` → 200 OK
7. **빌드 통과**: `npm run build`
8. **UI 동작** (테스트 계정 `whitedc0902@gmail.com` 로그인):
   - `/dashboard?tab=investment&sub=regime` 진입 시 사이드바·헤더 유지 (별도 페이지 아닌지 확인)
   - 4 시장 카드 표시
   - 카드 클릭 시 상세 패널 (타임라인, 전환, voting)
   - 사용자 종목 탭에서 "005930" 입력 → 5~10초 내 결과
   - 정밀 학습 버튼 → 큐 추가 확인
9. **알림 동작**: 가짜 state 변경 trigger → NotificationBell 에 표시 확인
10. **Strategy Matrix 연동**: `/api/investment/regime/best-strategies?regime=bull` → Top 10 응답
11. **launchd 등록**: `launchctl load ~/Library/LaunchAgents/com.dental.regime.plist` → 다음날 20:30 자동 실행 로그 확인
12. **하위 호환**: 기존 Investment SUB_TAB 모두 정상 (회귀 없음)

## 11. 위험요소

| 위험 | 영향 | 완화 |
|---|---|---|
| Python sidecar 의 Mac mini 단일 장애 | on-demand 추론 불가, 일배치 누락 | infer_server health check + Slack 알림, 일배치 누락 시 다음날 자동 재시도 |
| 첫 풀배치 2~3시간 | Strategy Matrix 배치와 자원 경합 가능 | 시간 분리 (19시 → 20:30), CPU 4 코어 제한 |
| 4-state 휴리스틱 라벨링이 부정확 | 모델 학습이 잘못된 supervision 으로 진행 | Phase 2 에서 self-supervised re-labeling (모델 결과로 라벨 재학습) 도입 |
| RHINE 라이브러리 조합이 논문 정확도 못 따라감 | 전환 예측 신뢰도 낮음 | voting 으로 단일 모델 오류 흡수, 사용자에게 모델별 결과 투명 공개 (RegimeModelVoting) |
| Hypernetwork from-scratch 학습 불안정 | reservoir 결과 noise 큼 | adaptive ridge 안전망, voting 가중치에서 reservoir 비중 조정 가능 |
| FRED/ECOS API rate-limit | 일배치 실패 | 일 1회만 호출, 신규 일자만 fetch (incremental) |
| Supabase Storage 모델 artifact 누적 | 디스크 비용 증가 | model_version 별 최신 2개만 유지, 이전 버전 자동 cleanup |
| 사용자 종목 정밀 학습 대기 | UX 답답 (다음날) | UI 에 명확히 안내, 정밀 학습 결과 시 in-app 알림 |
| Supabase Storage 의 모델 artifact 무결성 | 변조 시 잘못된 추론 | Service-role-key 비공개 버킷에만 저장, 우리 워커가 생성한 trusted artifact 만 로드 |
