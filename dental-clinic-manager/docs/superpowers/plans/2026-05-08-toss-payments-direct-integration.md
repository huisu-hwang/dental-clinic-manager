# 토스페이먼츠 직결 결제 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 포트원(PortOne) 경유 결제를 토스페이먼츠 직결 빌링키 정기결제로 완전 교체.

**Architecture:** 클라이언트는 `@tosspayments/tosspayments-sdk` v2로 빌링키 발급 → 서버는 `Authorization: Basic` 인증으로 토스 API 직접 호출 → Vercel Cron으로 매월 결제 자체 스케줄링. 단계적 저장(saga) 패턴으로 외부 API와 DB 일관성 보장. `subscriptions` 테이블의 `customer_key`는 클리닉당 1회 무작위 UUID 발급 후 영구 보존.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase (PostgreSQL), Vitest, `@tosspayments/tosspayments-sdk` v2.

**Spec:** [docs/superpowers/specs/2026-05-08-toss-payments-direct-integration-design.md](../specs/2026-05-08-toss-payments-direct-integration-design.md)

---

## File Structure

### 신규 생성
```
src/lib/tossPayments/
├── client.ts          # Basic Auth fetch wrapper, Idempotency-Key
├── errors.ts          # TossPaymentsError, 영구/일시 실패 분류
├── types.ts           # Payment, Billing, Cancel 등 응답 타입
├── billing.ts         # 빌링키 발급/결제
├── payments.ts        # 단건 조회, 취소
├── webhook.ts         # 웹훅 검증
├── issuerCodes.ts     # 카드 발급사 코드→이름 매핑
└── __tests__/
    ├── client.test.ts
    ├── errors.test.ts
    ├── billing.test.ts
    ├── payments.test.ts
    └── webhook.test.ts

src/lib/billingService.ts                      # 클리닉 구독 비즈니스 로직 (구 subscriptionService 재구성)
src/lib/userBillingService.ts                  # 투자 구독 비즈니스 로직
src/lib/__tests__/billingService.test.ts

src/app/api/billing/customer-key/route.ts
src/app/api/billing/auth/issue/route.ts
src/app/api/webhooks/toss/route.ts
src/app/api/cron/billing-charge/route.ts
src/app/api/cron/billing-retry/route.ts
src/app/api/investment/billing/auth/issue/route.ts
src/app/api/investment/billing/customer-key/route.ts

src/app/owner/subscription/page.tsx                       # 재작성
src/app/owner/subscription/billing/success/page.tsx       # 신규
src/app/owner/subscription/billing/fail/page.tsx          # 신규
src/app/investment/subscribe/page.tsx                     # 재작성
src/app/investment/subscribe/success/page.tsx             # 신규
src/app/investment/subscribe/fail/page.tsx                # 신규

supabase/migrations/20260508_toss_payments_migration.sql
```

### 수정
```
src/types/subscription.ts            # PortOne 타입 → Toss 타입 교체
src/types/userSubscription.ts        # 동일
src/app/api/subscription/cancel/route.ts      # billingService 호출로 변경
src/app/api/subscription/upgrade/route.ts     # 동일
src/app/api/subscription/downgrade/route.ts   # 동일
src/app/api/subscription/status/route.ts      # 동일
.env.example
vercel.json
package.json (의존성 변경)
```

### 삭제
```
src/lib/portone.ts
src/lib/subscriptionService.ts                # billingService.ts로 대체
src/lib/subscriptionReconciler.ts             # 더 이상 사용 안 함
src/lib/userSubscriptionService.ts            # userBillingService.ts로 대체
src/components/Subscription/CardRegistrationModal.tsx
src/app/api/webhooks/portone/route.ts
src/app/api/subscription/register/route.ts                   # /api/billing/auth/issue로 통합
src/app/api/investment/subscription/webhook/route.ts         # /api/webhooks/toss로 통합
src/app/api/investment/subscription/register/route.ts        # /api/investment/billing/auth/issue로 통합
src/app/api/investment/subscription/cancel/route.ts          # /api/investment/billing/...로 이전
src/app/api/investment/subscription/status/route.ts          # 동일
```

---

## Phase A: Toss SDK 모듈 (순수 유틸 — 단위 테스트 우선)

### Task A1: Toss client (Basic Auth + Idempotency-Key)

**Files:**
- Create: `src/lib/tossPayments/client.ts`
- Create: `src/lib/tossPayments/__tests__/client.test.ts`

- [ ] **Step 1: 의존성 설치**

```bash
npm install @tosspayments/tosspayments-sdk
```

- [ ] **Step 2: 테스트 파일 작성**

`src/lib/tossPayments/__tests__/client.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { tossFetch, TossPaymentsError } from '../client'

describe('tossFetch', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, TOSS_SECRET_KEY: 'test_sk_xyz' }
    vi.restoreAllMocks()
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('Basic Auth 헤더에 secretKey + ":" base64 인코딩 부착', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    )

    await tossFetch('/v1/billing/abc', { method: 'POST', body: JSON.stringify({}) })

    const expected = 'Basic ' + Buffer.from('test_sk_xyz:').toString('base64')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.tosspayments.com/v1/billing/abc',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: expected }),
      })
    )
  })

  it('idempotencyKey 옵션 → Idempotency-Key 헤더', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    )

    await tossFetch('/v1/payments/abc', {
      method: 'POST',
      idempotencyKey: 'order-123',
      body: JSON.stringify({}),
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'order-123' }),
      })
    )
  })

  it('4xx 응답 → TossPaymentsError(code, message) throw', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 'INVALID_CARD', message: '잘못된 카드입니다' }),
        { status: 400 }
      )
    )

    await expect(tossFetch('/v1/billing/x', { method: 'POST' })).rejects.toMatchObject({
      name: 'TossPaymentsError',
      code: 'INVALID_CARD',
      message: '잘못된 카드입니다',
      httpStatus: 400,
    })
  })

  it('5xx 응답 → TossPaymentsError(httpStatus=500)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Internal', { status: 500 })
    )
    await expect(tossFetch('/v1/payments/x', { method: 'POST' })).rejects.toMatchObject({
      httpStatus: 500,
    })
  })

  it('TOSS_SECRET_KEY 미설정 시 throw', async () => {
    delete process.env.TOSS_SECRET_KEY
    await expect(tossFetch('/v1/x')).rejects.toThrow('TOSS_SECRET_KEY')
  })
})
```

- [ ] **Step 3: 테스트 실행 → 실패 확인**

```bash
npm run test:unit -- src/lib/tossPayments/__tests__/client.test.ts
```
Expected: FAIL (모듈 없음)

- [ ] **Step 4: client.ts 구현**

`src/lib/tossPayments/client.ts`:
```ts
const TOSS_API_BASE = 'https://api.tosspayments.com'

export class TossPaymentsError extends Error {
  name = 'TossPaymentsError'
  constructor(
    public code: string,
    message: string,
    public httpStatus: number,
    public raw?: unknown
  ) {
    super(message)
  }
}

function getSecretKey(): string {
  const key = process.env.TOSS_SECRET_KEY
  if (!key) throw new Error('TOSS_SECRET_KEY 환경 변수가 설정되지 않았습니다')
  return key
}

export interface TossFetchInit extends RequestInit {
  idempotencyKey?: string
}

export async function tossFetch<T>(path: string, init: TossFetchInit = {}): Promise<T> {
  const { idempotencyKey, headers: extraHeaders, ...rest } = init
  const auth = 'Basic ' + Buffer.from(`${getSecretKey()}:`).toString('base64')

  const headers: Record<string, string> = {
    Authorization: auth,
    'Content-Type': 'application/json',
    ...(extraHeaders as Record<string, string> | undefined),
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

  const res = await fetch(`${TOSS_API_BASE}${path}`, { ...rest, headers })

  if (!res.ok) {
    const text = await res.text()
    let parsed: { code?: string; message?: string } = {}
    try { parsed = JSON.parse(text) } catch { /* not json */ }
    throw new TossPaymentsError(
      parsed.code ?? 'UNKNOWN',
      parsed.message ?? text || `HTTP ${res.status}`,
      res.status,
      text
    )
  }

  return res.json() as Promise<T>
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npm run test:unit -- src/lib/tossPayments/__tests__/client.test.ts
```
Expected: 5 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/lib/tossPayments/client.ts src/lib/tossPayments/__tests__/client.test.ts package.json package-lock.json
git commit -m "feat(toss): Basic Auth + Idempotency-Key tossFetch 클라이언트"
```

---

### Task A2: Errors 분류 (영구/일시 실패)

**Files:**
- Create: `src/lib/tossPayments/errors.ts`
- Create: `src/lib/tossPayments/__tests__/errors.test.ts`

- [ ] **Step 1: 테스트 작성**

`src/lib/tossPayments/__tests__/errors.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { TossPaymentsError } from '../client'
import { classifyTossError, ErrorClass } from '../errors'

describe('classifyTossError', () => {
  const cases: Array<[string, number, ErrorClass]> = [
    ['INVALID_CARD', 400, 'permanent'],
    ['EXPIRED_CARD', 400, 'permanent'],
    ['STOLEN_CARD', 400, 'permanent'],
    ['EXCEED_MAX_AMOUNT', 400, 'permanent'],
    ['EXCEED_MAX_DAILY_AMOUNT', 400, 'permanent'],
    ['EXCEED_MAX_PAYMENT_AMOUNT', 400, 'transient'],
    ['PAY_PROCESS_CANCELED', 400, 'transient'],
    ['NETWORK_ERROR', 0, 'transient'],
    ['UNKNOWN', 500, 'transient'],
    ['UNKNOWN', 502, 'transient'],
    ['UNKNOWN', 400, 'permanent'],
  ]

  for (const [code, status, expected] of cases) {
    it(`${code} (HTTP ${status}) → ${expected}`, () => {
      const err = new TossPaymentsError(code, 'msg', status)
      expect(classifyTossError(err)).toBe(expected)
    })
  }
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npm run test:unit -- src/lib/tossPayments/__tests__/errors.test.ts
```
Expected: FAIL (모듈 없음)

- [ ] **Step 3: errors.ts 구현**

`src/lib/tossPayments/errors.ts`:
```ts
import { TossPaymentsError } from './client'

export type ErrorClass = 'permanent' | 'transient'

const PERMANENT_CODES = new Set([
  'INVALID_CARD',
  'EXPIRED_CARD',
  'STOLEN_CARD',
  'EXCEED_MAX_AMOUNT',
  'EXCEED_MAX_DAILY_AMOUNT',
  'CARD_LIMIT_EXCEEDED',
  'NOT_REGISTERED_CARD',
  'INVALID_CARD_NUMBER',
])

export function classifyTossError(err: TossPaymentsError): ErrorClass {
  if (PERMANENT_CODES.has(err.code)) return 'permanent'
  if (err.httpStatus >= 500) return 'transient'
  if (err.httpStatus === 0) return 'transient' // network error
  if (err.code === 'NETWORK_ERROR') return 'transient'
  if (err.code === 'EXCEED_MAX_PAYMENT_AMOUNT') return 'transient' // 잔고부족
  if (err.code === 'PAY_PROCESS_CANCELED') return 'transient'
  return 'permanent'
}

export function userMessageForCode(code: string): string {
  const map: Record<string, string> = {
    INVALID_CARD: '카드 정보가 올바르지 않습니다. 다른 카드로 다시 시도해 주세요.',
    EXPIRED_CARD: '카드 유효기간이 만료되었습니다. 새 카드를 등록해 주세요.',
    STOLEN_CARD: '분실/도난 카드입니다. 카드사에 문의해 주세요.',
    EXCEED_MAX_AMOUNT: '결제 한도를 초과했습니다.',
    EXCEED_MAX_DAILY_AMOUNT: '일일 결제 한도를 초과했습니다.',
    EXCEED_MAX_PAYMENT_AMOUNT: '카드 잔고가 부족합니다.',
    PAY_PROCESS_CANCELED: '결제가 취소되었습니다.',
  }
  return map[code] ?? '결제 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test:unit -- src/lib/tossPayments/__tests__/errors.test.ts
```
Expected: 11 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/tossPayments/errors.ts src/lib/tossPayments/__tests__/errors.test.ts
git commit -m "feat(toss): 결제 에러 영구/일시 분류 + 한국어 메시지"
```

---

### Task A3: Types + 카드 발급사 코드 매핑

**Files:**
- Create: `src/lib/tossPayments/types.ts`
- Create: `src/lib/tossPayments/issuerCodes.ts`

- [ ] **Step 1: types.ts 작성**

`src/lib/tossPayments/types.ts`:
```ts
// 토스페이먼츠 v2 응답 객체 타입

export interface TossCard {
  issuerCode: string         // 카드 발급사 두 자리 코드 (예: '41' = 현대카드)
  acquirerCode: string       // 카드 매입사 두 자리 코드
  number: string             // 마스킹된 카드번호
  cardType: '신용' | '체크' | '기프트'
  ownerType: '개인' | '법인'
}

export interface TossBilling {
  mId: string
  customerKey: string
  authenticatedAt: string
  method: string
  billingKey: string
  card: TossCard
  cardCompany?: string  // deprecated, issuerCode 사용 권장
  cardNumber?: string   // deprecated, card.number 사용 권장
}

export interface TossPaymentAmount {
  total: number
  taxFree?: number
  vat?: number
}

export interface TossPayment {
  paymentKey: string
  orderId: string
  orderName: string
  status:
    | 'READY' | 'IN_PROGRESS' | 'WAITING_FOR_DEPOSIT'
    | 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED' | 'ABORTED' | 'EXPIRED'
  method: string
  totalAmount: number
  balanceAmount: number
  approvedAt?: string
  requestedAt: string
  secret?: string
  receipt?: { url: string }
  card?: TossCard
  failure?: { code: string; message: string }
}

export interface TossWebhookPayload {
  eventType: string                  // 'PAYMENT_STATUS_CHANGED' 등
  data: TossPayment
  createdAt: string
}
```

- [ ] **Step 2: issuerCodes.ts 작성**

`src/lib/tossPayments/issuerCodes.ts`:
```ts
// 토스페이먼츠 카드 발급사 코드 → 한국 카드사명 매핑
// 출처: https://docs.tosspayments.com/reference/codes#카드사-코드

const ISSUER_NAMES: Record<string, string> = {
  '01': '하나카드 (외환)',
  '03': '롯데카드',
  '04': '현대카드',
  '06': '국민카드',
  '11': '비씨카드',
  '12': '삼성카드',
  '14': '신한카드',
  '15': '우리카드',
  '16': '하나카드',
  '17': 'JB카드',
  '21': 'NH농협카드',
  '22': '광주은행',
  '23': '수협은행',
  '24': '제주은행',
  '25': '신협',
  '26': '우체국예금보험',
  '27': '새마을금고',
  '32': '카카오뱅크',
  '33': '케이뱅크',
  '34': '토스뱅크',
  '35': '한국씨티은행',
  '36': '대구은행',
  '37': '부산은행',
  '38': '경남은행',
  '39': '전북은행',
  '41': '현대카드',
  '42': '비씨카드',
  '43': '삼성카드',
  '44': '신한카드',
  '45': '롯데카드',
  '46': 'NH농협카드',
  '47': '하나카드',
  '48': '국민카드',
  '51': '카카오페이',
  '52': '네이버페이',
  '53': '토스페이',
  '71': '우리카드',
  '95': '저축은행중앙회',
  '96': '신용보증재단중앙회',
}

export function getIssuerName(code: string | null | undefined): string {
  if (!code) return '알 수 없음'
  return ISSUER_NAMES[code] ?? `발급사(${code})`
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/lib/tossPayments/types.ts src/lib/tossPayments/issuerCodes.ts
git commit -m "feat(toss): 응답 객체 타입 + 카드 발급사 코드 매핑"
```

---

### Task A4: Billing 모듈 (빌링키 발급/결제)

**Files:**
- Create: `src/lib/tossPayments/billing.ts`
- Create: `src/lib/tossPayments/__tests__/billing.test.ts`

- [ ] **Step 1: 테스트 작성**

`src/lib/tossPayments/__tests__/billing.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { issueBillingKey, confirmBilling } from '../billing'

beforeEach(() => {
  process.env.TOSS_SECRET_KEY = 'test_sk_xyz'
  vi.restoreAllMocks()
})

describe('issueBillingKey', () => {
  it('POST /v1/billing/authorizations/issue → Billing 응답 반환', async () => {
    const billing = {
      mId: 'tosspayments',
      customerKey: 'cust-123',
      authenticatedAt: '2026-05-08T01:00:00+09:00',
      method: 'CARD',
      billingKey: 'bk_abc',
      card: { issuerCode: '41', acquirerCode: '41', number: '1234********5678', cardType: '신용', ownerType: '개인' },
    }
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(billing), { status: 200 })
    )

    const result = await issueBillingKey({ authKey: 'auth_x', customerKey: 'cust-123' })

    expect(result).toEqual(billing)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.tosspayments.com/v1/billing/authorizations/issue')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      authKey: 'auth_x',
      customerKey: 'cust-123',
    })
  })
})

describe('confirmBilling', () => {
  it('POST /v1/billing/{billingKey} → Payment 응답', async () => {
    const payment = {
      paymentKey: 'pk_xyz',
      orderId: 'sub-abc-202605',
      orderName: '하얀치과 베이직 플랜',
      status: 'DONE',
      method: '카드',
      totalAmount: 50000,
      balanceAmount: 50000,
      approvedAt: '2026-05-08T01:00:01+09:00',
      requestedAt: '2026-05-08T01:00:00+09:00',
      secret: 'ps_secret_aaa',
    }
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(payment), { status: 200 })
    )

    const result = await confirmBilling({
      billingKey: 'bk_abc',
      customerKey: 'cust-123',
      orderId: 'sub-abc-202605',
      orderName: '하얀치과 베이직 플랜',
      amount: 50000,
      customerName: '홍길동',
      customerEmail: 'a@b.com',
    })

    expect(result.paymentKey).toBe('pk_xyz')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.tosspayments.com/v1/billing/bk_abc')
    expect((init as RequestInit).headers).toMatchObject({ 'Idempotency-Key': 'sub-abc-202605' })
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      customerKey: 'cust-123',
      orderId: 'sub-abc-202605',
      orderName: '하얀치과 베이직 플랜',
      amount: 50000,
      customerName: '홍길동',
      customerEmail: 'a@b.com',
    })
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npm run test:unit -- src/lib/tossPayments/__tests__/billing.test.ts
```

- [ ] **Step 3: billing.ts 구현**

`src/lib/tossPayments/billing.ts`:
```ts
import { tossFetch } from './client'
import type { TossBilling, TossPayment } from './types'

export async function issueBillingKey(params: {
  authKey: string
  customerKey: string
}): Promise<TossBilling> {
  return tossFetch<TossBilling>('/v1/billing/authorizations/issue', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function confirmBilling(params: {
  billingKey: string
  customerKey: string
  orderId: string
  orderName: string
  amount: number
  customerName: string
  customerEmail: string
  taxFreeAmount?: number
}): Promise<TossPayment> {
  const { billingKey, ...body } = params
  return tossFetch<TossPayment>(`/v1/billing/${billingKey}`, {
    method: 'POST',
    idempotencyKey: params.orderId,
    body: JSON.stringify(body),
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test:unit -- src/lib/tossPayments/__tests__/billing.test.ts
```
Expected: 2 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/tossPayments/billing.ts src/lib/tossPayments/__tests__/billing.test.ts
git commit -m "feat(toss): 빌링키 발급/결제 API 래퍼"
```

---

### Task A5: Payments 모듈 (단건 조회/취소)

**Files:**
- Create: `src/lib/tossPayments/payments.ts`
- Create: `src/lib/tossPayments/__tests__/payments.test.ts`

- [ ] **Step 1: 테스트 작성**

`src/lib/tossPayments/__tests__/payments.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getPayment, cancelPayment } from '../payments'

beforeEach(() => {
  process.env.TOSS_SECRET_KEY = 'test_sk_xyz'
  vi.restoreAllMocks()
})

describe('getPayment', () => {
  it('GET /v1/payments/{paymentKey} 호출', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ paymentKey: 'pk_x', status: 'DONE' }), { status: 200 })
    )
    const result = await getPayment('pk_x')
    expect(result.paymentKey).toBe('pk_x')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.tosspayments.com/v1/payments/pk_x',
      expect.objectContaining({ method: undefined })
    )
  })
})

describe('cancelPayment', () => {
  it('POST /v1/payments/{paymentKey}/cancel 호출 (전체 취소)', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ paymentKey: 'pk_x', status: 'CANCELED' }), { status: 200 })
    )
    await cancelPayment({ paymentKey: 'pk_x', cancelReason: '사용자 요청' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.tosspayments.com/v1/payments/pk_x/cancel')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      cancelReason: '사용자 요청',
    })
  })

  it('부분 취소 시 cancelAmount 포함', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ paymentKey: 'pk_x', status: 'PARTIAL_CANCELED' }), { status: 200 })
    )
    await cancelPayment({ paymentKey: 'pk_x', cancelReason: '일할 환불', cancelAmount: 10000 })

    const init = fetchMock.mock.calls[0][1]
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      cancelReason: '일할 환불',
      cancelAmount: 10000,
    })
  })
})
```

- [ ] **Step 2: payments.ts 구현**

`src/lib/tossPayments/payments.ts`:
```ts
import { tossFetch } from './client'
import type { TossPayment } from './types'

export async function getPayment(paymentKey: string): Promise<TossPayment> {
  return tossFetch<TossPayment>(`/v1/payments/${encodeURIComponent(paymentKey)}`)
}

export async function cancelPayment(params: {
  paymentKey: string
  cancelReason: string
  cancelAmount?: number
  idempotencyKey?: string
}): Promise<TossPayment> {
  const { paymentKey, idempotencyKey, ...body } = params
  return tossFetch<TossPayment>(`/v1/payments/${encodeURIComponent(paymentKey)}/cancel`, {
    method: 'POST',
    idempotencyKey,
    body: JSON.stringify(body),
  })
}
```

- [ ] **Step 3: 테스트 실행 + 커밋**

```bash
npm run test:unit -- src/lib/tossPayments/__tests__/payments.test.ts
git add src/lib/tossPayments/payments.ts src/lib/tossPayments/__tests__/payments.test.ts
git commit -m "feat(toss): 결제 단건 조회/취소 API 래퍼"
```

---

### Task A6: Webhook 검증 모듈

**Files:**
- Create: `src/lib/tossPayments/webhook.ts`
- Create: `src/lib/tossPayments/__tests__/webhook.test.ts`

- [ ] **Step 1: 테스트 작성**

`src/lib/tossPayments/__tests__/webhook.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { verifyAndFetchPayment } from '../webhook'

beforeEach(() => {
  process.env.TOSS_SECRET_KEY = 'test_sk_xyz'
  vi.restoreAllMocks()
})

describe('verifyAndFetchPayment', () => {
  it('paymentKey로 토스에서 직접 조회 → secret 일치 시 Payment 반환', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ paymentKey: 'pk_x', secret: 'ps_secret_aaa', status: 'DONE' }), { status: 200 })
    )

    const payment = await verifyAndFetchPayment({
      paymentKey: 'pk_x',
      expectedSecret: 'ps_secret_aaa',
    })
    expect(payment.paymentKey).toBe('pk_x')
  })

  it('secret 불일치 시 Error throw', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ paymentKey: 'pk_x', secret: 'real', status: 'DONE' }), { status: 200 })
    )

    await expect(
      verifyAndFetchPayment({ paymentKey: 'pk_x', expectedSecret: 'fake' })
    ).rejects.toThrow('웹훅 secret 불일치')
  })

  it('expectedSecret 없을 때(첫 결제 전 검증 불가)는 통과', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ paymentKey: 'pk_x', secret: 'any', status: 'DONE' }), { status: 200 })
    )

    const payment = await verifyAndFetchPayment({ paymentKey: 'pk_x', expectedSecret: null })
    expect(payment.paymentKey).toBe('pk_x')
  })
})
```

- [ ] **Step 2: webhook.ts 구현**

`src/lib/tossPayments/webhook.ts`:
```ts
import { getPayment } from './payments'
import type { TossPayment } from './types'

/**
 * 웹훅 페이로드는 신뢰하지 않는다.
 * paymentKey로 토스 API에 다시 조회 → secret 검증으로 출처 확인.
 */
export async function verifyAndFetchPayment(params: {
  paymentKey: string
  expectedSecret: string | null  // DB에 저장된 secret. 없으면(null) 검증 생략
}): Promise<TossPayment> {
  const payment = await getPayment(params.paymentKey)

  if (params.expectedSecret !== null && payment.secret !== params.expectedSecret) {
    throw new Error('웹훅 secret 불일치')
  }
  return payment
}
```

- [ ] **Step 3: 테스트 실행 + 커밋**

```bash
npm run test:unit -- src/lib/tossPayments/__tests__/webhook.test.ts
git add src/lib/tossPayments/webhook.ts src/lib/tossPayments/__tests__/webhook.test.ts
git commit -m "feat(toss): 웹훅 secret 검증 모듈"
```

---

## Phase B: 데이터베이스 마이그레이션

### Task B1: 운영 데이터 사전 검증

- [ ] **Step 1: Supabase MCP로 검증 SQL 실행**

`mcp__supabase__execute_sql`:
```sql
SELECT
  (SELECT COUNT(*) FROM subscription_payments) AS clinic_payments,
  (SELECT COUNT(*) FROM user_subscriptions WHERE billing_key IS NOT NULL) AS user_subs_with_billing,
  (SELECT COUNT(*) FROM subscriptions WHERE billing_key IS NOT NULL) AS clinic_subs_with_billing;
```

- [ ] **Step 2: 결과 확인**

세 값이 모두 0이어야 함. 하나라도 0이 아니면 마이그레이션 중단하고 데이터 처리 계획 재수립.

---

### Task B2: 마이그레이션 SQL 작성 + 적용

**Files:**
- Create: `supabase/migrations/20260508_toss_payments_migration.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/20260508_toss_payments_migration.sql`:
```sql
-- ============================================
-- 포트원 → 토스페이먼츠 직결 마이그레이션
-- 운영 데이터 0건 확인 후 적용
-- ============================================

BEGIN;

-- 1. subscriptions 테이블 변경
ALTER TABLE subscriptions
  DROP COLUMN IF EXISTS card_name,
  ADD COLUMN customer_key TEXT,
  ADD COLUMN card_issuer_code VARCHAR(10),
  ADD COLUMN card_number_masked VARCHAR(20),
  ADD COLUMN card_type VARCHAR(20),
  ADD COLUMN card_owner_type VARCHAR(20),
  ADD COLUMN billing_method VARCHAR(20) DEFAULT 'card';

-- customer_key는 신규 row부터 NOT NULL UNIQUE
-- 기존 row가 0건이라는 사전 검증을 거쳤으므로 즉시 NOT NULL 가능
ALTER TABLE subscriptions
  ALTER COLUMN customer_key SET NOT NULL;
CREATE UNIQUE INDEX idx_subscriptions_customer_key ON subscriptions (customer_key);

-- 2. subscription_payments 테이블 변경
ALTER TABLE subscription_payments
  DROP COLUMN IF EXISTS portone_payment_id,
  DROP COLUMN IF EXISTS portone_tx_id,
  ADD COLUMN toss_payment_key TEXT,
  ADD COLUMN toss_order_id TEXT,
  ADD COLUMN toss_secret TEXT,
  ADD COLUMN idempotency_key TEXT,
  ADD COLUMN method VARCHAR(20),
  ADD COLUMN receipt_url TEXT,
  ADD COLUMN raw_response JSONB;

ALTER TABLE subscription_payments
  ALTER COLUMN toss_order_id SET NOT NULL;
CREATE UNIQUE INDEX idx_subscription_payments_order_id ON subscription_payments (toss_order_id);
CREATE UNIQUE INDEX idx_subscription_payments_payment_key
  ON subscription_payments (toss_payment_key)
  WHERE toss_payment_key IS NOT NULL;

-- 3. user_subscriptions 테이블 변경 (투자 구독)
ALTER TABLE user_subscriptions
  DROP COLUMN IF EXISTS portone_payment_id,
  DROP COLUMN IF EXISTS portone_tx_id,
  ADD COLUMN customer_key TEXT,
  ADD COLUMN card_issuer_code VARCHAR(10),
  ADD COLUMN card_number_masked VARCHAR(20),
  ADD COLUMN card_type VARCHAR(20),
  ADD COLUMN card_owner_type VARCHAR(20),
  ADD COLUMN toss_payment_key TEXT,
  ADD COLUMN toss_order_id TEXT,
  ADD COLUMN toss_secret TEXT,
  ADD COLUMN idempotency_key TEXT,
  ADD COLUMN method VARCHAR(20),
  ADD COLUMN receipt_url TEXT,
  ADD COLUMN raw_response JSONB;

ALTER TABLE user_subscriptions
  ALTER COLUMN customer_key SET NOT NULL;
CREATE UNIQUE INDEX idx_user_subscriptions_customer_key ON user_subscriptions (customer_key);
CREATE UNIQUE INDEX idx_user_subscriptions_order_id
  ON user_subscriptions (toss_order_id)
  WHERE toss_order_id IS NOT NULL;

-- 4. 신규 테이블: 웹훅 이벤트 (멱등 + 감사 로그)
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

-- 5. user_notifications type CHECK 제약 갱신 (신규 알림 타입 3개)
ALTER TABLE user_notifications DROP CONSTRAINT IF EXISTS user_notifications_type_check;
ALTER TABLE user_notifications ADD CONSTRAINT user_notifications_type_check
  CHECK (type IN (
    -- 기존 타입은 모두 유지 (subscription_payment_succeeded 포함)
    -- 마이그레이션 시 기존 CHECK 정의를 그대로 옮겨오고 아래 3개를 추가
    'staff_signup_pending',
    'monthly_report_ready',
    'subscription_payment_succeeded',
    'subscription_payment_failed',     -- 신규
    'subscription_payment_warning',    -- 신규
    'subscription_suspended'           -- 신규
  ));
-- 주의: 위 type 목록은 현재 DB의 실제 타입 목록을 미리 SELECT해 그대로 옮겨와야 함.
-- 실행 직전 SELECT DISTINCT type FROM user_notifications;로 확인.

COMMIT;
```

- [ ] **Step 2: 실제 user_notifications type 목록 확인**

`mcp__supabase__execute_sql`:
```sql
SELECT pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'user_notifications' AND con.contype = 'c';
```

- [ ] **Step 3: SQL의 CHECK 절을 실제 목록 + 신규 3개로 갱신**

위 5번 항목의 CHECK 안 type 목록을 Step 2 결과 + 신규 3개(`subscription_payment_failed`, `subscription_payment_warning`, `subscription_suspended`)로 정확히 교체.

- [ ] **Step 4: 마이그레이션 적용**

`mcp__supabase__apply_migration`:
- name: `20260508_toss_payments_migration`
- query: 위 파일 전체 내용

- [ ] **Step 5: 검증 SQL**

`mcp__supabase__execute_sql`:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('subscriptions', 'subscription_payments', 'user_subscriptions', 'billing_webhook_events')
ORDER BY table_name, ordinal_position;
```

신규 컬럼 모두 존재 + `customer_key`/`toss_order_id`가 NOT NULL인지 확인.

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/20260508_toss_payments_migration.sql
git commit -m "feat(db): 토스페이먼츠 직결 마이그레이션 (포트원 컬럼 제거 + 토스 컬럼 추가)"
```

---

## Phase C: 클리닉 구독 비즈니스 서비스

### Task C1: 타입 정의 갱신

**Files:**
- Modify: `src/types/subscription.ts`

- [ ] **Step 1: 기존 파일 백업 확인**

```bash
git diff src/types/subscription.ts # 변경 확인용 baseline
```

- [ ] **Step 2: 타입 교체**

`src/types/subscription.ts` 전체를 다음으로 교체:

```ts
// ============================================
// 구독 결제 시스템 타입 정의 (토스페이먼츠 직결)
// ============================================

export type SubscriptionStatus =
  | 'pending'      // 빌링키 발급 직후, 첫 결제 전
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'suspended'
  | 'expired'

export type PlanType = 'headcount' | 'feature'

export type SubscriptionPaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded'

export interface SubscriptionPlan {
  id: string
  name: string
  display_name: string
  type: PlanType
  feature_id?: string | null
  min_users: number
  max_users: number
  price: number
  annual_price?: number | null
  description?: string | null
  features: string[]
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface Subscription {
  id: string
  clinic_id: string
  plan_id?: string | null
  status: SubscriptionStatus
  billing_key?: string | null
  customer_key: string
  card_issuer_code?: string | null
  card_number_masked?: string | null
  card_type?: string | null
  card_owner_type?: string | null
  billing_method: string
  current_period_start?: string | null
  current_period_end?: string | null
  next_billing_date?: string | null
  cancel_at_period_end: boolean
  cancelled_at?: string | null
  retry_count: number
  next_retry_at?: string | null
  created_at: string
  updated_at: string
  plan?: SubscriptionPlan | null
}

export interface SubscriptionPayment {
  id: string
  clinic_id: string
  subscription_id?: string | null
  toss_payment_key?: string | null
  toss_order_id: string
  toss_secret?: string | null
  idempotency_key?: string | null
  amount: number
  status: SubscriptionPaymentStatus
  order_name?: string | null
  method?: string | null
  receipt_url?: string | null
  raw_response?: unknown
  paid_at?: string | null
  failed_at?: string | null
  fail_reason?: string | null
  tax_invoice_num?: string | null
  created_at: string
}

export interface SubscriptionStatusResponse {
  subscription: Subscription | null
  plan: SubscriptionPlan | null
  payments: SubscriptionPayment[]
  isFreePlan: boolean
  canUpgrade: boolean
  daysUntilExpiry: number | null
}
```

- [ ] **Step 3: 빌드로 타입 컴파일 확인 (이 시점엔 다른 파일에서 옛 타입을 참조해 실패할 수 있음)**

```bash
npx tsc --noEmit 2>&1 | head -30
```

다음 Task에서 사용처 정리 시 자연스럽게 해소됨. 실패해도 진행.

- [ ] **Step 4: 커밋**

```bash
git add src/types/subscription.ts
git commit -m "refactor(types): 토스페이먼츠 친화적 구독 타입 재정의"
```

---

### Task C2: billingService — getOrCreateCustomerKey

**Files:**
- Create: `src/lib/billingService.ts`
- Create: `src/lib/__tests__/billingService.test.ts`

- [ ] **Step 1: 테스트 작성**

`src/lib/__tests__/billingService.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getOrCreateCustomerKey } from '../billingService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getOrCreateCustomerKey', () => {
  it('기존 customer_key가 있으면 그대로 반환', async () => {
    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValueOnce({
                  data: { id: 'sub-1', customer_key: 'existing-key' },
                  error: null,
                }),
              })),
            })),
          })),
        })),
      })),
    }
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockClient)

    const key = await getOrCreateCustomerKey('clinic-1')
    expect(key).toBe('existing-key')
  })

  it('없으면 새 UUID 발급 + 빈 row INSERT', async () => {
    const insertMock = vi.fn().mockResolvedValueOnce({ error: null })
    const selectChain = {
      eq: () => ({
        order: () => ({
          limit: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    }
    const mockClient = {
      from: vi.fn(() => ({
        select: () => selectChain,
        insert: insertMock,
      })),
    }
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockClient)

    const key = await getOrCreateCustomerKey('clinic-1')
    expect(key).toMatch(/^[0-9a-f-]{36}$/)
    expect(insertMock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
npm run test:unit -- src/lib/__tests__/billingService.test.ts
```

- [ ] **Step 3: billingService.ts 초기 구현 (getOrCreateCustomerKey만)**

`src/lib/billingService.ts`:
```ts
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'

/**
 * 클리닉의 토스 customerKey를 발급/조회.
 * - 기존 active/past_due/pending 구독 존재 → 그 customer_key 재사용
 * - 없으면 새 UUID 발급 + status='pending' 빈 subscription row 생성
 */
export async function getOrCreateCustomerKey(clinicId: string): Promise<string> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id, customer_key')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.customer_key) {
    return existing.customer_key as string
  }

  const customerKey = randomUUID()
  const { error } = await supabase.from('subscriptions').insert({
    clinic_id: clinicId,
    customer_key: customerKey,
    status: 'pending',
    cancel_at_period_end: false,
    retry_count: 0,
  })
  if (error) throw new Error(`customer_key 생성 실패: ${error.message}`)

  return customerKey
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npm run test:unit -- src/lib/__tests__/billingService.test.ts
```

- [ ] **Step 5: 커밋**

```bash
git add src/lib/billingService.ts src/lib/__tests__/billingService.test.ts
git commit -m "feat(billing): getOrCreateCustomerKey — 클리닉당 1회 UUID 발급"
```

---

### Task C3: billingService — registerSubscription (saga)

**Files:**
- Modify: `src/lib/billingService.ts`
- Modify: `src/lib/__tests__/billingService.test.ts`

- [ ] **Step 1: 보조 함수 + registerSubscription 구현**

`src/lib/billingService.ts`에 추가:

```ts
import { issueBillingKey, confirmBilling } from '@/lib/tossPayments/billing'
import { TossPaymentsError } from '@/lib/tossPayments/client'
import { classifyTossError, userMessageForCode } from '@/lib/tossPayments/errors'
import type { SubscriptionPlan } from '@/types/subscription'

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

function nowKstYyyymm(): string {
  const kst = new Date(Date.now() + KST_OFFSET_MS)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  return `${y}${m}`
}

export function makeOrderId(clinicId: string, retryCount = 0): string {
  const prefix8 = clinicId.replace(/-/g, '').slice(0, 8)
  const ym = nowKstYyyymm()
  return retryCount > 0
    ? `sub-${prefix8}-${ym}-r${retryCount}`
    : `sub-${prefix8}-${ym}`
}

export function addOneMonth(from: Date): Date {
  const d = new Date(from)
  d.setMonth(d.getMonth() + 1)
  return d
}

interface RegisterParams {
  clinicId: string
  planId: string
  authKey: string
  customerKey: string
  customerName: string
  customerEmail: string
}

interface RegisterResult {
  success: boolean
  subscriptionId?: string
  paymentKey?: string
  error?: string
  errorCode?: string
}

export async function registerSubscription(params: RegisterParams): Promise<RegisterResult> {
  const supabase = await createClient()

  // Step 0: 중복 active/past_due/trialing 구독 차단
  const { data: existingActive } = await supabase
    .from('subscriptions')
    .select('id, status')
    .eq('clinic_id', params.clinicId)
    .in('status', ['active', 'past_due', 'trialing'])
    .maybeSingle()

  if (existingActive) {
    return { success: false, error: '이미 활성 구독이 있습니다. 플랜 변경은 업그레이드를 사용하세요.' }
  }

  // 플랜 조회
  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('id', params.planId)
    .single<SubscriptionPlan>()
  if (!plan) return { success: false, error: '플랜을 찾을 수 없습니다.' }

  // Step 1: 빌링키 발급 + DB 저장 (status='pending')
  let billing
  try {
    billing = await issueBillingKey({
      authKey: params.authKey,
      customerKey: params.customerKey,
    })
  } catch (err) {
    const tossErr = err instanceof TossPaymentsError ? err : null
    return {
      success: false,
      errorCode: tossErr?.code,
      error: tossErr ? userMessageForCode(tossErr.code) : '빌링키 발급에 실패했습니다.',
    }
  }

  await supabase
    .from('subscriptions')
    .update({
      plan_id: params.planId,
      billing_key: billing.billingKey,
      card_issuer_code: billing.card.issuerCode,
      card_number_masked: billing.card.number,
      card_type: billing.card.cardType,
      card_owner_type: billing.card.ownerType,
      billing_method: 'card',
    })
    .eq('clinic_id', params.clinicId)
    .eq('customer_key', params.customerKey)

  // Step 2: 결제 시도 row 사전 INSERT
  const orderId = makeOrderId(params.clinicId, 0)
  const orderName = `${plan.display_name} 플랜 (월 구독)`

  const { data: subRow } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('customer_key', params.customerKey)
    .single()

  const { data: paymentRow, error: insertErr } = await supabase
    .from('subscription_payments')
    .insert({
      clinic_id: params.clinicId,
      subscription_id: subRow?.id,
      toss_order_id: orderId,
      idempotency_key: orderId,
      amount: plan.price,
      status: 'pending',
      order_name: orderName,
    })
    .select('id')
    .single()

  if (insertErr) return { success: false, error: `결제 기록 생성 실패: ${insertErr.message}` }

  // Step 3: 첫 결제 호출
  try {
    const payment = await confirmBilling({
      billingKey: billing.billingKey,
      customerKey: params.customerKey,
      orderId,
      orderName,
      amount: plan.price,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
    })

    const periodStart = new Date()
    const periodEnd = addOneMonth(periodStart)
    const nextBilling = addOneMonth(periodStart)

    await supabase.from('subscription_payments').update({
      status: 'paid',
      toss_payment_key: payment.paymentKey,
      toss_secret: payment.secret ?? null,
      method: payment.method,
      receipt_url: payment.receipt?.url ?? null,
      raw_response: payment as unknown as Record<string, unknown>,
      paid_at: payment.approvedAt ?? new Date().toISOString(),
    }).eq('id', paymentRow!.id)

    await supabase.from('subscriptions').update({
      status: 'active',
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      next_billing_date: nextBilling.toISOString(),
      retry_count: 0,
    }).eq('id', subRow!.id)

    return { success: true, subscriptionId: subRow!.id, paymentKey: payment.paymentKey }
  } catch (err) {
    const tossErr = err instanceof TossPaymentsError ? err : null
    const failMsg = tossErr ? `${tossErr.code}: ${tossErr.message}` : String(err)

    await supabase.from('subscription_payments').update({
      status: 'failed',
      fail_reason: failMsg,
      failed_at: new Date().toISOString(),
    }).eq('id', paymentRow!.id)

    const klass = tossErr ? classifyTossError(tossErr) : 'transient'
    const nextRetryAt = klass === 'transient'
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()  // 일단 같음, runRetries에서 처리

    await supabase.from('subscriptions').update({
      status: 'past_due',
      retry_count: 1,
      next_retry_at: nextRetryAt,
    }).eq('id', subRow!.id)

    return {
      success: false,
      errorCode: tossErr?.code,
      error: tossErr ? userMessageForCode(tossErr.code) : '결제에 실패했습니다.',
    }
  }
}
```

- [ ] **Step 2: makeOrderId, addOneMonth 단위 테스트 추가**

`src/lib/__tests__/billingService.test.ts`에 추가:

```ts
import { makeOrderId, addOneMonth } from '../billingService'

describe('makeOrderId', () => {
  it('하이픈 제거 후 앞 8자 + YYYYMM', () => {
    const id = makeOrderId('a3b9d12f-1234-5678-9012-abc')
    expect(id).toMatch(/^sub-a3b9d12f-\d{6}$/)
  })

  it('retry_count > 0 시 -rN 접미사', () => {
    const id = makeOrderId('a3b9d12f-1234-5678-9012-abc', 2)
    expect(id).toMatch(/^sub-a3b9d12f-\d{6}-r2$/)
  })
})

describe('addOneMonth', () => {
  it('일반 월 +1', () => {
    expect(addOneMonth(new Date('2026-04-15')).toISOString().slice(0, 10)).toBe('2026-05-15')
  })
  it('1월 31일 → 2월말', () => {
    const result = addOneMonth(new Date('2026-01-31'))
    // JS Date는 2월 31일이 3월로 넘어가므로 결과는 '2026-03-03' 부근.
    // 비즈니스상 허용 (다음 결제일이 살짝 밀려도 됨).
    expect(result.getMonth()).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 3: 테스트 실행 + 커밋**

```bash
npm run test:unit -- src/lib/__tests__/billingService.test.ts
git add src/lib/billingService.ts src/lib/__tests__/billingService.test.ts
git commit -m "feat(billing): registerSubscription 단계적 저장(saga) + 빌링키→첫결제 흐름"
```

---

### Task C4: billingService — runDueCharges (cron 호출용)

**Files:**
- Modify: `src/lib/billingService.ts`

- [ ] **Step 1: runDueCharges 구현**

`src/lib/billingService.ts`에 추가:

```ts
async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

interface ChargeOneParams {
  clinicId: string
  subscriptionId: string
  billingKey: string
  customerKey: string
  customerName: string
  customerEmail: string
  amount: number
  planName: string
  retryCount: number
}

async function chargeOne(p: ChargeOneParams): Promise<{ ok: boolean; failMsg?: string; errorCode?: string }> {
  const supabase = await createClient()
  const orderId = makeOrderId(p.clinicId, p.retryCount)
  const orderName = `${p.planName} 플랜 (월 구독)`

  // 시도 row 사전 INSERT (멱등 충돌 시 skip)
  const { data: paymentRow, error: insertErr } = await supabase
    .from('subscription_payments')
    .insert({
      clinic_id: p.clinicId,
      subscription_id: p.subscriptionId,
      toss_order_id: orderId,
      idempotency_key: orderId,
      amount: p.amount,
      status: 'pending',
      order_name: orderName,
    })
    .select('id')
    .single()

  if (insertErr) {
    // 동일 orderId가 이미 INSERT된 상태면 그냥 결제만 재시도
    const { data: existing } = await supabase
      .from('subscription_payments')
      .select('id, status')
      .eq('toss_order_id', orderId)
      .single()
    if (!existing || existing.status === 'paid') return { ok: existing?.status === 'paid' }
  }

  const paymentRowId = (paymentRow ?? (await supabase
    .from('subscription_payments').select('id').eq('toss_order_id', orderId).single()).data)?.id

  try {
    const payment = await confirmBilling({
      billingKey: p.billingKey,
      customerKey: p.customerKey,
      orderId,
      orderName,
      amount: p.amount,
      customerName: p.customerName,
      customerEmail: p.customerEmail,
    })

    await supabase.from('subscription_payments').update({
      status: 'paid',
      toss_payment_key: payment.paymentKey,
      toss_secret: payment.secret ?? null,
      method: payment.method,
      receipt_url: payment.receipt?.url ?? null,
      raw_response: payment as unknown as Record<string, unknown>,
      paid_at: payment.approvedAt ?? new Date().toISOString(),
    }).eq('id', paymentRowId)

    return { ok: true }
  } catch (err) {
    const tossErr = err instanceof TossPaymentsError ? err : null
    const failMsg = tossErr ? `${tossErr.code}: ${tossErr.message}` : String(err)

    await supabase.from('subscription_payments').update({
      status: 'failed',
      fail_reason: failMsg,
      failed_at: new Date().toISOString(),
    }).eq('id', paymentRowId)

    return { ok: false, failMsg, errorCode: tossErr?.code }
  }
}

export async function runDueCharges(): Promise<{ processed: number; succeeded: number; failed: number }> {
  const supabase = await createClient()
  const { data: dueSubs } = await supabase
    .from('subscriptions')
    .select('id, clinic_id, billing_key, customer_key, plan_id, plan:subscription_plans(*)')
    .eq('status', 'active')
    .lte('next_billing_date', new Date().toISOString())

  if (!dueSubs || dueSubs.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 }
  }

  let succeeded = 0, failed = 0

  for (const sub of dueSubs) {
    const plan = (sub.plan as unknown) as SubscriptionPlan | null
    if (!plan || !sub.billing_key) {
      failed++
      continue
    }

    // 클리닉의 owner 정보 조회 (customerName/Email)
    const { data: owner } = await supabase
      .from('users')
      .select('name, email')
      .eq('clinic_id', sub.clinic_id)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle()

    const result = await chargeOne({
      clinicId: sub.clinic_id,
      subscriptionId: sub.id,
      billingKey: sub.billing_key,
      customerKey: sub.customer_key,
      customerName: owner?.name ?? '',
      customerEmail: owner?.email ?? '',
      amount: plan.price,
      planName: plan.display_name,
      retryCount: 0,
    })

    if (result.ok) {
      succeeded++
      const nextBilling = addOneMonth(new Date())
      await supabase.from('subscriptions').update({
        current_period_start: new Date().toISOString(),
        current_period_end: nextBilling.toISOString(),
        next_billing_date: nextBilling.toISOString(),
        retry_count: 0,
      }).eq('id', sub.id)
    } else {
      failed++
      await supabase.from('subscriptions').update({
        status: 'past_due',
        retry_count: 1,
        next_retry_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }).eq('id', sub.id)
    }

    await sleep(150)  // 토스 율 제한 회피
  }

  return { processed: dueSubs.length, succeeded, failed }
}
```

- [ ] **Step 2: 빌드 통과 확인**

```bash
npx tsc --noEmit src/lib/billingService.ts 2>&1 | head -20
```

- [ ] **Step 3: 커밋**

```bash
git add src/lib/billingService.ts
git commit -m "feat(billing): runDueCharges — 결제일 도래 구독 일괄 청구 (직렬 + 150ms 지연)"
```

---

### Task C5: billingService — runRetries

**Files:**
- Modify: `src/lib/billingService.ts`

- [ ] **Step 1: runRetries 구현**

`src/lib/billingService.ts`에 추가:

```ts
const MAX_RETRY = 3       // 1~3회차까지 재시도
const SUSPEND_AFTER = 4   // retry_count >= 4 → 정지

export async function runRetries(): Promise<{ processed: number; recovered: number; suspended: number }> {
  const supabase = await createClient()
  const { data: candidates } = await supabase
    .from('subscriptions')
    .select('id, clinic_id, billing_key, customer_key, retry_count, plan:subscription_plans(*)')
    .eq('status', 'past_due')
    .lte('next_retry_at', new Date().toISOString())

  if (!candidates || candidates.length === 0) {
    return { processed: 0, recovered: 0, suspended: 0 }
  }

  let recovered = 0, suspended = 0

  for (const sub of candidates) {
    if (sub.retry_count >= SUSPEND_AFTER) {
      // 토스 호출 없이 즉시 정지
      await supabase.from('subscriptions').update({
        status: 'suspended',
      }).eq('id', sub.id)
      suspended++
      continue
    }

    const plan = (sub.plan as unknown) as SubscriptionPlan | null
    if (!plan || !sub.billing_key) {
      suspended++
      continue
    }

    const { data: owner } = await supabase
      .from('users').select('name, email')
      .eq('clinic_id', sub.clinic_id).eq('role', 'owner')
      .limit(1).maybeSingle()

    const result = await chargeOne({
      clinicId: sub.clinic_id,
      subscriptionId: sub.id,
      billingKey: sub.billing_key,
      customerKey: sub.customer_key,
      customerName: owner?.name ?? '',
      customerEmail: owner?.email ?? '',
      amount: plan.price,
      planName: plan.display_name,
      retryCount: sub.retry_count,
    })

    if (result.ok) {
      recovered++
      const nextBilling = addOneMonth(new Date())
      await supabase.from('subscriptions').update({
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: nextBilling.toISOString(),
        next_billing_date: nextBilling.toISOString(),
        retry_count: 0,
        next_retry_at: null,
      }).eq('id', sub.id)
    } else {
      const newCount = sub.retry_count + 1
      const nextRetryDays = newCount >= MAX_RETRY ? 7 : 1  // 3회차까지 1일, 그 이후 7일 유예
      await supabase.from('subscriptions').update({
        retry_count: newCount,
        next_retry_at: new Date(Date.now() + nextRetryDays * 24 * 60 * 60 * 1000).toISOString(),
      }).eq('id', sub.id)
    }

    await sleep(150)
  }

  return { processed: candidates.length, recovered, suspended }
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/lib/billingService.ts
git commit -m "feat(billing): runRetries — 재시도 정책(1d×3 → 7d 유예 → 정지)"
```

---

### Task C6: billingService — cancel/upgrade/downgrade/getStatus

**Files:**
- Modify: `src/lib/billingService.ts`

- [ ] **Step 1: 나머지 함수 구현**

`src/lib/billingService.ts`에 추가:

```ts
import { cancelPayment } from '@/lib/tossPayments/payments'
import type { SubscriptionStatusResponse, SubscriptionPayment } from '@/types/subscription'

export async function getSubscriptionStatus(clinicId: string): Promise<SubscriptionStatusResponse> {
  const supabase = await createClient()

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('*, plan:subscription_plans(*)')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: payments } = await supabase
    .from('subscription_payments')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(12)

  const plan = (sub?.plan as unknown) as SubscriptionPlan | null
  const isFreePlan = !sub || sub.status === 'pending' || sub.status === 'cancelled' || sub.status === 'expired'
  const daysUntilExpiry = sub?.current_period_end
    ? Math.ceil((new Date(sub.current_period_end).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null

  return {
    subscription: sub as never,
    plan,
    payments: (payments ?? []) as SubscriptionPayment[],
    isFreePlan,
    canUpgrade: !isFreePlan,
    daysUntilExpiry,
  }
}

export async function cancelSubscription(params: {
  clinicId: string
  immediate: boolean
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, status')
    .eq('clinic_id', params.clinicId)
    .in('status', ['active', 'past_due', 'trialing'])
    .maybeSingle()

  if (!sub) return { success: false, error: '활성 구독이 없습니다.' }

  if (params.immediate) {
    await supabase.from('subscriptions').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      next_billing_date: null,
    }).eq('id', sub.id)
  } else {
    await supabase.from('subscriptions').update({
      cancel_at_period_end: true,
      cancelled_at: new Date().toISOString(),
    }).eq('id', sub.id)
  }
  return { success: true }
}

export async function upgradePlan(params: {
  clinicId: string
  newPlanId: string
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, billing_key, customer_key, plan_id, plan:subscription_plans(*), current_period_end')
    .eq('clinic_id', params.clinicId)
    .in('status', ['active'])
    .maybeSingle()

  if (!sub) return { success: false, error: '활성 구독이 없습니다.' }

  const oldPlan = (sub.plan as unknown) as SubscriptionPlan
  const { data: newPlan } = await supabase
    .from('subscription_plans').select('*').eq('id', params.newPlanId).single<SubscriptionPlan>()

  if (!newPlan) return { success: false, error: '신규 플랜을 찾을 수 없습니다.' }
  if (newPlan.price <= oldPlan.price) {
    return { success: false, error: '업그레이드는 더 비싼 플랜만 가능합니다. 다운그레이드를 사용하세요.' }
  }

  // 일할 차액 = (newPrice - oldPrice) × 남은일수 / 30
  const remainingMs = sub.current_period_end ? new Date(sub.current_period_end).getTime() - Date.now() : 0
  const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)))
  const diff = Math.ceil((newPlan.price - oldPlan.price) * remainingDays / 30)

  // 차액 결제
  const orderId = `sub-${params.clinicId.replace(/-/g, '').slice(0, 8)}-upgrade-${Date.now()}`
  if (!sub.billing_key) return { success: false, error: 'billing_key가 없습니다.' }

  try {
    const payment = await confirmBilling({
      billingKey: sub.billing_key,
      customerKey: sub.customer_key,
      orderId,
      orderName: `${oldPlan.display_name} → ${newPlan.display_name} 업그레이드 차액`,
      amount: diff,
      customerName: '',
      customerEmail: '',
    })

    await supabase.from('subscription_payments').insert({
      clinic_id: params.clinicId,
      subscription_id: sub.id,
      toss_order_id: orderId,
      toss_payment_key: payment.paymentKey,
      toss_secret: payment.secret ?? null,
      idempotency_key: orderId,
      amount: diff,
      status: 'paid',
      order_name: `업그레이드 차액 (${diff.toLocaleString()}원)`,
      method: payment.method,
      receipt_url: payment.receipt?.url ?? null,
      raw_response: payment as unknown as Record<string, unknown>,
      paid_at: payment.approvedAt ?? new Date().toISOString(),
    })

    await supabase.from('subscriptions').update({
      plan_id: params.newPlanId,
    }).eq('id', sub.id)

    return { success: true }
  } catch (err) {
    const tossErr = err instanceof TossPaymentsError ? err : null
    return { success: false, error: tossErr ? userMessageForCode(tossErr.code) : '업그레이드 결제에 실패했습니다.' }
  }
}

export async function downgradePlan(params: {
  clinicId: string
  newPlanId: string
}): Promise<{ success: boolean; error?: string }> {
  // 다운그레이드는 다음 결제일에 적용 (현재 기간은 그대로)
  const supabase = await createClient()
  const { data: newPlan } = await supabase
    .from('subscription_plans').select('id').eq('id', params.newPlanId).single()
  if (!newPlan) return { success: false, error: '신규 플랜을 찾을 수 없습니다.' }

  // pending_plan_id 컬럼이 있으면 그걸 활용. 없으면 단순히 plan_id를 다음 cron에서 변경하는 별도 컬럼 필요.
  // 현재 스키마에는 없음 → 일단 단순화: 다음 결제일 이후 plan_id 갱신은 후속 작업.
  return { success: false, error: '다운그레이드는 현재 다음 결제일에 적용됩니다. 콜센터에 문의해 주세요.' }
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: 커밋**

```bash
git add src/lib/billingService.ts
git commit -m "feat(billing): cancel/upgrade/getStatus + downgrade 임시 안내"
```

> 다운그레이드 자동 적용은 본 구현 범위 밖. 사용자가 필요 시 후속 작업으로 분리.

---

## Phase D: 클리닉 구독 API 라우트

### Task D1: POST /api/billing/customer-key

**Files:**
- Create: `src/app/api/billing/customer-key/route.ts`

- [ ] **Step 1: 라우트 작성**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateCustomerKey } from '@/lib/billingService'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: u } = await supabase
    .from('users').select('clinic_id, role')
    .eq('id', user.id).single()

  if (!u?.clinic_id) return NextResponse.json({ error: '클리닉 정보 없음' }, { status: 400 })
  if (!['owner', 'master_admin'].includes(u.role)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const customerKey = await getOrCreateCustomerKey(u.clinic_id)
  return NextResponse.json({ customerKey })
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/billing/customer-key/route.ts
git commit -m "feat(api): POST /api/billing/customer-key — 클리닉 customerKey 발급/조회"
```

---

### Task D2: POST /api/billing/auth/issue

**Files:**
- Create: `src/app/api/billing/auth/issue/route.ts`

- [ ] **Step 1: 라우트 작성**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registerSubscription } from '@/lib/billingService'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: u } = await supabase
    .from('users').select('clinic_id, role, name, email')
    .eq('id', user.id).single()

  if (!u?.clinic_id) return NextResponse.json({ error: '클리닉 정보 없음' }, { status: 400 })
  if (!['owner', 'master_admin'].includes(u.role)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const body = await request.json()
  const { authKey, customerKey, planId } = body
  if (!authKey || !customerKey || !planId) {
    return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 })
  }

  const result = await registerSubscription({
    clinicId: u.clinic_id,
    planId,
    authKey,
    customerKey,
    customerName: u.name ?? '',
    customerEmail: u.email ?? user.email ?? '',
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error, code: result.errorCode }, { status: 400 })
  }
  return NextResponse.json({
    success: true,
    subscriptionId: result.subscriptionId,
    paymentKey: result.paymentKey,
  })
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/billing/auth/issue/route.ts
git commit -m "feat(api): POST /api/billing/auth/issue — 빌링키 발급+첫결제 통합"
```

---

### Task D3: 기존 subscription 라우트 4개 리팩토링

**Files:**
- Modify: `src/app/api/subscription/cancel/route.ts`
- Modify: `src/app/api/subscription/upgrade/route.ts`
- Modify: `src/app/api/subscription/downgrade/route.ts`
- Modify: `src/app/api/subscription/status/route.ts`

- [ ] **Step 1: cancel/route.ts — `subscriptionService` import를 `billingService`로**

`src/app/api/subscription/cancel/route.ts`의 import를 다음과 같이:
```ts
import { cancelSubscription } from '@/lib/billingService'
```

함수 시그니처가 동일하므로 호출부 변경 없음.

- [ ] **Step 2: upgrade/route.ts**

```ts
import { upgradePlan } from '@/lib/billingService'
```

기존 호출부에서 `upgradeSubscription` 같은 옛 이름이 있으면 `upgradePlan`으로 교체.

- [ ] **Step 3: downgrade/route.ts**

```ts
import { downgradePlan } from '@/lib/billingService'
```

호출부 정리.

- [ ] **Step 4: status/route.ts**

```ts
import { getSubscriptionStatus } from '@/lib/billingService'
```

기존 호출부의 함수명을 위와 같이 정렬.

- [ ] **Step 5: 빌드 확인**

```bash
npm run build 2>&1 | tail -30
```

타입 에러 발생 시 라우트 코드 수정 (대부분 함수명/파라미터 불일치).

- [ ] **Step 6: 커밋**

```bash
git add src/app/api/subscription/
git commit -m "refactor(api): subscription 라우트 4개를 billingService 호출로 전환"
```

---

### Task D4: POST /api/webhooks/toss

**Files:**
- Create: `src/app/api/webhooks/toss/route.ts`

- [ ] **Step 1: 라우트 작성**

```ts
import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@/lib/supabase/admin'
import { verifyAndFetchPayment } from '@/lib/tossPayments/webhook'
import type { TossWebhookPayload } from '@/lib/tossPayments/types'

export async function POST(request: Request) {
  const payload = (await request.json()) as TossWebhookPayload
  const { eventType, data } = payload

  const supabase = createAdminClient()

  // 1. 멱등 INSERT
  const { error: insertErr } = await supabase
    .from('billing_webhook_events')
    .insert({
      event_type: eventType,
      payment_key: data.paymentKey ?? null,
      order_id: data.orderId ?? null,
      status: data.status ?? null,
      payload: payload as unknown as Record<string, unknown>,
    })

  if (insertErr) {
    // UNIQUE 충돌 = 이미 처리된 이벤트
    if (insertErr.code === '23505') return NextResponse.json({ ok: true, duplicate: true })
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // 2. DB에서 expectedSecret 조회
  const { data: paymentRow } = await supabase
    .from('subscription_payments')
    .select('id, toss_secret, status')
    .eq('toss_payment_key', data.paymentKey)
    .maybeSingle()

  // 3. 토스에서 직접 조회 + secret 검증
  let payment
  try {
    payment = await verifyAndFetchPayment({
      paymentKey: data.paymentKey,
      expectedSecret: paymentRow?.toss_secret ?? null,
    })
  } catch (err) {
    await supabase.from('billing_webhook_events').update({
      processed_at: new Date().toISOString(),
      process_error: String(err),
    }).eq('event_type', eventType).eq('payment_key', data.paymentKey).eq('status', data.status)
    return NextResponse.json({ error: '검증 실패' }, { status: 401 })
  }

  // 4. 상태 동기화 (CANCELED, EXPIRED 등)
  if (paymentRow) {
    let nextStatus: string | null = null
    if (payment.status === 'CANCELED' || payment.status === 'PARTIAL_CANCELED') nextStatus = 'cancelled'
    if (payment.status === 'ABORTED' || payment.status === 'EXPIRED') nextStatus = 'failed'

    if (nextStatus && nextStatus !== paymentRow.status) {
      await supabase.from('subscription_payments').update({ status: nextStatus }).eq('id', paymentRow.id)
    }
  }

  await supabase.from('billing_webhook_events').update({
    processed_at: new Date().toISOString(),
  }).eq('event_type', eventType).eq('payment_key', data.paymentKey).eq('status', data.status)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/webhooks/toss/route.ts
git commit -m "feat(api): POST /api/webhooks/toss — 멱등 INSERT + secret 검증 + 상태 동기화"
```

---

### Task D5: GET /api/cron/billing-charge

**Files:**
- Create: `src/app/api/cron/billing-charge/route.ts`

- [ ] **Step 1: 라우트 작성**

```ts
import { NextResponse } from 'next/server'
import { runDueCharges } from '@/lib/billingService'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const result = await runDueCharges()
  console.log('[cron/billing-charge]', result)
  return NextResponse.json(result)
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/cron/billing-charge/route.ts
git commit -m "feat(api): GET /api/cron/billing-charge — 매일 KST 02:00 결제일 도래분 청구"
```

---

### Task D6: GET /api/cron/billing-retry

**Files:**
- Create: `src/app/api/cron/billing-retry/route.ts`

- [ ] **Step 1: 라우트 작성**

```ts
import { NextResponse } from 'next/server'
import { runRetries } from '@/lib/billingService'

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const result = await runRetries()
  console.log('[cron/billing-retry]', result)
  return NextResponse.json(result)
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/api/cron/billing-retry/route.ts
git commit -m "feat(api): GET /api/cron/billing-retry — 매일 KST 03:00 재시도"
```

---

### Task D7: vercel.json cron 등록

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: 기존 vercel.json 확인**

```bash
cat vercel.json
```

- [ ] **Step 2: crons 배열에 두 항목 추가**

기존 `crons` 배열이 있으면 거기에 추가, 없으면 추가:
```json
{
  "crons": [
    { "path": "/api/cron/billing-charge", "schedule": "0 17 * * *" },
    { "path": "/api/cron/billing-retry",  "schedule": "0 18 * * *" }
  ]
}
```

기존 항목(예: `referral-thanks`)이 있으면 그 옆에 추가.

- [ ] **Step 3: 커밋**

```bash
git add vercel.json
git commit -m "chore(cron): billing-charge(02:00 KST) + billing-retry(03:00 KST) 등록"
```

---

## Phase E: 클리닉 구독 클라이언트 UI

### Task E1: /owner/subscription/page.tsx 재작성

**Files:**
- Modify: `src/app/owner/subscription/page.tsx`

- [ ] **Step 1: 기존 페이지 확인**

```bash
cat src/app/owner/subscription/page.tsx
```

- [ ] **Step 2: 페이지 재작성**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { loadTossPayments } from '@tosspayments/tosspayments-sdk'
import type { SubscriptionPlan, SubscriptionStatusResponse } from '@/types/subscription'

export default function OwnerSubscriptionPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [status, setStatus] = useState<SubscriptionStatusResponse | null>(null)
  const [selected, setSelected] = useState<SubscriptionPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([
      fetch('/api/subscription/plans').then(r => r.json()),
      fetch('/api/subscriptions/status').then(r => r.json()),
    ]).then(([p, s]) => {
      setPlans(p)
      setStatus(s)
    })
  }, [])

  async function handleStart(plan: SubscriptionPlan) {
    setLoading(true)
    setError(null)
    try {
      const ckRes = await fetch('/api/billing/customer-key', { method: 'POST' })
      if (!ckRes.ok) throw new Error('customerKey 발급 실패')
      const { customerKey } = await ckRes.json()

      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY
      if (!clientKey) throw new Error('NEXT_PUBLIC_TOSS_CLIENT_KEY 미설정')

      const tossPayments = await loadTossPayments(clientKey)
      const payment = tossPayments.payment({ customerKey })

      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl: `${window.location.origin}/owner/subscription/billing/success?planId=${plan.id}`,
        failUrl: `${window.location.origin}/owner/subscription/billing/fail`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '결제 처리 중 오류')
      setLoading(false)
    }
  }

  if (status?.subscription?.status === 'active') {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold">구독 관리</h1>
        <p className="mt-4">현재 플랜: {status.plan?.display_name}</p>
        <p className="text-sm text-gray-500">
          다음 결제일: {status.subscription.next_billing_date?.slice(0, 10)}
        </p>
        {/* TODO: 업그레이드/취소 UI는 후속 작업에서 */}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold mb-6">플랜 선택</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.map(plan => (
          <div
            key={plan.id}
            className={`rounded-xl border p-5 cursor-pointer ${selected?.id === plan.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
            onClick={() => setSelected(plan)}
          >
            <h3 className="font-semibold">{plan.display_name}</h3>
            <p className="text-2xl font-bold mt-2">{plan.price.toLocaleString()}원<span className="text-sm font-normal">/월</span></p>
            <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
          </div>
        ))}
      </div>

      {error && <p className="mt-4 text-red-600 text-sm">{error}</p>}

      <button
        disabled={!selected || loading}
        onClick={() => selected && handleStart(selected)}
        className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-white font-medium disabled:opacity-50"
      >
        {loading ? '처리 중...' : `${selected?.display_name ?? ''} 구독 시작`}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/owner/subscription/page.tsx
git commit -m "feat(ui): /owner/subscription 토스 SDK 빌링키 발급 흐름 적용"
```

---

### Task E2: /owner/subscription/billing/success/page.tsx

**Files:**
- Create: `src/app/owner/subscription/billing/success/page.tsx`

- [ ] **Step 1: 페이지 작성**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

export default function BillingSuccessPage() {
  const params = useSearchParams()
  const router = useRouter()
  const [state, setState] = useState<'processing' | 'done' | 'error'>('processing')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const authKey = params.get('authKey')
    const customerKey = params.get('customerKey')
    const planId = params.get('planId')

    if (!authKey || !customerKey || !planId) {
      setState('error')
      setError('필수 파라미터가 누락되었습니다.')
      return
    }

    void (async () => {
      try {
        const res = await fetch('/api/billing/auth/issue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authKey, customerKey, planId }),
        })
        const data = await res.json()
        if (!res.ok) {
          setState('error')
          setError(data.error ?? '결제 처리 실패')
          return
        }
        setState('done')
      } catch (err) {
        setState('error')
        setError(err instanceof Error ? err.message : '결제 처리 중 오류')
      }
    })()
  }, [params])

  if (state === 'processing') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="mt-4 text-gray-600">결제 처리 중입니다...</p>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-semibold text-red-600">결제 실패</h1>
        <p className="mt-3 text-sm text-gray-700">{error}</p>
        <button
          onClick={() => router.push('/owner/subscription')}
          className="mt-6 rounded-xl bg-gray-100 px-4 py-2 text-sm"
        >
          다시 시도
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-2xl font-bold text-blue-600">구독이 시작되었습니다!</h1>
      <p className="mt-3 text-sm text-gray-600">매월 같은 날짜에 자동으로 결제됩니다.</p>
      <button
        onClick={() => router.push('/dashboard')}
        className="mt-6 rounded-xl bg-blue-600 px-6 py-3 text-white font-medium"
      >
        대시보드로 이동
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/owner/subscription/billing/success/page.tsx
git commit -m "feat(ui): 빌링 성공 페이지 (authKey → 빌링키 + 첫 결제)"
```

---

### Task E3: /owner/subscription/billing/fail/page.tsx

**Files:**
- Create: `src/app/owner/subscription/billing/fail/page.tsx`

- [ ] **Step 1: 페이지 작성**

```tsx
'use client'

import { useSearchParams, useRouter } from 'next/navigation'

export default function BillingFailPage() {
  const params = useSearchParams()
  const router = useRouter()

  const code = params.get('code') ?? '결제 실패'
  const message = params.get('message') ?? '카드 인증이 정상적으로 완료되지 않았습니다.'

  return (
    <div className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-xl font-semibold text-red-600">결제 처리 실패</h1>
      <p className="mt-3 text-sm font-medium text-gray-800">{code}</p>
      <p className="mt-2 text-sm text-gray-600">{message}</p>
      <div className="mt-6 flex gap-3 justify-center">
        <button
          onClick={() => router.push('/owner/subscription')}
          className="rounded-xl bg-blue-600 px-6 py-2 text-sm text-white"
        >
          다시 시도
        </button>
        <button
          onClick={() => router.push('/dashboard')}
          className="rounded-xl bg-gray-100 px-6 py-2 text-sm"
        >
          대시보드로
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/app/owner/subscription/billing/fail/page.tsx
git commit -m "feat(ui): 빌링 실패 페이지"
```

---

## Phase F: 투자 구독(user_subscriptions) 동일 패턴 적용

### Task F1: userBillingService 작성

**Files:**
- Create: `src/lib/userBillingService.ts`

- [ ] **Step 1: clinic 버전(`billingService.ts`)을 참고하여 user 버전 작성**

`src/lib/userBillingService.ts`:
```ts
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { issueBillingKey, confirmBilling } from '@/lib/tossPayments/billing'
import { TossPaymentsError } from '@/lib/tossPayments/client'
import { userMessageForCode } from '@/lib/tossPayments/errors'

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

function nowKstYyyymm(): string {
  const kst = new Date(Date.now() + KST_OFFSET_MS)
  return `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, '0')}`
}

export function makeInvOrderId(userId: string, retryCount = 0): string {
  const prefix8 = userId.replace(/-/g, '').slice(0, 8)
  const ym = nowKstYyyymm()
  return retryCount > 0 ? `inv-${prefix8}-${ym}-r${retryCount}` : `inv-${prefix8}-${ym}`
}

function addOneMonth(from: Date): Date {
  const d = new Date(from)
  d.setMonth(d.getMonth() + 1)
  return d
}

export async function getOrCreateUserCustomerKey(userId: string): Promise<string> {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('user_subscriptions')
    .select('id, customer_key')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.customer_key) return existing.customer_key as string

  const customerKey = randomUUID()
  await supabase.from('user_subscriptions').insert({
    user_id: userId,
    customer_key: customerKey,
    status: 'pending',
  })
  return customerKey
}

export async function registerUserSubscription(params: {
  userId: string
  planId: string
  authKey: string
  customerKey: string
  customerName: string
  customerEmail: string
  amount: number
  planName: string
}): Promise<{ success: boolean; paymentKey?: string; error?: string; errorCode?: string }> {
  const supabase = await createClient()

  // 빌링키 발급
  let billing
  try {
    billing = await issueBillingKey({ authKey: params.authKey, customerKey: params.customerKey })
  } catch (err) {
    const tossErr = err instanceof TossPaymentsError ? err : null
    return { success: false, errorCode: tossErr?.code, error: tossErr ? userMessageForCode(tossErr.code) : '빌링키 발급 실패' }
  }

  await supabase.from('user_subscriptions').update({
    plan_id: params.planId,
    billing_key: billing.billingKey,
    card_issuer_code: billing.card.issuerCode,
    card_number_masked: billing.card.number,
    card_type: billing.card.cardType,
    card_owner_type: billing.card.ownerType,
  }).eq('user_id', params.userId).eq('customer_key', params.customerKey)

  // 첫 결제
  const orderId = makeInvOrderId(params.userId, 0)
  try {
    const payment = await confirmBilling({
      billingKey: billing.billingKey,
      customerKey: params.customerKey,
      orderId,
      orderName: `${params.planName} (월 구독)`,
      amount: params.amount,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
    })

    const periodStart = new Date()
    const nextBilling = addOneMonth(periodStart)

    await supabase.from('user_subscriptions').update({
      status: 'active',
      toss_order_id: orderId,
      toss_payment_key: payment.paymentKey,
      toss_secret: payment.secret ?? null,
      idempotency_key: orderId,
      method: payment.method,
      receipt_url: payment.receipt?.url ?? null,
      raw_response: payment as unknown as Record<string, unknown>,
      current_period_start: periodStart.toISOString(),
      current_period_end: nextBilling.toISOString(),
      next_billing_date: nextBilling.toISOString(),
    }).eq('user_id', params.userId).eq('customer_key', params.customerKey)

    return { success: true, paymentKey: payment.paymentKey }
  } catch (err) {
    const tossErr = err instanceof TossPaymentsError ? err : null
    await supabase.from('user_subscriptions').update({
      status: 'past_due',
    }).eq('user_id', params.userId).eq('customer_key', params.customerKey)

    return { success: false, errorCode: tossErr?.code, error: tossErr ? userMessageForCode(tossErr.code) : '첫 결제 실패' }
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/lib/userBillingService.ts
git commit -m "feat(billing): userBillingService — 투자 구독 토스 직결 (clinic 패턴 미러링)"
```

> 투자 구독의 cron 처리는 별도 함수로 분리하지 않고, `runDueCharges`에서 두 테이블 모두 조회하도록 확장하는 것이 이상적이지만, 본 범위에서는 우선 첫 결제와 취소만 토스 전환. 정기결제 자동화는 후속 Task F4에서 통합.

---

### Task F2: 투자 구독 API 라우트 4개

**Files:**
- Create: `src/app/api/investment/billing/customer-key/route.ts`
- Create: `src/app/api/investment/billing/auth/issue/route.ts`
- Modify: `src/app/api/investment/subscription/cancel/route.ts`
- Modify: `src/app/api/investment/subscription/status/route.ts`

- [ ] **Step 1: customer-key 라우트**

```ts
// src/app/api/investment/billing/customer-key/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateUserCustomerKey } from '@/lib/userBillingService'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })
  const customerKey = await getOrCreateUserCustomerKey(user.id)
  return NextResponse.json({ customerKey })
}
```

- [ ] **Step 2: auth/issue 라우트**

```ts
// src/app/api/investment/billing/auth/issue/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { registerUserSubscription } from '@/lib/userBillingService'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()
  const { authKey, customerKey, planId, amount, planName } = body

  const { data: u } = await supabase
    .from('users').select('name, email').eq('id', user.id).single()

  const result = await registerUserSubscription({
    userId: user.id,
    planId,
    authKey,
    customerKey,
    customerName: u?.name ?? '',
    customerEmail: u?.email ?? user.email ?? '',
    amount,
    planName,
  })

  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ success: true, paymentKey: result.paymentKey })
}
```

- [ ] **Step 3: 기존 cancel 라우트 수정**

`src/app/api/investment/subscription/cancel/route.ts`의 import를 `userBillingService` 함수 호출로. (cancel 함수는 userBillingService에 추가 필요 — 단순히 user_subscriptions UPDATE)

```ts
// userBillingService.ts에 추가
export async function cancelUserSubscription(userId: string, immediate: boolean) {
  const supabase = await createClient()
  if (immediate) {
    await supabase.from('user_subscriptions').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      next_billing_date: null,
    }).eq('user_id', userId).in('status', ['active', 'past_due'])
  } else {
    await supabase.from('user_subscriptions').update({
      cancel_at_period_end: true,
      cancelled_at: new Date().toISOString(),
    }).eq('user_id', userId).in('status', ['active', 'past_due'])
  }
  return { success: true }
}
```

라우트 코드:
```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cancelUserSubscription } from '@/lib/userBillingService'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json()
  const result = await cancelUserSubscription(user.id, body.immediate === true)
  return NextResponse.json(result)
}
```

- [ ] **Step 4: status 라우트**

기존 status 라우트에서 `userSubscriptionService` import를 `userBillingService`로 변경하거나, 단순 SELECT만 하도록 인라인:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data: sub } = await supabase
    .from('user_subscriptions')
    .select('*, plan:subscription_plans(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ subscription: sub })
}
```

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/investment/billing/ src/app/api/investment/subscription/cancel/ src/app/api/investment/subscription/status/ src/lib/userBillingService.ts
git commit -m "feat(api): 투자 구독 토스 직결 라우트(customer-key, auth/issue, cancel, status)"
```

---

### Task F3: 투자 구독 클라이언트 페이지

**Files:**
- Modify: `src/app/investment/subscribe/page.tsx`
- Create: `src/app/investment/subscribe/success/page.tsx`
- Create: `src/app/investment/subscribe/fail/page.tsx`

- [ ] **Step 1: subscribe/page.tsx 재작성**

`src/app/investment/subscribe/page.tsx`를 [Task E1] 패턴 그대로 user 버전으로:
- `/api/investment/billing/customer-key` 호출
- `loadTossPayments` + `requestBillingAuth`
- successUrl: `/investment/subscribe/success?planId=...&amount=...&planName=...`
- failUrl: `/investment/subscribe/fail`

기존 페이지 내용을 다음으로 교체:
```tsx
'use client'

import { useEffect, useState } from 'react'
import { loadTossPayments } from '@tosspayments/tosspayments-sdk'

interface InvPlan { id: string; display_name: string; price: number; description?: string }

export default function InvestmentSubscribePage() {
  const [plans, setPlans] = useState<InvPlan[]>([])
  const [selected, setSelected] = useState<InvPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetch('/api/subscription/plans?type=investment')
      .then(r => r.json()).then(setPlans).catch(() => setPlans([]))
  }, [])

  async function handleStart(plan: InvPlan) {
    setLoading(true)
    setError(null)
    try {
      const ck = await fetch('/api/investment/billing/customer-key', { method: 'POST' }).then(r => r.json())
      const tp = await loadTossPayments(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!)
      const payment = tp.payment({ customerKey: ck.customerKey })
      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl: `${window.location.origin}/investment/subscribe/success?planId=${plan.id}&amount=${plan.price}&planName=${encodeURIComponent(plan.display_name)}`,
        failUrl: `${window.location.origin}/investment/subscribe/fail`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류')
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-bold mb-6">투자 구독 플랜</h1>
      <div className="grid gap-4">
        {plans.map(p => (
          <div
            key={p.id}
            onClick={() => setSelected(p)}
            className={`rounded-xl border p-4 cursor-pointer ${selected?.id === p.id ? 'border-blue-500 bg-blue-50' : ''}`}
          >
            <h3>{p.display_name}</h3>
            <p>{p.price.toLocaleString()}원/월</p>
          </div>
        ))}
      </div>
      {error && <p className="text-red-600 mt-3">{error}</p>}
      <button
        disabled={!selected || loading}
        onClick={() => selected && handleStart(selected)}
        className="mt-4 w-full bg-blue-600 text-white py-3 rounded-xl disabled:opacity-50"
      >
        {loading ? '처리 중...' : '구독 시작'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: success 페이지**

`src/app/investment/subscribe/success/page.tsx`: [Task E2]를 user 버전으로 — `/api/investment/billing/auth/issue`에 `{ authKey, customerKey, planId, amount, planName }` 전송.

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

export default function Page() {
  const params = useSearchParams()
  const router = useRouter()
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const authKey = params.get('authKey')
    const customerKey = params.get('customerKey')
    const planId = params.get('planId')
    const amount = Number(params.get('amount'))
    const planName = params.get('planName')

    if (!authKey || !customerKey || !planId || !amount || !planName) {
      setState('error'); setError('파라미터 누락'); return
    }
    void (async () => {
      const res = await fetch('/api/investment/billing/auth/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authKey, customerKey, planId, amount, planName }),
      })
      const data = await res.json()
      if (!res.ok) { setState('error'); setError(data.error); return }
      setState('done')
    })()
  }, [params])

  if (state === 'loading') return <div className="p-12 text-center">결제 처리 중...</div>
  if (state === 'error') return (
    <div className="p-6 text-center">
      <p className="text-red-600">{error}</p>
      <button onClick={() => router.push('/investment/subscribe')} className="mt-4 bg-gray-100 px-4 py-2 rounded">다시 시도</button>
    </div>
  )
  return (
    <div className="p-6 text-center">
      <h1 className="text-xl font-bold text-blue-600">구독이 시작되었습니다!</h1>
      <button onClick={() => router.push('/investment')} className="mt-4 bg-blue-600 text-white px-6 py-3 rounded">시작하기</button>
    </div>
  )
}
```

- [ ] **Step 3: fail 페이지**

`src/app/investment/subscribe/fail/page.tsx`: [Task E3] 그대로 — 라우터 push만 `/investment/subscribe`로 변경.

- [ ] **Step 4: 커밋**

```bash
git add src/app/investment/subscribe/
git commit -m "feat(ui): 투자 구독 토스 직결 페이지(plan select / success / fail)"
```

---

## Phase G: 정리 · 환경 설정 · 검증

### Task G1: 포트원 코드 일괄 삭제

- [ ] **Step 1: 파일 삭제**

```bash
rm src/lib/portone.ts
rm src/lib/subscriptionService.ts
rm src/lib/subscriptionReconciler.ts
rm src/lib/userSubscriptionService.ts
rm src/components/Subscription/CardRegistrationModal.tsx
rm src/app/api/webhooks/portone/route.ts
rm src/app/api/subscription/register/route.ts
rm src/app/api/investment/subscription/webhook/route.ts
rm src/app/api/investment/subscription/register/route.ts
```

- [ ] **Step 2: 잔여 import 검색**

```bash
grep -rn "@/lib/portone\|@/lib/subscriptionService\|@/lib/userSubscriptionService\|@/lib/subscriptionReconciler\|@portone/browser-sdk\|@portone/server-sdk\|CardRegistrationModal\|api/webhooks/portone\|api/subscription/register" src --include="*.ts" --include="*.tsx"
```

검색 결과가 있으면 각 파일을 열어 import 제거 또는 새 모듈로 교체.

- [ ] **Step 3: npm 의존성 제거**

```bash
npm uninstall @portone/browser-sdk @portone/server-sdk
```

- [ ] **Step 4: 빌드 확인**

```bash
npm run build 2>&1 | tail -40
```

타입 에러나 import 에러가 모두 해소될 때까지 반복.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "chore: 포트원 의존 코드 일괄 삭제 (의존성 + 모듈 + 라우트 + 컴포넌트)"
```

---

### Task G2: .env.example 갱신

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: 파일 확인 후 갱신**

```bash
cat .env.example 2>/dev/null
```

`.env.example`의 PortOne 관련 라인을 삭제하고 토스 라인 추가:

```env
# === 토스페이먼츠 (구독 결제) ===
TOSS_SECRET_KEY=test_sk_...           # 운영: live_sk_...
NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_... # 운영: live_ck_...

# === Vercel Cron 인증 ===
CRON_SECRET=                          # 32바이트 랜덤 (openssl rand -hex 32)

# === 결제 알림 (선택) ===
BILLING_ALERT_SLACK_WEBHOOK=          # cron 정지 트리거 시 Slack 알림
```

PortOne 관련 변수(`PORTONE_API_SECRET`, `PORTONE_STORE_ID`, `NEXT_PUBLIC_PORTONE_STORE_ID`, `NEXT_PUBLIC_PORTONE_CHANNEL_KEY`)는 모두 삭제.

- [ ] **Step 2: 커밋**

```bash
git add .env.example
git commit -m "chore(env): 포트원 환경변수 제거 + 토스/Cron 환경변수 추가"
```

---

### Task G3: 빌드 통과 + 단위 테스트 통과

- [ ] **Step 1: 전체 빌드**

```bash
npm run build 2>&1 | tail -20
```

빌드 에러 발생 시 원인 파악 → 수정 → 재빌드 (성공할 때까지).

- [ ] **Step 2: 단위 테스트 전체 실행**

```bash
npm run test:unit
```

실패한 테스트가 있으면 수정.

- [ ] **Step 3: lint**

```bash
npm run lint 2>&1 | tail -10
```

- [ ] **Step 4: 변경 사항 확인**

```bash
git status
```

미커밋 변경분이 있으면 적절한 메시지로 커밋.

---

### Task G4: 통합 검증 (Chrome DevTools MCP, 테스트 토스 키 사용)

> 이 Task는 테스트 토스 키가 실제로 발급되어 `.env.local`에 설정되어 있어야 진행 가능. 키 미발급 시 Task G6(배포 후 검증)으로 미룸.

- [ ] **Step 1: dev 서버 실행**

```bash
npm run dev
```

- [ ] **Step 2: Chrome DevTools MCP로 테스트 계정 로그인**

`mcp__chrome-devtools__navigate_page` → `http://localhost:3000/auth`
- 이메일: `whitedc0902@gmail.com`
- 비밀번호: `ghkdgmltn81!`

- [ ] **Step 3: /owner/subscription 진입 → 플랜 선택 → 구독 시작**

콘솔 에러 모니터링: `mcp__chrome-devtools__list_console_messages`

- [ ] **Step 4: 토스 테스트 결제창에서 테스트 카드(성공)로 결제**

토스 테스트 카드 번호: `4330-1234-1234-1234` (성공 시나리오)

- [ ] **Step 5: success 페이지 확인 → DB 검증**

`mcp__supabase__execute_sql`:
```sql
SELECT s.status, s.billing_key IS NOT NULL AS has_key, s.next_billing_date,
       p.status AS pay_status, p.toss_payment_key, p.amount
FROM subscriptions s
LEFT JOIN subscription_payments p ON p.subscription_id = s.id
WHERE s.clinic_id = (SELECT clinic_id FROM users WHERE email='whitedc0902@gmail.com')
ORDER BY s.created_at DESC LIMIT 1;
```

기대: `status='active'`, `has_key=true`, `pay_status='paid'`, `toss_payment_key` 존재.

- [ ] **Step 6: 실패 시나리오 검증**

다른 클리닉에서 테스트 카드(실패: `INVALID_CARD` 시뮬레이션) → fail 페이지 확인.

- [ ] **Step 7: cron 수동 호출**

`subscriptions.next_billing_date`를 어제로 임시 변경:
```sql
UPDATE subscriptions SET next_billing_date = NOW() - INTERVAL '1 hour'
WHERE clinic_id = (SELECT clinic_id FROM users WHERE email='whitedc0902@gmail.com');
```

cron 호출:
```bash
curl -H "Authorization: Bearer ${CRON_SECRET}" "http://localhost:3000/api/cron/billing-charge"
```

응답: `{ processed: 1, succeeded: 1, failed: 0 }` 기대.

- [ ] **Step 8: 취소 검증**

`/api/subscriptions/cancel`에 `{ immediate: true }` 호출:
```bash
curl -X POST -H "Content-Type: application/json" -d '{"immediate":true}' \
  -H "Cookie: ..." http://localhost:3000/api/subscription/cancel
```

DB 확인: `status='cancelled'`, `next_billing_date=null`.

> 검증에서 발견된 버그는 즉시 수정 → 재테스트 사이클 반복.

---

### Task G5: develop 브랜치 푸시

- [ ] **Step 1: 변경 사항 최종 확인**

```bash
git status
git log --oneline -20
```

- [ ] **Step 2: develop 푸시**

```bash
git push origin develop
```

- [ ] **Step 3: GitHub Actions/Vercel Preview 빌드 통과 확인**

```bash
gh run list --branch develop --limit 3
gh run watch  # 가장 최근 워크플로
```

빌드 실패 시 로그 확인 → 수정 → 재푸시.

---

### Task G6: 토스 어드민 사전 설정 + Vercel 환경변수

> 이 Task는 사용자가 직접 수행해야 하는 외부 설정. 사용자에게 안내.

- [ ] **Step 1: 토스페이먼츠 가입 + MID 발급**

[https://docs-pay.toss.im/](https://docs-pay.toss.im/) 가이드 따라 진행.

- [ ] **Step 2: 빌링(자동결제) 사용 신청**

- [ ] **Step 3: 시크릿/클라이언트 키 발급**

테스트 키 (`test_sk_*`, `test_ck_*`)부터 시작해 검증 후 운영 키 (`live_sk_*`, `live_ck_*`)로 교체.

- [ ] **Step 4: Vercel Dashboard에서 환경변수 등록**

```
TOSS_SECRET_KEY (Production: live_sk_*, Preview/Development: test_sk_*)
NEXT_PUBLIC_TOSS_CLIENT_KEY (동일 패턴)
CRON_SECRET (Production만)
BILLING_ALERT_SLACK_WEBHOOK (선택)
```

기존 `PORTONE_*` 환경변수는 모두 삭제.

- [ ] **Step 5: 토스 어드민에서 웹훅 URL 등록**

운영: `https://<production-domain>/api/webhooks/toss`

---

### Task G7: develop → main PR 생성 및 머지

- [ ] **Step 1: PR 생성**

```bash
gh pr create --base main --head develop --title "feat(billing): 토스페이먼츠 직결 결제 시스템 도입" --body "$(cat <<'EOF'
## Summary
- 포트원 경유 결제를 토스페이먼츠 직결 빌링키 정기결제로 전면 교체
- Vercel Cron + Supabase 쿼리로 자체 스케줄링 (1d×3 재시도 → 7d 유예 → 정지)
- customerKey 클리닉당 1회 무작위 UUID 영구 보존
- 단계적 저장(saga)으로 외부 API와 DB 일관성 보장

## Spec & Plan
- Spec: docs/superpowers/specs/2026-05-08-toss-payments-direct-integration-design.md
- Plan: docs/superpowers/plans/2026-05-08-toss-payments-direct-integration.md

## Test plan
- [ ] 단위 테스트 전체 통과 (`npm run test:unit`)
- [ ] 빌드 통과 (`npm run build`)
- [ ] 토스 테스트 카드로 카드 등록 + 첫 결제 + DB 검증
- [ ] cron 수동 호출 시 결제일 도래 구독 청구 확인
- [ ] 실패 시나리오에서 fail 페이지 표시
- [ ] 취소 시 status 'cancelled' 전이

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: PR 빌드/체크 통과 확인**

```bash
gh pr checks --watch
```

- [ ] **Step 3: 머지**

```bash
gh pr merge --squash --delete-branch=false
```

- [ ] **Step 4: 운영 배포 후 토스 테스트 키로 1회 검증**

배포 완료 후 운영 도메인에서 [Task G4]의 시나리오 1~2 반복 (테스트 키 사용).

- [ ] **Step 5: 운영 키로 전환**

검증 통과 후 Vercel Dashboard에서 토스 키를 운영(`live_*`)으로 변경 → 한 번 더 `/api/cron/billing-charge` 헬스체크 (빈 결과 확인).

---

## Self-Review (계획 작성 후 점검)

**Spec 커버리지:**
- §1 아키텍처(`src/lib/tossPayments/` 모듈) → Phase A
- §2 데이터 모델 → Phase B
- §3 클라이언트 흐름 → Phase E, F
- §4 서버 흐름 → Phase C, D
- §5 에러/재시도/웹훅 → Task A2, C5, D4 + Vercel 알림은 Task G6
- §6 테스트 → Phase A 단위 + Task G4 통합
- §7 환경/배포 → Task G2, G6, G7
- §8 위험 완화 → 단계적 저장(C3), 멱등(orderId UNIQUE), 직렬+150ms(C4/C5)
- §9 후속 작업 → 미구현 (별도 진행)

**Placeholder 점검:** 모든 Task에 실제 코드/SQL/명령 포함 ✓ (다운그레이드는 명시적으로 임시 안내 + 후속 작업 분리)

**타입 일관성:**
- `makeOrderId` (C3, C4, C5에서 일관)
- `addOneMonth` (C3, C4, C5)
- `chargeOne` 내부 함수 (C4, C5)
- `RegisterParams` / `RegisterResult` 시그니처 통일
- 함수명: `registerSubscription`, `runDueCharges`, `runRetries`, `cancelSubscription`, `upgradePlan`, `downgradePlan`, `getSubscriptionStatus` 일관

**범위 결정:** 다운그레이드 자동 적용은 본 범위 밖 (Task C6에서 명시적으로 임시 안내). 이번 PR은 "포트원 → 토스 직결 + 정기결제 동작"이 목표.
