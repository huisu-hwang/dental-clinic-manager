# 자동매매 개인 구독 전환 + 군중심리 분석 기능 설계

작성일: 2026-05-07

## 1. 개요

이 문서는 두 가지 변경을 한 번에 다룬다. 두 변경은 결합도가 높아 함께 출시되어야 한다.

- **A. 자동매매 모듈 구독 모델을 clinic 단위 → 개인(user) 단위로 전환** (인프라 변경)
- **B. 군중심리 분석 신기능 추가** — 자동매매의 서브메뉴, 자동매매 구독자에게 무료로 포함
- **C. master 페이지의 자동매매 구독료 변경 UI** (A의 일부)

## 2. 동기

- **B의 출발점:** 사용자가 호가창과 분봉을 보며 느끼는 군중심리(공포·탐욕·FOMO·익절 압력 등)를 LLM이 분석해 점수·태그·서술·차트 마커로 제공. 단독 도구로 보조하면서 추후 자동매매 시그널로 발전 가능.
- **A의 출발점:** 자동매매는 본질적으로 개인의 자산 운용이라 clinic 단위 구독이 부자연스럽다. 같은 병원의 여러 직원이 각자 KIS 계좌를 연결해 운용하는 경우가 정상이며, 각자 결제해야 한다.
- **B의 게이팅을 새로 만들지 않는 이유:** 개인 구독 게이팅을 A에서 마련하므로 B는 그 헬퍼 한 줄로 게이팅된다. 별도 권한 시스템(`psychology_view`) 추가 없음.

## 3. 결정 요약 (브레인스토밍 기록)

| 질문 | 결정 |
|---|---|
| 1차 목적 | 분석/표시 + 자동매매 시그널 후크 (Phase 2) |
| 입력 데이터 | 분봉 OHLCV(60개) + 호가창 10단계(KR만) |
| 호출 빈도 | 온디맨드 + 이벤트 트리거 |
| 시장 | 한국 + 미국 (호가창은 한국만) |
| 출력 형태 | 점수(0~100) + 태그 + 서술 + 분봉 차트 위 마커 |
| 모니터링 종목 | 군중심리 전용 워치리스트(상한 10개) |
| 트리거 인프라 | Vercel Cron 1분 주기 (smart-money 패턴) |
| 구독 모델 | 월 정액 + 수익 5% 하이브리드 |
| 기존 clinic 사용자 | 자동 이관 |
| 동일 병원 다중 직원 | 각자 개인 구독 |
| 무료 체험 | 없음 (즉시 결제) |

## 4. 작업 영역 분해

| 영역 | 내용 | Plan |
|---|---|---|
| A | 자동매매 구독 인프라 전환 (테이블·게이팅·결제·청구·마이그레이션) | Plan 1 |
| C | master 가격 관리 UI | Plan 1 (A에 포함) |
| B | 군중심리 분석 신기능 | Plan 2 |

A → B 의존: B는 A의 `requireActiveInvestmentSubscription` 헬퍼를 재사용한다. A 완료 후 B 시작.

## 5. 데이터 모델

### 5.1 개인 구독 (A)

```sql
CREATE TABLE user_subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id TEXT UNIQUE NOT NULL,             -- 'investment' (1차 유일 플랜)
  display_name TEXT NOT NULL,                   -- '주식 자동매매'
  monthly_base_price INT NOT NULL,              -- 월 정액 (원). master에서 변경
  revenue_share_pct NUMERIC NOT NULL DEFAULT 0, -- 수익 공유 % (예: 5.0)
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES user_subscription_plans(id),
  status TEXT NOT NULL CHECK (status IN ('active','past_due','cancelled','suspended','expired')),
  billing_key TEXT,
  card_name TEXT,
  card_number_last4 TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  next_billing_date TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  -- 마이그레이션 흔적
  migrated_from_clinic_id UUID NULL,
  migrated_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, plan_id)
);

CREATE TABLE user_subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES user_subscriptions(id),
  portone_payment_id TEXT NOT NULL,
  portone_tx_id TEXT,
  amount INT NOT NULL,
  base_amount INT NOT NULL,                     -- 월 정액 부분
  revenue_share_amount INT NOT NULL DEFAULT 0,  -- 수익 공유 부분
  realized_profit_basis INT NOT NULL DEFAULT 0, -- 청구 기준 실현 수익
  status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','cancelled','refunded')),
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  fail_reason TEXT,
  billing_period_start DATE,
  billing_period_end DATE,
  order_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_subs_user_status ON user_subscriptions (user_id, status);
CREATE INDEX idx_user_sub_payments_user_time ON user_subscription_payments (user_id, created_at DESC);
```

RLS: `user_subscriptions`, `user_subscription_payments`는 `user_id = auth.uid()`로 본인만 SELECT. INSERT/UPDATE/DELETE는 service role(API 라우트)만. `user_subscription_plans`는 SELECT 모두 허용, UPDATE는 master_admin만.

### 5.2 군중심리 (B)

```sql
CREATE TABLE psychology_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('KR','US')),
  monitoring_enabled BOOLEAN NOT NULL DEFAULT true,
  trigger_price_change_pct NUMERIC NULL,
  trigger_volume_multiplier NUMERIC NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, ticker, market)
);

CREATE TABLE psychology_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_price_change_pct NUMERIC NOT NULL DEFAULT 2.0,
  default_volume_multiplier NUMERIC NOT NULL DEFAULT 3.0,
  push_notify_enabled BOOLEAN NOT NULL DEFAULT true,
  cooldown_minutes INT NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE psychology_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('KR','US')),
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('manual','price_change','volume_spike')),
  psychology_score INT NOT NULL CHECK (psychology_score BETWEEN 0 AND 100),
  score_label TEXT NOT NULL,
  tags TEXT[] NOT NULL,
  narrative TEXT NOT NULL,
  markers JSONB NOT NULL,
  orderbook_pressure JSONB NULL,
  input_snapshot JSONB NOT NULL,
  llm_model TEXT NOT NULL,
  llm_latency_ms INT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_psy_analyses_user_ticker_time
  ON psychology_analyses (user_id, ticker, created_at DESC);
```

RLS: 세 테이블 모두 `user_id = auth.uid()` 정책.

## 6. A — 자동매매 구독 인프라 전환

### 6.1 게이팅 헬퍼 (단일 진실 원천)

```ts
// src/lib/userSubscription.ts
export type GateResult =
  | { ok: true; subscription: UserSubscription }
  | { ok: false; reason: 'NO_SUBSCRIPTION' | 'PAST_DUE' | 'EXPIRED' | 'CANCELLED' }

// 결과를 그대로 반환. 호출 측이 분기 처리.
export async function checkInvestmentSubscription(userId: string): Promise<GateResult>

// API 라우트 전용. ok=false면 NextResponse(401 또는 402)를 throw해서 라우트 핸들러를 즉시 종료.
// 사용 예: const sub = await requireInvestmentSubscription(userId)  // 통과 시 subscription 반환
export async function requireInvestmentSubscription(userId: string): Promise<UserSubscription>
```

자동매매 모듈의 모든 페이지/API는 이 한 함수로 게이팅. 권한 시스템(`investment_view`)에서는 분리한다.

### 6.2 결제 흐름

기존 PortOne 빌링키 인프라(`src/lib/portone.ts`, `src/lib/subscriptionService.ts`)의 패턴을 그대로 따른다. clinic 변형이 아닌 user 변형이라는 점만 다르다.

**신규 라우트:**
```
/api/investment/subscription/
├── status/route.ts      GET   → 내 구독 상태 + 플랜 정보 + 다음 청구 예정액
├── register/route.ts    POST  → 빌링키 받아 첫 결제 + 다음 달 예약
├── cancel/route.ts      POST  → 기간 만료 후 취소(기본) / 즉시 취소(옵션)
└── webhook/route.ts     POST  → PortOne 결제 결과 webhook
```

**서비스 모듈:** `src/lib/userSubscriptionService.ts` — 기존 `subscriptionService.ts`와 동등한 시그니처를 user_id 기반으로 제공.

### 6.3 월말 청구 cron

기존 `src/app/api/investment/profit-snapshot/route.ts`를 재작성:

```
1. user_subscriptions.status='active' 전체 조회 (RLS 우회: service role)
2. 각 사용자별:
   - calculateMonthlyProfitForUser(user_id, year, month) — clinic 버전과 동일 로직, user 단위 집계
   - charge_amount = monthly_base_price + max(0, realized_profit) * revenue_share_pct/100
   - PortOne chargeBillingKey 호출
   - user_subscription_payments INSERT (base_amount, revenue_share_amount, realized_profit_basis 분해 저장)
   - investment_profit_snapshots는 user_id 기준으로도 저장 (병원 단위 통계용으로 clinic_id 컬럼은 nullable로 유지)
3. 결제 실패:
   - retry_count++
   - status='past_due', next_retry_at = +N시간
   - 3회 실패 시 status='suspended' (자동매매 게이팅 차단)
```

수익이 음수인 달은 정액만 청구, 수익 공유 0원. 정확한 양수 절단 기준은 일자별 실현수익 합계 기준.

기존 `clinic_id` 기반 cron 코드는 마이그레이션 완료 후 제거.

### 6.4 사이드바 메뉴 변경

`src/config/menuConfig.ts`:
- 자동매매 항목의 `permissions: ['investment_view']` 제거 (모든 사용자에게 노출)
- 메뉴 클릭 시 게이팅 헬퍼가 미구독자를 `/investment/subscribe`로 안내
- "심리 분석"은 자동매매의 자식 메뉴로 추가 (사이드바에 들여쓰기)

`src/types/permissions.ts`의 `investment_view`/`investment_manage`는 **즉시 제거하지 않고** 1주기 후 정리 (다른 곳에서 잔존 참조가 있을 수 있어 안전 마진).

### 6.5 기존 clinic 구독 자동 이관 (1회성 스크립트)

`scripts/migrate-investment-subscriptions-to-user.ts`:

```
1. SELECT s.* FROM subscriptions s
   JOIN subscription_plans p ON p.id = s.plan_id
   WHERE p.feature_id = 'investment' AND s.status IN ('active','past_due','trialing')

2. 각 clinic 구독에 대해:
   a) 활동 사용자 추출:
      - SELECT DISTINCT user_id FROM investment_strategies WHERE clinic_id = ?
      - UNION SELECT DISTINCT user_id FROM user_broker_credentials
        WHERE user_id IN (SELECT id FROM users WHERE clinic_id = ?)
      - 둘 다 비어 있으면 clinic의 owner를 후보로
   b) 후보 사용자 각각에 대해 user_subscriptions 생성:
      - **첫 후보 선정 기준:** 활동 사용자 중 users.created_at이 가장 오래된 1명 (clinic의 owner가 보통 여기 해당). 활동 흔적이 비면 clinic의 owner.
      - 첫 후보: 기존 billing_key 승계 + current_period_end 승계
      - 추가 후보: billing_key=NULL, status='active', current_period_end는 기존 clinic 구독과 동일
        (이번 주기 무료 grandfather, 다음 주기 결제 전 결제 수단 등록 안내)
      - migrated_from_clinic_id, migrated_at 기록
   c) 기존 clinic 구독: status='cancelled', cancelled_at=now()
3. 마이그레이션 보고서 (이관 N건 / 활동 사용자 없음 N건 / 다중 사용자 N건)
4. 알림 발송: 이관된 모든 사용자에게 in-app 알림 + (가능하면) 이메일
```

PortOne 빌링키는 카드 1장당 1키. 같은 clinic의 추가 후보는 본인 카드를 새로 등록해야 한다는 점을 알림에 명시.

마이그레이션 실행 전 dry-run 모드 필수. `--dry-run` 플래그로 보고서만 출력 후, 검토 완료 시 `--apply`로 실제 실행.

## 7. C — master 가격 관리 UI

### 7.1 경로 및 권한

- 경로: `/master/subscription/investment`
- 권한: master_admin (기존 master 페이지 권한 시스템 재사용)

### 7.2 기능

`user_subscription_plans` 1행(feature_id='investment')의 단일 폼:

- 월 정액 가격 (원, 정수)
- 수익 공유 % (소수 2자리, 0~50)
- 플랜 활성 토글
- 변경 시 UPDATE → 다음 청구 주기부터 반영. 진행 중인 결제 영향 없음.

API: `PUT /api/master/user-subscription-plans/[id]`. master 권한 검증 필수.

### 7.3 UI 컴포넌트

`src/app/master/subscription/investment/page.tsx`. master 페이지 기존 디자인 시스템(shadcn/ui Card, Input, Button) 사용.

## 8. B — 군중심리 분석 기능

### 8.1 메뉴 / 사이드바

- 사이드바 라벨: "심리 분석", 아이콘: `Users` (lucide-react)
- 위치: 자동매매 바로 아래에 시각적 indent로 표시. `menuConfig.ts`의 자식 메뉴 구조를 지원하면 그대로, 미지원이면 평면 배열에 자동매매 다음 항목으로 두되 라벨에 indent 처리.
- 경로: `/investment/psychology`
- 게이팅: `requireInvestmentSubscription` (A의 헬퍼)

### 8.2 페이지 레이아웃 (반응형 2-column)

좌측: 워치리스트(상한 10개), 각 항목에 모니터링 토글 + 임계값 설정 버튼.
우측 상단: 선택 종목 정보, "지금 분석하기" 버튼, 마지막 분석 시각.
우측 본문 (분석 결과):
- 공포·탐욕 게이지(0~100, 색상은 빨강→회색→파랑 그라데이션)
- 핵심 심리 태그 칩 2~3개
- 서술(2~3 문단 한국어)
- 분봉 차트(recharts LineChart, 60개 1분봉, ReferenceDot으로 마커)
- 호가창 압력 바(KR만, 매수/매도 비율)
- 최근 분석 이력 목록 (최근 10건)

모바일: 좌측 워치리스트가 상단 가로 스크롤 칩으로 변환.

### 8.3 API 라우트

```
/api/investment/psychology/
├── watchlist/route.ts          GET, POST, DELETE
├── watchlist/[id]/route.ts     PATCH (monitoring_enabled, 종목별 임계값)
├── settings/route.ts           GET, PUT
├── analyze/route.ts            POST  (온디맨드 분석)
├── analyses/route.ts           GET   (이력 조회)
└── cron/scan/route.ts          GET   (Vercel Cron 1분 주기)
```

모든 라우트 진입 시 `requireInvestmentSubscription` 통과 필수.

### 8.4 LLM 호출

- 모델: `claude-haiku-4-5-20251001`
- max_tokens: 800, temperature: 0.3
- 응답은 Anthropic tool use로 JSON 스키마 강제 (zod 사후 validation)

**시스템 프롬프트:**
> 당신은 주식 시장 군중심리 분석 전문가입니다. 주어진 분봉 시계열과 호가 스냅샷을 보고, 호가창과 차트를 수시로 보고 있는 일반 투자자(대중)가 지금 이 순간 느낄 심리를 분석합니다. 출력은 반드시 지정된 JSON 스키마를 따르며, 한국어로 작성합니다. 추측이 아닌 데이터에서 직접 관찰 가능한 패턴 위주로 분석하고, 단정적 매매 권유 표현은 사용하지 않습니다.

**유저 프롬프트 입력:**
- 종목명/티커/시장
- 최근 60개 1분봉 `[{ts, open, high, low, close, volume}, ...]`
- 호가 스냅샷(KR만) `{ bids: [{price, qty}×10], asks: [{price, qty}×10], totalBidQty, totalAskQty }`
- 분석 요청 사유: `manual` / `price_change(±X%)` / `volume_spike(×N)`

**응답 스키마:**

```json
{
  "psychology_score": 0~100,
  "score_label": "극공포 | 공포 | 중립 | 탐욕 | 극탐욕",
  "tags": ["FOMO 매수", "익절 압력", "..."],
  "narrative": "2~3 문단 한국어 서술",
  "markers": [
    {
      "ts": "10:18",
      "kind": "panic_sell | fomo_entry | accumulation | distribution | capitulation | indecision",
      "label": "FOMO 진입",
      "candle_index": 38
    }
  ],
  "orderbook_pressure": {
    "bid_pct": 0~100,
    "ask_pct": 0~100,
    "interpretation": "한 줄 해석"
  } | null
}
```

**`tags` enum (8종, 다중 선택):** `패닉 셀링`, `FOMO 매수`, `익절 압력`, `누적 매집`, `분산 매도`, `관망`, `반등 시도`, `투매`

**`markers` 제약:** 최대 5개. `candle_index`는 입력 분봉 배열의 인덱스(0-based)와 일치해야 한다.

**검증:** API 라우트에서 응답 받자마자 zod로 validate. 실패 시 1회 재호출, 그래도 실패면 500 + DB 미저장.

### 8.5 이벤트 트리거 (Cron)

`/api/investment/psychology/cron/scan/route.ts`, Vercel Cron `* * * * *`:

```
1. 시장 시간 체크 (KR 09:00~15:30 KST / US 09:30~16:00 ET). 둘 다 외 시간이면 즉시 return.
2. monitoring_enabled=true 워치리스트 전체 조회. 활성 자동매매 구독자만 (JOIN user_subscriptions).
3. 시장별 종목 그룹핑. 종목별 시세는 (ticker, market) 글로벌 캐시 (TTL 30초)로 중복 제거.
4. 각 종목 직전 1분봉 + 5분 평균 거래량 조회.
   - KR: kisApiService.getKRMinuteCandles(count=6)
   - US: yahoo-finance2 1m candles, range=10m
5. 트리거 판정:
   - price_change: |close-open|/open >= 사용자 임계값(기본 2%)
   - volume_spike: 직전 1분 거래량 >= 5분 평균 × 사용자 임계값(기본 3배)
6. 쿨다운 체크: 같은 (user_id, ticker)에서 최근 N분(기본 10분) 내 분석이 있으면 skip.
7. 트리거 발동: analyze 라우트와 동일 로직 → DB 저장 + 푸시 알림 발송.
8. 글로벌 LLM 분당 호출 상한(예: 30건) 초과 시 가장 큰 변동 우선순위로 잘라내고 잔여는 다음 슬롯.
```

환경변수 `PSYCHOLOGY_CRON_ENABLED=false`로 즉시 차단 가능.

### 8.6 자동매매 시그널 후크 (Phase 2 준비만)

1차에서는 **노출만 하고 실제 매매 연결은 하지 않는다.** 후크 마련:

- `psychology_analyses (user_id, ticker, market, created_at DESC)` 인덱스로 자동매매 워커가 최신 분석을 빠르게 조회 가능 (5.2의 인덱스에 이미 포함).
- `psychology_score`가 0~100 정수로 잠긴 스키마 → 워커 쿼리 시 정수 비교만 하면 됨.
- TTL: 자동매매가 분석 결과를 사용할 때 "최근 N분 내 분석만 유효". N은 Phase 2 시점에 결정.

Phase 2에서 추가 예정 (1차 미포함):
```sql
-- Phase 2에서만 적용
ALTER TABLE investment_strategies ADD COLUMN psychology_filter JSONB NULL;
-- 예: { "enabled": true, "score_max": 30, "score_min": null }
```

## 9. 구현 순서 (의존성)

### Plan 1 — 인프라 전환 (A + C)

1. 마이그레이션: 5.1의 3개 테이블 신설 + RLS
2. `userSubscriptionService` 모듈 작성 (PortOne 재사용)
3. 게이팅 헬퍼 `userSubscription.ts` 작성
4. 결제 라우트 4개(`status`/`register`/`cancel`/`webhook`)
5. master 가격 관리 UI(`/master/subscription/investment`) + 라우트
6. profit-snapshot cron을 user 기반으로 재작성
7. 자동 이관 스크립트(dry-run + apply 모드) — 검토 후 실제 실행
8. 자동매매 페이지/API 게이팅을 새 헬퍼로 일괄 교체
9. 사이드바 메뉴에서 `investment_view` 제거, "심리 분석" 자식 항목 자리 잡기 (B 진입 시 활성)
10. 기존 clinic 구독 cron 코드 제거

### Plan 2 — 군중심리 분석 (B)

11. 마이그레이션: 5.2의 3개 테이블 + RLS
12. 워치리스트/설정 라우트
13. 온디맨드 analyze 라우트 (LLM 호출 + 스키마 검증)
14. 이력 조회 라우트
15. Cron 스캔 라우트 + vercel.json 등록
16. UI 페이지 `/investment/psychology` (좌측 리스트, 우측 분석, 차트, 호가 압력 바)
17. 푸시 알림 연동
18. 사이드바 자식 메뉴 활성화

## 10. 시장 시간·비용 가드

### 10.1 비용

- 온디맨드 분석: 사용자당 분당 5회 상한 (메모리 기반 카운터, 멀티 인스턴스에서는 정확하지 않지만 1차 보호 목적)
- Cron 트리거: 종목별 쿨다운(기본 10분)
- LLM 응답 max_tokens=800
- Cron에서 글로벌 분당 LLM 호출 상한(예: 30건)

### 10.2 시장 시간

- KR 정규장: 09:00~15:30 KST (실제 휴장일 캘린더 미반영, 1차 단순화)
- US 정규장: 09:30~16:00 ET (서머타임 처리 `Intl.DateTimeFormat` 사용)
- 외 시간 Cron은 즉시 return

## 11. 검증 / 테스트

### 11.1 빌드/타입

- `npm run build` 통과
- `npm run check:permissions`는 자동매매 메뉴의 권한 제거 후에도 통과해야 함

### 11.2 Plan 1 (인프라) 테스트

테스트 계정: `whitedc0902@gmail.com` (일반), `sani81@gmail.com` (master).

1. 미구독자가 `/investment/dashboard` 접근 → `/investment/subscribe`로 안내
2. PortOne 테스트 카드로 구독 등록 → user_subscriptions.status='active' 확인
3. status 라우트 응답 확인 (다음 청구 예정액에 정액+예상 수익 5% 분해 표시)
4. master 계정으로 `/master/subscription/investment` → 가격 변경 → user_subscription_plans UPDATE 확인
5. 마이그레이션 스크립트 dry-run → 보고서 확인
6. 마이그레이션 스크립트 apply → 기존 clinic 구독자가 user_subscriptions로 이동, billing_key 승계 확인
7. profit-snapshot cron 강제 실행 (월말 시뮬) → 수익 양수/음수 모두 청구 정확성 확인
8. 결제 실패 시 status='past_due', 3회 실패 시 'suspended' 전이 확인 (PortOne webhook 시뮬)

### 11.3 Plan 2 (심리 분석) 테스트

1. 구독자 계정으로 워치리스트 CRUD (KR/US 1개씩, 10개 상한 검증, 모니터링 토글)
2. 미구독자 계정으로 `/investment/psychology` 접근 → 차단 확인
3. "지금 분석하기" → 점수·태그·서술·차트 마커·호가 압력(KR만) 표시
4. 분봉 차트의 ReferenceDot이 markers[i].candle_index와 정확히 일치
5. zod validation 실패 시뮬 → 1회 재시도 후 500 (분석 미저장)
6. Cron 강제 트리거 (`PSYCHOLOGY_CRON_ENABLED=true`, 임계값 0.1%/×1.1로 강제 발동) → DB 저장 + 푸시 도달
7. 같은 종목 즉시 재트리거 → 쿨다운으로 skip
8. 장외 시간 Cron 실행 → 즉시 return 로그
9. US 종목 분석 시 호가창 섹션 자동 숨김
10. 모바일 뷰포트에서 워치리스트 가로 칩 + 본문 레이아웃 정상

### 11.4 회귀 가드

- 기존 clinic 구독 결제(`subscription_plans.feature_id !== 'investment'`)는 영향 없어야 함
- 자동매매 외 다른 메뉴(인사관리·스케줄·재무 등) 권한 동작 영향 없음

## 12. 배포 / 출시 절차

1. Plan 1 develop 푸시 → PR → main 머지 → production 배포
2. master 계정으로 가격 시드 값 입력 (월 정액 / 수익 % — 사용자가 추후 결정)
3. 마이그레이션 스크립트 dry-run → 검토 → apply
4. 이관된 사용자에게 알림 발송 확인
5. Plan 2 develop 푸시 → PR → main 머지 → production 배포
6. 사이드바에서 "심리 분석" 자식 메뉴 노출 확인

## 13. 미해결/추후 결정

- **월 정액 시드 값**: master에서 변경 가능하므로 코드에는 placeholder(예: 9,900원)로 두고 실제 운영 값은 master에서 설정.
- **수익 공유 % 시드 값**: 5%로 시드.
- **결제 통화**: KRW 단일.
- **세금계산서**: 기존 clinic 구독 시스템에 `tax_invoice_num` 필드가 있으나 개인 구독 1차에서는 발행하지 않음.
- **Phase 2(자동매매 시그널 통합)**: 별도 spec/plan으로 추후 다룸.
- **psychology_analyses retention**: input_snapshot에 60개 분봉 + 호가가 들어가 행 크기가 큼. 1차에선 무한 보존, 누적 후 90일 retention 정책 도입 검토.

## 14. 참고 / 재사용 자산

- `src/lib/portone.ts` — 빌링키 결제·예약·취소 (그대로 재사용)
- `src/lib/subscriptionService.ts` — clinic 버전. user 버전 작성 시 시그니처 참고
- `src/app/api/investment/smart-money/` — LLM 호출 + JSON 스키마 강제 패턴 참고
- `src/lib/kisApiService.ts` — KR 분봉/호가 호출
- `src/lib/stockDataService.ts` — US 분봉 (yahoo-finance2)
- 푸시 알림 시스템 (기존 in-app 알림 + 모바일 푸시)
