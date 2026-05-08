# 토스페이먼츠 직결 결제 시스템 설계

**작성일:** 2026-05-08
**상태:** 설계 확정 (구현 대기)
**목표:** 포트원(PortOne) 경유 토스페이먼츠 결제를 토스페이먼츠 직결 빌링키 기반 정기결제로 전면 교체

---

## 0. 배경 · 의사결정 요약

### 배경
- 현재 결제 시스템은 포트원 v2 API를 통해 토스페이먼츠를 하위 PG로 사용 중.
- 클리닉 구독(`subscriptions`)과 투자 구독(`user_subscriptions`)이 각각 포트원 의존.
- 운영 데이터가 없는(개발/테스트 단계) 상태이므로, 호환 어댑터 없이 직결로 전면 교체 가능.

### 결정 사항 (브레인스토밍 합의)
1. **포트원 의존 100% 제거**, 토스페이먼츠 직결로 재작성 (접근 3 — 토스 표준 흐름 그대로)
2. **클리닉 구독 + 투자 구독 동시 마이그레이션**
3. **DB 컬럼 명명**: 토스 친화적 (`toss_payment_key`, `toss_order_id` 등)
4. **`customer_key`**: 클리닉당 1회 무작위 UUID 발급 후 영구 저장 (토스 보안 권고 준수)
5. **모달 UI 폐기** → redirect 기반 페이지(success/fail) 일원화
6. **정기결제 스케줄링**: Vercel Cron + Supabase 쿼리 자체 구현 (토스 미지원)
7. **재시도 정책**: 결제일 실패 후 3일간 매일 재시도 → 7일 유예 → Day+10에 자동 정지

### 비목표
- 1회성 결제(빌링키 없는 결제) 지원은 이번 범위 밖.
- 다중 PG 동시 지원(어댑터 패턴) 미적용. 필요 시 추후 별도 설계.

---

## 1. 아키텍처

### 결제 모델
- **빌링키 기반 카드 자동결제 (월 1회)**
- 토스 SDK로 카드 인증 → `authKey` 획득 → 서버에서 빌링키 발급 → 매월 cron으로 빌링키 결제

### 통신 계층 — `src/lib/tossPayments/`
```
src/lib/tossPayments/
├── client.ts       # Basic Auth fetch wrapper, Idempotency-Key 헤더, 에러 분류
├── billing.ts      # 빌링키 발급/결제 (POST /v1/billing/...)
├── payments.ts     # 결제 단건 조회/취소 (POST /v1/payments/...)
├── webhook.ts      # 토스 웹훅 페이로드 검증 (paymentKey + secret 매칭)
├── errors.ts       # TossPaymentsError, 영구/일시 실패 분류
└── types.ts        # Payment, Billing, Cancel 등 토스 응답 타입
```

코드 전반에 토스 표준 명칭(`paymentKey`, `orderId`, `customerKey`, `billingKey`, `secret`)을 그대로 사용. 어댑터 함수명(`chargeBillingKey` 등)은 폐기하고 토스가 사용하는 동사를 따름(`issueBillingKey`, `confirmBilling`, `cancelPayment`).

### 책임 흐름
```
[Client]                          [API]                          [Service]                       [Toss]
TossSDK.requestBillingAuth → /api/billing/customer-key → billingService.getOrCreateCustomerKey
  ↓ (toss redirect)
/billing/success page         → /api/billing/auth/issue   → billingService.registerSubscription → POST /v1/billing/auth/issue
                                                                                                  → POST /v1/billing/{key} (첫 결제)
Vercel Cron (KST 02:00)       → /api/cron/billing-charge → billingService.runDueCharges()      → POST /v1/billing/{key} (loop)
Vercel Cron (KST 03:00)       → /api/cron/billing-retry  → billingService.runRetries()         → POST /v1/billing/{key} (재시도)
Toss Webhook                  → /api/webhooks/toss       → webhookService.handle()             → GET  /v1/payments/{key} (검증)
```

---

## 2. 데이터 모델

### 신규 마이그레이션 파일
**파일:** `supabase/migrations/20260508_toss_payments_migration.sql`

### `subscriptions` 테이블 (클리닉 구독)
**신규 컬럼:**
- `customer_key TEXT NOT NULL UNIQUE` — 토스 고객 식별자. 클리닉당 1회 UUID 발급 후 영구 저장. 카드 변경/구독 재가입 시에도 동일 값 재사용.
- `card_company VARCHAR(50)` — 토스 빌링키 응답의 `cardCompany`
- `billing_method VARCHAR(20) DEFAULT 'card'` — 추후 결제 수단 확장 대비

**삭제/변경 컬럼:**
- 기존 `card_name` → 의미 변경: 카드 발급사명만 저장 (토스 응답에 카드 별명 없음)
- `billing_key TEXT` — 그대로 유지 (포트원/토스 모두 동일 명칭)

### `subscription_payments` 테이블 (클리닉 결제 내역)
**삭제 컬럼:**
- `portone_payment_id`
- `portone_tx_id`

**신규 컬럼:**
- `toss_payment_key TEXT UNIQUE` — 토스 paymentKey (결제 성공 시 수신)
- `toss_order_id TEXT UNIQUE NOT NULL` — 우리가 생성하는 주문번호. 형식: `sub-{clinicIdPrefix8}-{YYYYMM}` (월 결제 1회 보장)
  - 업그레이드 차액 등은 `sub-{clinicIdPrefix8}-{YYYYMM}-upgrade-{ts}` 접미사
- `toss_secret TEXT` — 결제 응답의 `secret` 값. 웹훅 검증에 사용
- `idempotency_key TEXT` — 결제 시도 시 사용한 멱등키 (`Idempotency-Key` 헤더값)
- `method VARCHAR(20)` — 토스 응답의 `method` (예: '카드')
- `receipt_url TEXT` — 토스 영수증 URL
- `raw_response JSONB` — 토스 원본 응답 보관 (디버깅용)

**인덱스:**
- `idx_subscription_payments_order_id ON (toss_order_id)`
- `idx_subscription_payments_payment_key ON (toss_payment_key)` — 웹훅 검증 시 조회

### `user_subscriptions` 테이블 (투자 구독)
동일 패턴으로 마이그레이션:
- `portone_payment_id` → `toss_payment_key`
- `portone_tx_id` → 삭제
- `customer_key TEXT NOT NULL UNIQUE` 추가
- `toss_order_id`, `toss_secret`, `idempotency_key`, `method`, `receipt_url`, `raw_response` 추가

### 신규 테이블 — `billing_webhook_events`
웹훅 멱등성 보장 + 감사 로그.
```sql
CREATE TABLE billing_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  payment_key TEXT,
  order_id TEXT,
  status TEXT,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  process_error TEXT,
  UNIQUE (event_type, payment_key, status)
);
CREATE INDEX idx_billing_webhook_events_unprocessed
  ON billing_webhook_events (received_at)
  WHERE processed_at IS NULL;
```

### `subscription_plans` 테이블
변경 없음.

---

## 3. 클라이언트 흐름

### SDK
- 패키지: `@tosspayments/tosspayments-sdk` (v2)
- 환경 변수: `NEXT_PUBLIC_TOSS_CLIENT_KEY` (테스트: `test_ck_*`, 운영: `live_ck_*`)

### 페이지 구성
```
/owner/subscription/page.tsx                      ← 진입점: 플랜 선택 + 구독 시작 버튼
/owner/subscription/billing/success/page.tsx      ← Toss successUrl 콜백
/owner/subscription/billing/fail/page.tsx         ← Toss failUrl 콜백
/investment/subscribe/page.tsx                    ← 투자 구독 진입점 (재작성)
/investment/subscribe/success/page.tsx            ← 신규
/investment/subscribe/fail/page.tsx               ← 신규
```

### 흐름 단계
1. 사용자가 `/owner/subscription`에서 플랜 선택 → "구독 시작" 클릭
2. 클라이언트가 `POST /api/billing/customer-key`로 customerKey 확보 (없으면 발급)
3. `loadTossPayments(clientKey)` → `tossPayments.requestBillingAuth({ method: 'CARD', successUrl, failUrl, customerKey })` 호출
4. 토스 결제창 (PC 새 창 / 모바일 페이지 이동) → 카드 입력 + 카드사 인증
5. **성공** → `/owner/subscription/billing/success?customerKey=...&authKey=...`
   - 페이지 마운트 시 즉시 `POST /api/billing/auth/issue { authKey, customerKey, planId }` 호출
   - 응답에 따라 완료 화면 또는 에러 표시
6. **실패** → `/owner/subscription/billing/fail?code=...&message=...&orderId=...`
   - 에러 코드별 한국어 메시지 + "다시 시도" / "취소" 버튼

### 모달 폐기
- 기존 `src/components/Subscription/CardRegistrationModal.tsx` (포트원 SDK + IFRAME)는 **삭제**
- 토스는 redirect 기반이므로 모달로 처리 시 모바일 브라우저에서 깨짐
- 표준 흐름인 별도 페이지로 일원화

---

## 4. 서버 흐름

### API 라우트
| 메서드/경로 | 역할 | 권한 |
|---|---|---|
| `POST /api/billing/customer-key` | 클리닉의 `customerKey` 발급/조회 (멱등) | 인증된 사용자 |
| `POST /api/billing/auth/issue` | `{ authKey, customerKey, planId }` → 빌링키 발급 + 첫 결제 + 구독 등록 | 인증된 사용자 |
| `POST /api/subscriptions/cancel` | 즉시/기간말 취소 | owner |
| `POST /api/subscriptions/upgrade` | 플랜 업그레이드 (일할 차액 즉시 결제) | owner |
| `POST /api/subscriptions/downgrade` | 플랜 다운그레이드 (다음 결제일 적용) | owner |
| `GET  /api/subscriptions/status` | 현재 구독 + 결제 내역 | 인증된 사용자 |
| `POST /api/webhooks/toss` | 토스 결제 상태 변경 웹훅 (인증 헤더 없이 외부 호출) | 페이로드 검증 |
| `GET  /api/cron/billing-charge` | 매일 KST 02:00 — 결제일 도래분 자동 청구 | `Authorization: Bearer ${CRON_SECRET}` |
| `GET  /api/cron/billing-retry` | 매일 KST 03:00 — 실패분 재시도 | `Authorization: Bearer ${CRON_SECRET}` |

**투자 구독 라우트:**
- `POST /api/investment/billing/auth/issue` — 빌링키 발급 + 첫 결제 + `user_subscriptions` 등록
- `POST /api/investment/subscriptions/cancel` — 취소
- 결제 자동화 로직은 동일 cron(`/api/cron/billing-charge`)이 두 테이블 모두 처리

### 삭제할 라우트
- `src/app/api/webhooks/portone/route.ts`
- `src/app/api/subscription/register/route.ts` → `/api/billing/auth/issue`로 통합
- `src/app/api/investment/subscription/webhook/route.ts` → `/api/webhooks/toss`로 통합
- `src/app/api/investment/subscription/register/route.ts` → `/api/investment/billing/auth/issue`로 통합

### 비즈니스 서비스 — `src/lib/billingService.ts`
기존 `subscriptionService.ts` 재구성. 핵심 함수:

```ts
getOrCreateCustomerKey(clinicId: string): Promise<string>
// subscriptions.customer_key 없으면 randomUUID 발급 후 row 생성/업데이트

registerSubscription(params: {
  clinicId: string
  planId: string
  authKey: string
  customerKey: string
}): Promise<{ subscription, payment }>
// 1. issueBillingKey({ authKey, customerKey }) → billingKey
// 2. confirmBilling({ billingKey, customerKey, orderId, ... }) → Payment
// 3. subscriptions UPDATE (status='active', billing_key, current_period_*, next_billing_date)
// 4. subscription_payments INSERT
// 트랜잭션 단위로 처리. 실패 시 롤백 + 사용자에게 명확한 에러 응답.

runDueCharges(): Promise<{ processed, succeeded, failed }>
// SELECT * FROM subscriptions
// WHERE status='active' AND next_billing_date <= NOW()
// 각 행에 대해 confirmBilling 호출 → 성공/실패 분기

runRetries(): Promise<{ processed, recovered, suspended }>
// SELECT * FROM subscriptions
// WHERE status='past_due' AND next_retry_at <= NOW()
// retry_count에 따라 재시도 또는 정지

upgradePlan(...) / downgradePlan(...) / cancelSubscription(...)
// 기존 로직 유지, PG 호출 부분만 토스로 교체
```

### 투자 구독용 — `src/lib/userBillingService.ts`
`user_subscriptions` 대상. 클리닉 구독과 별개 함수지만 내부에서 동일한 `tossPayments/billing.ts` 모듈을 호출.

### Vercel Cron 등록 — `vercel.json`
```json
{
  "crons": [
    { "path": "/api/cron/billing-charge", "schedule": "0 17 * * *" },
    { "path": "/api/cron/billing-retry",  "schedule": "0 18 * * *" }
  ]
}
```
- UTC 17:00 = KST 02:00, UTC 18:00 = KST 03:00
- 라우트에서 `Authorization: Bearer ${CRON_SECRET}` 검증

### 주문번호 생성 규칙
- 정기결제: `sub-{clinicIdPrefix8}-{YYYYMM}` (예: `sub-a3b9d12f-202605`) — 월 1회 보장 (DB UNIQUE)
- 업그레이드 차액: `sub-{clinicIdPrefix8}-{YYYYMM}-upgrade-{Date.now()}`
- 투자 구독: `inv-{userIdPrefix8}-{YYYYMM}`

### `Idempotency-Key` 헤더
토스 결제 호출 시 `toss_order_id`를 그대로 멱등키로 사용. 동일 주문번호로 중복 호출 시 토스가 동일 결과 반환.

---

## 5. 에러 처리 · 재시도 · 웹훅

### 결제 실패 분류 (`src/lib/tossPayments/errors.ts`)
| 분류 | 토스 에러 코드(예) | 처리 |
|---|---|---|
| 사용자 조치 필요 (영구) | `INVALID_CARD`, `EXPIRED_CARD`, `STOLEN_CARD`, `EXCEED_MAX_AMOUNT`, `EXCEED_MAX_DAILY_AMOUNT` | 재시도 무의미 → 즉시 `past_due` + 카드 재등록 알림 |
| 일시 실패 (재시도 가능) | `EXCEED_MAX_PAYMENT_AMOUNT`(잔고부족), `PAY_PROCESS_CANCELED`, `NETWORK_ERROR`, 5xx | `retry_count++`, `next_retry_at`에 따라 재시도 |

### 재시도 정책
| 시기 | 동작 | DB 상태 변화 |
|---|---|---|
| Day 0 (`next_billing_date`) | 원결제 시도 (cron 02:00) | 실패 시 → `past_due`, `retry_count=1`, `next_retry_at = Day+1` |
| Day +1 | 재시도 (cron 03:00) | 실패 시 → `retry_count=2`, `next_retry_at = Day+2` |
| Day +2 | 재시도 | 실패 시 → `retry_count=3`, `next_retry_at = Day+3` |
| Day +3 | 재시도 (마지막 자동 재시도) | 실패 시 → `retry_count=4`, `next_retry_at = Day+10` |
| Day +4 ~ +9 | **유예 기간** — 재시도 안 함, `subscription_payment_warning` 알림만 발송 | `past_due` 유지 |
| Day +10 | cron이 `retry_count >= 4` 행을 발견하면 **재시도 없이 즉시 정지** | `status='suspended'` + 서비스 게이팅 + `subscription_suspended` 알림 |

**규칙:**
- `runRetries()`의 진입 조건: `status='past_due' AND next_retry_at <= NOW()`
- 진입 후 분기:
  - `retry_count < 4` → 재시도 호출
  - `retry_count >= 4` → 토스 호출 없이 `status='suspended'` 처리

- 사용자가 유예 기간 중 카드 재등록 → 즉시 청구 시도 → 성공 시 `active` 복구, `next_billing_date` 재계산
- `runRetries()`는 `next_retry_at <= NOW() AND status='past_due'`만 처리

### 알림 타입 (기존 `user_notifications` 시스템 활용)
| 이벤트 | type | 대상 |
|---|---|---|
| 결제 성공 | `subscription_payment_succeeded` *(기존)* | owner |
| 결제 실패(재시도 예약) | `subscription_payment_failed` *(신규)* | owner |
| 정지 임박(Day +3 이후) | `subscription_payment_warning` *(신규)* | owner |
| 서비스 정지 | `subscription_suspended` *(신규)* | owner + manager |
| 카드 만료 임박 | `subscription_card_expiring` *(신규)* | owner |

`user_notifications` CHECK 제약(현재 `20260419_user_notifications_subscription_types.sql`)에 신규 타입 4개 추가 마이그레이션 포함.

### 웹훅 처리 (`/api/webhooks/toss`)
1. 페이로드 수신 → `billing_webhook_events` INSERT (`UNIQUE(event_type, payment_key, status)`로 중복 차단)
2. 페이로드의 `paymentKey`로 `getPayment(paymentKey)` 호출 → **토스에서 직접 다시 조회** (페이로드 신뢰 X)
3. `Payment.secret` ↔ DB의 `subscription_payments.toss_secret` 비교 → 불일치 시 401
4. 상태에 따라 `subscription_payments.status` 업데이트 + `subscriptions.status` 동기화 + 알림 발송
5. 처리 실패 시 `processed_at IS NULL`, `process_error` 기록 → 수동 재처리 가능

**역할 분담:**
- cron이 능동적으로 결제를 호출 → 즉시 응답 받아 DB 반영
- 웹훅은 **상태 동기화 안전망** (가상계좌 입금, 사후 취소 등 비동기 상태 변화 캐치)

---

## 6. 테스트

### 토스 테스트 키
- `.env.local`: `TOSS_SECRET_KEY=test_sk_...`, `NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_...`
- 토스 문서 제공 테스트 카드 번호 사용 (성공/실패 시나리오별)

### 단위 테스트 (Vitest)
- `src/lib/tossPayments/__tests__/client.test.ts` — Basic Auth 인코딩, Idempotency-Key 헤더 부착, 4xx/5xx → TossPaymentsError 변환
- `src/lib/tossPayments/__tests__/billing.test.ts` — fetch mock으로 API 호출 검증
- `src/lib/tossPayments/__tests__/errors.test.ts` — 에러 코드 분류 (영구/일시)
- `src/lib/__tests__/billingService.test.ts` — 일할 계산, 다음 결제일 계산, 재시도 상태 전이
- `src/lib/tossPayments/__tests__/webhook.test.ts` — secret 매칭, 멱등 차단

### 통합 검증 (Chrome DevTools MCP)
테스트 계정(whitedc0902@gmail.com)으로 로그인 후:
1. `/owner/subscription` → 플랜 선택 → 결제창 진입
2. 토스 테스트 카드(성공) → success 페이지 → DB 검증 (`subscriptions.status='active'`, `subscription_payments.status='paid'`)
3. 토스 테스트 카드(실패: `INVALID_CARD`) → fail 페이지 + 에러 메시지
4. cron 직접 호출 (`curl -H 'Authorization: Bearer ${CRON_SECRET}' ...`) → `next_billing_date`를 어제로 임시 변경 후 트리거 → 결제 실행 확인
5. 취소 → `status='cancelled'`, `next_billing_date` 비어있음 확인

### Playwright e2e (선택)
- 토스 결제창은 외부 도메인이므로 자동화 어려움 → Chrome DevTools MCP 수동 검증으로 갈음
- 내부 페이지 흐름(플랜 선택 UI, 성공 페이지 처리, status 페이지)은 Playwright 가능

---

## 7. 환경 변수 · 배포 · 정리

### 환경 변수 (`.env.example` 갱신)
```env
# 추가
TOSS_SECRET_KEY=test_sk_...                # 운영: live_sk_...
NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_...    # 운영: live_ck_...
CRON_SECRET=<랜덤_32바이트>                 # Vercel Cron 인증

# 삭제
PORTONE_API_SECRET
PORTONE_STORE_ID
NEXT_PUBLIC_PORTONE_STORE_ID
NEXT_PUBLIC_PORTONE_CHANNEL_KEY
```

### 배포 순서 (Zero-downtime 불필요)
1. **DB 마이그레이션 적용** (Supabase MCP): `20260508_toss_payments_migration.sql`
2. **환경 변수 등록** (Vercel Dashboard): 토스 키 + `CRON_SECRET`
3. **코드 배포** (develop → main PR 머지)
4. **배포 직후 검증**:
   - 빌드/배포 성공
   - `/api/cron/billing-charge` 헬스체크 (빈 결과)
   - 토스 어드민에서 웹훅 URL 등록: `https://<domain>/api/webhooks/toss`
5. **테스트 결제** (테스트 키로 끝까지 1회 검증)

### 코드 정리 (마이그레이션 후 일괄 삭제)
- `src/lib/portone.ts`
- `src/components/Subscription/CardRegistrationModal.tsx`
- `src/app/api/webhooks/portone/route.ts`
- `src/app/api/subscription/register/route.ts`
- `src/app/api/investment/subscription/webhook/route.ts`
- `src/app/api/investment/subscription/register/route.ts`
- `@portone/browser-sdk` npm 의존성 제거

### 토스 어드민 사전 설정 (사용자 직접)
- 토스페이먼츠 가입 + MID 발급
- 빌링(자동결제) 사용 신청
- 웹훅 URL 등록
- 시크릿 키/클라이언트 키 발급 → `.env.local` 및 Vercel에 입력

---

## 8. 위험 · 완화책

| 위험 | 완화책 |
|---|---|
| Vercel Cron 누락 (서버 다운) | 다음 cron 사이클에서 자연 복구. `next_billing_date`는 변경되지 않으므로 결과적 일관성 보장 |
| 토스 API 일시 장애 (5xx) | 일시 실패로 분류 → 재시도 큐로 자동 진입 |
| 빌링키 발급 후 첫 결제 실패 | `registerSubscription` 트랜잭션에서 빌링키만 저장하고 `status='past_due'`로 시작, 사용자에게 즉시 안내 |
| 동일 결제 중복 청구 | `toss_order_id` UNIQUE + `Idempotency-Key` 헤더로 이중 방어 |
| 웹훅 위변조 | 페이로드 신뢰 안 함, 토스 API로 다시 조회 후 `secret` 일치 검증 |
| customerKey 분실 | `subscriptions.customer_key NOT NULL UNIQUE`로 영구 보존, 카드 재등록에도 동일 키 재사용 |

---

## 9. 후속 작업 (이번 범위 밖)

- 다중 PG 추상화 (어댑터 패턴)
- 1회성 결제 지원
- 가상계좌/계좌이체/간편결제 등 결제 수단 확장
- 영수증/세금계산서 자동 발행
- 환불 자동화 (현재는 `cancelPayment` 함수만 제공, UI 없음)
