# 강화학습(RL) 기반 적응형 트레이딩 모델 통합 — Phase 1

작성일: 2026-04-29
대상 시장: 미국 주식 (Phase 1)
운용 단위: Portfolio (Dow 30 등) + Single-asset (Phase 1은 Portfolio만 자동매매까지 완성)

---

## 1. Context

기존 자동매매는 룰 기반(지표 + 조건 트리)만 지원한다. 강화학습 기반 적응형 트레이딩 모델을 새로운 전략 타입으로 추가해, 시장 데이터에 학습된 정책이 직접 매수/매도 결정을 내릴 수 있게 한다.

**Phase 1은 의도적으로 좁다:**
- 미국 주식 시장만 (KIS 해외주식 인프라 재사용)
- FinRL/Stable-Baselines3 **공식 사전학습 모델 로드**가 출발점 (자체 학습 파이프라인은 Phase 2)
- 일봉(1d) **재교형** 1회/일이 결정 주기 (분봉/실시간 추론은 Phase 2)
- **Portfolio 운용 단위**가 자동매매 완성 대상. Single-asset 추상화는 등록만 가능, 자동매매 자체 학습 모델 등록 후로 미룸

**왜 좁히는가:**
- FinRL 사전학습 모델은 대부분 Dow 30 portfolio · 일봉 구조. 분포 변화(distribution shift)·state space 불일치를 피하려면 학습 시점 환경에 맞춰 운영해야 한다.
- 일봉 재교형은 KIS API 호출이 하루 몇 번에 그쳐 운영 부담이 작고, 미국 시장 마감 후 충분한 데이터 안정화 시간을 확보할 수 있다.
- 사용자가 "Paper·Live 모두 자동 가능"을 선택했지만, Phase 1 안전망(default level=1, kill switch, 신뢰도 임계, 일일 손실 한도, idempotency)을 강제로 포함한다.

---

## 2. 시스템 아키텍처

```
┌─ Next.js 메인 앱 ────────┐    ┌─ trading-worker (기존 + 확장) ──┐
│  /investment/rl-models   │    │  signalProcessor.ts (기존)       │
│  /investment/strategy/*  │    │  + dailyRebalanceJob.ts (신규)   │
│  /api/investment/*       │    │  KIS 미국주식 WS/REST            │
└──────────┬───────────────┘    └─────────┬───────────────────────┘
           │                               │ HTTP (localhost:8001)
           │                               ▼
           │                    ┌─ rl-inference-server (신규) ─────┐
           │                    │  Python 3.11 + FastAPI           │
           │                    │  + PyTorch + stable-baselines3   │
           │                    │  + finrl (필요 모듈만)           │
           │                    │  POST /predict, /backtest        │
           │                    │  ckpt LRU + state schema 검증    │
           │                    └──────────────────────────────────┘
           ▼
┌─ Supabase ───────────────┐
│  rl_models (신규)         │
│  rl_inference_logs (신규) │
│  investment_strategies    │
│   (strategy_type 확장)    │
└──────────────────────────┘
```

**프로세스 토폴로지:**
- 메인 앱: 기존 그대로 (Vercel 또는 자체 호스팅)
- trading-worker: 기존 PM2 프로세스
- rl-inference-server: 별도 PM2 프로세스 (`pm2 start ecosystem.config.js --only rl-inference`)
- 모두 동일 머신(Mac mini M4) 위에서 동작 가정. 통신은 localhost only (외부 노출 금지).

---

## 3. 데이터 모델

### 3.1 신규 테이블: `rl_models`

```sql
CREATE TABLE rl_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL CHECK (source IN ('finrl_pretrained','sb3_pretrained','custom')),
  algorithm TEXT NOT NULL,  -- 'PPO' | 'A2C' | 'TD3' | 'DDPG' | 'DQN' | 'SAC'
  kind TEXT NOT NULL CHECK (kind IN ('portfolio','single_asset')),
  market TEXT NOT NULL DEFAULT 'US',
  timeframe TEXT NOT NULL DEFAULT '1d',

  universe JSONB,                    -- portfolio: ['AAPL','MSFT',...], single: NULL
  input_features JSONB NOT NULL,     -- ['open','high','low','close','volume','rsi_14',...]
  state_window INT NOT NULL DEFAULT 60,  -- 모델이 요구하는 과거 봉 수
  output_shape JSONB NOT NULL,       -- {type:'continuous'|'discrete', dim:30}

  checkpoint_url TEXT,               -- HuggingFace/GitHub 다운로드 URL
  checkpoint_path TEXT,              -- 서버 로컬 경로 (다운로드 후)
  checkpoint_sha256 TEXT,            -- 무결성 검증용

  min_confidence NUMERIC(3,2) DEFAULT 0.60,  -- 자동매매 차단 임계값

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','downloading','ready','failed','archived')),
  metrics JSONB,                     -- {sharpe, max_dd, win_rate, ...}
  failure_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rl_models_clinic ON rl_models(clinic_id);
CREATE INDEX idx_rl_models_status ON rl_models(status);
```

### 3.2 `investment_strategies` 확장

```sql
ALTER TABLE investment_strategies
  ADD COLUMN strategy_type TEXT NOT NULL DEFAULT 'rule'
    CHECK (strategy_type IN ('rule','rl_portfolio','rl_single')),
  ADD COLUMN rl_model_id UUID REFERENCES rl_models(id) ON DELETE SET NULL;

-- RL 전략은 반드시 모델 연결되어야 함
ALTER TABLE investment_strategies
  ADD CONSTRAINT rl_strategy_requires_model
  CHECK (strategy_type = 'rule' OR rl_model_id IS NOT NULL);
```

### 3.3 신규 테이블: `rl_inference_logs`

```sql
CREATE TABLE rl_inference_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES investment_strategies(id) ON DELETE CASCADE,
  rl_model_id UUID NOT NULL REFERENCES rl_models(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,

  trade_date DATE NOT NULL,                  -- 결정이 적용될 거래일 (ET 기준)
  state_hash TEXT NOT NULL,                  -- 입력 state SHA256 — 재현성

  output JSONB NOT NULL,                     -- {action|weights, confidence, reasoning?}
  confidence NUMERIC(4,3),                   -- 추출된 평균 신뢰도 (정렬/필터용)
  decision TEXT NOT NULL CHECK (decision IN ('order','hold','blocked_low_confidence','blocked_kill_switch','error')),
  blocked_reason TEXT,

  latency_ms INT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (strategy_id, trade_date)           -- idempotency: 하루 1회만
);

CREATE INDEX idx_rl_logs_strategy_date ON rl_inference_logs(strategy_id, trade_date DESC);
CREATE INDEX idx_rl_logs_user_date ON rl_inference_logs(user_id, trade_date DESC);
```

### 3.4 `user_investment_settings` 확장 (kill switch)

```sql
ALTER TABLE user_investment_settings
  ADD COLUMN rl_paused_at TIMESTAMPTZ,        -- NULL=활성, 시각=일시정지 시점
  ADD COLUMN rl_paused_reason TEXT;
```

### 3.5 RLS 정책
- 모든 신규 테이블: 본인 clinic_id 기준 read, 본인 user_id 기준 write
- `rl_inference_logs`: 시스템(서비스 키)만 INSERT, 사용자는 본인 것 read만

---

## 4. 핵심 컴포넌트

### 4.1 `rl-inference-server/` (신규 Python 프로젝트)

위치: `/Users/hhs/Project/dental-clinic-manager/rl-inference-server/`

```
rl-inference-server/
├── pyproject.toml          # 또는 requirements.txt
├── ecosystem.config.js     # PM2 설정 (또는 trading-worker와 통합)
├── src/
│   ├── main.py             # FastAPI 앱 + 라우트
│   ├── config.py           # 환경변수 로딩 (PORT, MODEL_DIR, ...)
│   ├── model_registry.py   # ckpt 다운로드/캐시/로드 (LRU 2개)
│   ├── schemas.py          # Pydantic: PredictRequest/Response, BacktestRequest/Response
│   ├── inference/
│   │   ├── portfolio.py    # PortfolioInferenceEngine
│   │   └── single.py       # SingleAssetInferenceEngine
│   ├── adapters/
│   │   ├── finrl.py        # FinRL ckpt → 표준 인터페이스
│   │   └── sb3.py          # stable-baselines3 ckpt → 표준 인터페이스
│   └── utils/
│       ├── state_builder.py
│       └── feature_engineering.py
└── tests/
    ├── test_predict.py
    └── test_backtest.py
```

**핵심 의존성:**
- `fastapi`, `uvicorn[standard]`, `pydantic>=2`
- `torch>=2.2` (CPU 빌드도 충분 — 일봉 추론은 빠름)
- `stable-baselines3>=2.3` (PPO/A2C/TD3/DQN/SAC 로드)
- `finrl` (선택 — Dow 30 환경 정의 등 필요한 부분만)
- `numpy`, `pandas`
- `httpx` (테스트용)
- `pytest`, `pytest-asyncio`

**API:**

```
GET  /health                       → {status, loaded_models, uptime}
POST /models/download              → {model_id, checkpoint_url, sha256?}
                                    응답: {status: 'downloading'|'ready', path}
POST /predict                      → 본문 아래 참조
POST /backtest                     → ohlcv 기간 시뮬레이션
```

**`/predict` 요청 스키마:**
```ts
{
  model_id: string,                // rl_models.id (서버는 실제 ckpt만 읽음)
  checkpoint_path: string,         // 로컬 절대 경로
  algorithm: 'PPO'|'A2C'|...,
  kind: 'portfolio'|'single_asset',
  state_window: number,            // 60
  input_features: string[],
  ohlcv: {                         // universe별 OHLCV (portfolio 기준)
    [ticker: string]: Array<{date, open, high, low, close, volume}>
  },
  indicators?: {[ticker: string]: {[name: string]: number[]}},
  current_positions?: {[ticker: string]: {qty: number, avg_price: number}},
}
```

**`/predict` 응답 스키마:**
```ts
// portfolio:
{
  kind: 'portfolio',
  weights: {[ticker: string]: number},   // 합 ≈ 1
  confidence: number,                    // 0~1, 모델 출력 분포 기반 (예: softmax 최대값)
  raw_action: number[],                  // 디버깅용
  metadata: {model_id, latency_ms, ts}
}

// single_asset:
{
  kind: 'single_asset',
  action: 'buy'|'sell'|'hold',
  size_hint?: number,                    // 0~1 (자본 비율)
  confidence: number,
  metadata: {...}
}
```

**`confidence` 계산 규칙 (어댑터별):**
- PPO/A2C 등 stochastic policy: `mean(softmax(logits))의 최대 확률` 또는 분산 기반 1 − std/std_max
- DQN: `softmax(q_values)`의 최대값
- continuous (TD3/DDPG/SAC): 분산 기반 신뢰도. **모델별 어댑터에 명시적 함수로 구현, 가짜 1.0 금지**

**모델 캐시:**
- 메모리: 최근 사용 모델 2개 LRU (가벼운 설정 — 메모리 절약)
- 디스크: 다운로드한 ckpt는 영구 (`MODEL_DIR/<sha256>/`)
- 로딩 실패는 `rl_models.status='failed'`로 마킹 (서버가 직접 DB 호출하지 않고, 응답으로 실패 보고 → 트레이딩 워커가 갱신)

**보안:**
- 서버는 localhost(127.0.0.1)만 바인드
- API 키 인증 헤더(`X-RL-API-KEY`) 환경변수 검증
- 외부 인터넷 접근은 모델 다운로드 시점만 (HuggingFace/GitHub URL whitelist)

### 4.2 `trading-worker/` 확장

위치: `/Users/hhs/Project/dental-clinic-manager/trading-worker/`

**신규 모듈:**

```
trading-worker/src/
├── dailyRebalanceJob.ts       # 신규 — 일봉 마감 후 RL 추론
├── rlInferenceClient.ts       # 신규 — fetch /predict, 타임아웃 5s, 재시도 0회
└── (기존 모듈 그대로)
```

**`dailyRebalanceJob.ts` 흐름:**

```ts
// node-cron: '0 7 * * 2-6' KST (월~금 ET 마감 다음날 새벽). DST는 검토 후 결정.
async function runDailyRebalance() {
  const date = todayInET();
  const strategies = await fetchActiveRLStrategies();   // strategy_type LIKE 'rl_%'
  for (const s of strategies) {
    try {
      const skipped = await checkIdempotency(s.id, date);
      if (skipped) continue;
      const killSwitch = await checkKillSwitch(s.user_id);
      if (killSwitch) {
        await logInference(s, date, {decision: 'blocked_kill_switch'});
        continue;
      }
      const state = await buildState(s);                // OHLCV + 지표
      const result = await rlInferenceClient.predict(s, state);
      if (result.confidence < s.model.min_confidence) {
        await logInference(s, date, {decision: 'blocked_low_confidence', output: result});
        await notifyTelegram(s.user_id, `[RL] ${s.name}: 신뢰도 ${result.confidence} 낮아 hold`);
        continue;
      }
      const orders = computeOrders(s, result);          // portfolio diff or buy/sell
      if (s.automation_level === 1) {
        await notifyTelegram(s.user_id, formatSignalAlert(s, result, orders));
        await logInference(s, date, {decision: 'order', output: result, orders});
      } else {
        for (const o of orders) await executeAutoOrder(o);   // 기존 함수 재사용
        await logInference(s, date, {decision: 'order', output: result, orders});
      }
    } catch (err) {
      await logInference(s, date, {decision: 'error', error_message: err.message});
      await notifyTelegram(s.user_id, `[RL] ${s.name} 추론 실패: ${err.message}`);
    }
  }
}
```

**state 구성:**
- 모델의 `input_features` + `state_window` 따라 다름
- portfolio: universe 모든 종목의 OHLCV `state_window` 봉 + 모델이 요구한 지표
- 지표 계산은 메인 앱의 `indicatorEngine.ts`와 동일한 결과를 내야 함 (서버 사이드 검증 — Python에서 동일 산출 가능한지 어댑터에서 보장하거나, trading-worker가 계산 후 보냄)

**Phase 1 결정**: trading-worker가 OHLCV + 기존 indicator 계산 결과를 보내고, rl-inference-server는 받은 그대로 모델에 입력. 지표 산출 정합성을 서버에서 다시 검증하지 않음. (피처 누락은 응답 schema 검증에서 거부)

**universe / input_features / state_window 정의:**
- 자동 추출하지 않음. **모델 등록 시 사용자가 명시적으로 입력** (사전학습 모델 README/공식 문서 참조)
- 검증: rl-inference-server `/models/download` 시 ckpt 로드 후 dummy state로 forward pass 1회 → 입출력 형상이 사용자 입력과 일치하는지 확인. 불일치 시 `status='failed'`

### 4.3 메인 앱 (Next.js)

**신규 페이지:**

| 경로 | 역할 |
|---|---|
| `/investment/rl-models` | 사전학습 모델 라이브러리 (목록/추가/다운로드/메트릭/활성화) |
| `/investment/rl-models/[id]` | 모델 상세 (학습 정보, 추론 로그, 백테스트) |
| `/investment/strategy/new?type=rl_portfolio` | RL 전략 생성 폼 |

**기존 페이지 변경:**
- `/investment/strategy`: 카드/리스트에 strategy_type 배지 표시 (Rule / RL Portfolio / RL Single)
- `/investment/strategy/[id]/monitor` (있으면): 추론 로그 섹션 추가

**신규 API 라우트:**

| 경로 | 역할 |
|---|---|
| `POST /api/investment/rl-models` | 모델 등록 (URL/sha256 받아서 rl-inference-server로 download 위임) |
| `GET /api/investment/rl-models` | 목록 |
| `DELETE /api/investment/rl-models/[id]` | archive (참조 전략 비활성화 후) |
| `POST /api/investment/rl-models/[id]/backtest` | rl-inference-server `/backtest` 위임 |
| `POST /api/investment/rl-pause` | kill switch 토글 |

**Phase 1 UI 디자인 컨벤션:**
- 기존 AT Tokens/디자인 시스템 그대로 (`bg-at-accent`, `rounded-xl`, ...)
- RL 자동매매 활성화 화면에는 빨간 경고 배너 + paper credential 권장 표시
- automation_level 변경은 confirmation modal (현재 잔여 잔고/일일 손실 한도 명시)

### 4.4 안전 가드 (강제)

| 가드 | 구현 위치 | 행동 |
|---|---|---|
| **default automation_level=1** | API `POST /api/investment/strategies` (RL 타입) | 명시 안 하면 1 강제 |
| **min_confidence** | dailyRebalanceJob | 임계 미달 → hold + 알림 |
| **kill switch** | dailyRebalanceJob → checkKillSwitch | `rl_paused_at IS NOT NULL`이면 skip |
| **daily_loss_limit** | 기존 `riskGuard.checkDailyLossLimit` | 기존 로직 그대로 |
| **idempotency** | `rl_inference_logs (strategy_id, trade_date)` UNIQUE | 두 번째 추론 시도는 차단 |
| **추론 타임아웃** | rlInferenceClient | 5s, 재시도 0회, 실패 시 hold |
| **paper 권장** | UI 배지 + 첫 활성화 confirmation | 사용자 인지 강제 |
| **emergency-stop 호환** | 기존 `/api/investment/emergency-stop` | RL 전략도 함께 비활성화 |

---

## 5. 일봉 재교형 흐름 상세

```
[ET 16:00 미장 마감 = KST 06:00]
        │
        │ +1h 안정화 (KIS 일봉 데이터 + 보조지표)
        ▼
[KST 07:00] dailyRebalanceJob.run()
        │
        ▼
   1. 활성 RL 전략 N개 조회 (is_active=true AND strategy_type LIKE 'rl_%')
        │
        ▼ for each strategy
   2. checkIdempotency(strategy_id, date)
        │ (rl_inference_logs UNIQUE)
        ▼
   3. checkKillSwitch(user_id)
        │ (rl_paused_at)
        ▼
   4. buildState(strategy) — universe OHLCV `state_window` + 지표
        │
        ▼
   5. rlInferenceClient.predict() ──────HTTP──────▶ rl-inference-server /predict
        │                                              │
        │                                              ▼
        │                                          ckpt 로드 + 추론 (~수백 ms)
        │                                              │
        │ ◀────────── {weights/action, confidence} ────┘
        ▼
   6. confidence < min_confidence?
        │ Yes → log(blocked_low_confidence) + Telegram 알림
        │ No  → 7
        ▼
   7. computeOrders(strategy, result)
        │ portfolio: 현재 포지션 vs 목표 weights → diff 주문 목록
        │ single: action(buy|sell) → 주문 1개
        ▼
   8. automation_level=1?
        │ Yes → Telegram 알림 + log(order, orders=[]?) — 사용자 수동 승인
        │ No  → for o in orders: executeAutoOrder(o) (기존 함수)
        ▼
   9. log(order, output, orders) + Telegram 요약 보고
```

**시간대 처리:**
- cron은 KST 기준이지만 trade_date는 ET 기준 ISO date. 실패 시 재시작 가능하도록 `trade_date`는 명시적으로 계산.
- DST: 미국 EDT/EST 전환 시 cron 시간 자동 조정 안 됨. Phase 1은 KST 07:00 고정 → 늦어도 1시간 마진.

---

## 6. 테스트 전략

### 6.1 rl-inference-server (Python)
- 단위(`pytest`):
  - `model_registry`: 다운로드 mock(httpx_mock) + 캐시 LRU
  - `adapters/sb3`: 실제 가벼운 PPO ckpt 로드 후 입력 → 출력 형상 검증
  - `inference/portfolio`: 가짜 ckpt + 더미 OHLCV → 합 ≈ 1
- integration: FastAPI TestClient + 실제 PPO Dow 30 ckpt 1개로 `/predict` 호출
- 회귀: 동일 state → 동일 weights (deterministic 모드)

### 6.2 trading-worker (TypeScript)
- 단위(`vitest`):
  - `dailyRebalanceJob`: fetch + supabase 모두 mock, 시나리오별 분기 (kill switch on, 신뢰도 미달, 정상, 추론 실패, idempotency 적용)
  - `rlInferenceClient`: 타임아웃, 5xx, 응답 스키마 검증

### 6.3 메인 앱 (Next.js)
- API 단위: rl-models CRUD, 권한, RLS 가정
- UI: 새 페이지 렌더링 smoke test (Vitest + RTL)

### 6.4 E2E (수동 시나리오)
1. 사전학습 PPO Dow 30 ckpt 다운로드 → status=ready
2. 전략 생성(automation_level=1, paper credential 연결)
3. cron 트리거 강제 호출 → Telegram 알림 수신
4. automation_level=2로 변경 → confirmation 모달 통과
5. 다음 cron 시각에 paper 계좌로 자동 주문 발생
6. kill switch ON → 다음 cron skip
7. emergency-stop → 모든 RL 전략 비활성

---

## 7. 모니터링 & 알림

| 신호 | 채널 | 트리거 |
|---|---|---|
| 일일 추론 시작/종료 요약 | Telegram | dailyRebalanceJob 끝 |
| 추론 실패 (5xx, timeout) | Telegram + `investment_audit_logs` | rlInferenceClient catch |
| 신뢰도 임계 미달 | Telegram (low priority) | dailyRebalanceJob |
| 자동 주문 체결/실패 | Telegram (기존) | 기존 orderExecutor |
| 모델 다운로드 실패 | UI + Telegram | model_registry |

---

## 8. Phase 1 범위

### 포함 (IN)
- DB 마이그레이션: `rl_models`, `rl_inference_logs`, `investment_strategies` 확장, `user_investment_settings.rl_paused_at`
- `rl-inference-server` 골격 (Python FastAPI + PyTorch + sb3) + 어댑터 2개(sb3, finrl 환경 1개)
- FinRL PPO Dow 30 ckpt 1개 등록 시나리오 (실증)
- `trading-worker`: `dailyRebalanceJob` + `rlInferenceClient`
- 메인 앱: `/investment/rl-models` + 전략 생성에 `rl_portfolio` 옵션
- 모든 안전 가드 (default level=1, kill switch, min_confidence, idempotency, 타임아웃)
- 테스트 (단위/integration)
- 운영 가이드 문서 (모델 등록 절차, kill switch 사용법, 트러블슈팅)

### 제외 (OUT — Phase 2 이후)
- 단일 종목 RL 자동매매 (등록은 가능, 실행 분기는 todo로 표시)
- 분봉/실시간 RL
- 자체 학습 파이프라인 (학습용 환경, 데이터 수집 자동화, 실험 추적)
- 코인 거래소 어댑터 (업비트/바이낸스)
- 한국 주식 RL
- ONNX export / Node.js 직접 추론 최적화
- 멀티 GPU / 분산 추론

---

## 9. 핵심 파일 경로 (참조)

**기존 (수정 대상):**
- [trading-worker/src/index.ts](trading-worker/src/index.ts) — dailyRebalanceJob 등록
- [trading-worker/src/orderExecutor.ts](trading-worker/src/orderExecutor.ts) — 재사용
- [trading-worker/src/riskGuard.ts](trading-worker/src/riskGuard.ts) — 재사용
- [trading-worker/src/telegramNotifier.ts](trading-worker/src/telegramNotifier.ts) — 재사용
- [src/app/api/investment/strategies/route.ts](dental-clinic-manager/src/app/api/investment/strategies/route.ts) — strategy_type 분기 추가
- [src/app/investment/strategy/page.tsx](dental-clinic-manager/src/app/investment/strategy/page.tsx) — 배지 추가
- [src/types/investment.ts](dental-clinic-manager/src/types/investment.ts) — 타입 확장

**신규:**
- `rl-inference-server/` (전체)
- [trading-worker/src/dailyRebalanceJob.ts](trading-worker/src/dailyRebalanceJob.ts)
- [trading-worker/src/rlInferenceClient.ts](trading-worker/src/rlInferenceClient.ts)
- `supabase/migrations/<YYYYMMDD>_rl_trading.sql` (구현 시점 날짜로 명명)
- [src/app/investment/rl-models/page.tsx](dental-clinic-manager/src/app/investment/rl-models/page.tsx) (외 다수)
- [src/app/api/investment/rl-models/route.ts](dental-clinic-manager/src/app/api/investment/rl-models/route.ts) (외 다수)

---

## 10. 검증 (구현 완료 후 어떻게 동작 확인하는가)

1. **DB 마이그레이션 적용**: `mcp__supabase__apply_migration`으로 적용. 모든 신규 테이블/제약/RLS 검증.
2. **rl-inference-server 기동**: `pm2 start` → `/health` 200 응답.
3. **모델 등록 시나리오**:
   - UI에서 PPO Dow 30 ckpt URL 입력 → status가 downloading→ready로 전이
   - rl_models row, checkpoint_path 채워짐
4. **전략 생성 시나리오**:
   - `/investment/strategy/new?type=rl_portfolio` → 모델 선택 → automation_level=1로 저장 (default)
   - investment_strategies row 생성, strategy_type='rl_portfolio', rl_model_id 채워짐
5. **dailyRebalanceJob 강제 실행** (수동 트리거):
   - 활성 RL 전략 1개 → /predict 호출 → rl_inference_logs INSERT → Telegram 알림 수신
   - 같은 trade_date로 재실행 → idempotency로 skip
6. **kill switch**:
   - UI에서 RL 일시정지 ON → 다음 실행에서 `blocked_kill_switch` 로그
7. **automation_level=2로 변경 후 paper credential**:
   - confirmation 모달 통과
   - 다음 실행에서 KIS 모의투자 계좌에 자동 주문 (executeAutoOrder)
   - trade_orders row + Telegram 체결 알림
8. **emergency-stop**:
   - 모든 RL 전략 is_active=false 전환

---

## 11. 의존성 / 운영 노트

- **Python 환경**: `pyproject.toml` 또는 `requirements.txt` + `python -m venv`. PyTorch CPU 빌드 권장 (Mac mini M4 기준 일봉 추론은 충분)
- **PM2 ecosystem**: trading-worker와 rl-inference-server가 동시 기동/재시작
- **로그**: 두 워커 모두 pino 또는 structlog → 동일 로그 디렉터리
- **모델 저장소**: 로컬 `MODEL_DIR=/Users/hhs/.../models/`. 디스크 사용량 모니터링 (디폴트 모델 수십 MB ~ 수백 MB)
- **백업**: 모델 ckpt는 url + sha256 기록되어 있으므로 재다운로드 가능. DB 백업이 일차 진실원

---

## 12. 위험 요인과 대응

| 위험 | 대응 |
|---|---|
| 사전학습 모델의 분포 변화로 부적절한 신호 | min_confidence + kill switch + paper credential 권장 |
| 추론 서버 다운 시 자동매매 정지 | 5s 타임아웃 + hold 처리, Telegram 즉시 알림 |
| 사용자가 무모하게 level=2로 변경 | confirmation 모달 + paper 권장 배지 + daily_loss_limit 강제 |
| 동시성: 같은 전략에 cron 중첩 실행 | rl_inference_logs UNIQUE + cron 락 (PM2 + flock 단일 인스턴스) |
| FinRL ckpt 형식 비호환 | 어댑터 단위 테스트 + 실패 시 status='failed' + UI에 명확한 에러 |
| 모델 산출 weight 합이 1 아님 | rl-inference-server에서 normalize + warning 로그 |
| 신뢰도 산출 어댑터 부재 (continuous policy) | 어댑터별 명시적 `compute_confidence` 함수, 가짜 1.0 금지 |
