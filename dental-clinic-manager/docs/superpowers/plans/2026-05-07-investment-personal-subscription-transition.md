# 자동매매 개인 구독 전환 + master 가격 관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자동매매 모듈의 구독 모델을 clinic 단위에서 개인(user) 단위로 전환하고, master 페이지에서 구독료를 변경할 수 있게 하며, 기존 clinic 자동매매 구독자를 자동 이관한다.

**Architecture:** 개인 구독 전용 테이블 3종(`user_subscription_plans`, `user_subscriptions`, `user_subscription_payments`) 신설. 기존 PortOne 빌링키 인프라(`src/lib/portone.ts`)는 그대로 재사용. 자동매매 게이팅을 단일 헬퍼(`src/lib/userSubscription.ts`)로 통합하고, 기존 권한 시스템(`investment_view`)에서 분리. 월말 청구 cron을 user 단위로 재작성하여 월 정액 + 수익 5% 하이브리드 청구.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase Postgres, PortOne v2, shadcn/ui, Vercel Cron.

**Spec:** [docs/superpowers/specs/2026-05-07-investment-personal-subscription-and-psychology-design.md](../specs/2026-05-07-investment-personal-subscription-and-psychology-design.md)

---

## File Map

### 신설
- `supabase/migrations/20260507_user_subscriptions.sql` — 3개 테이블 + RLS + 시드
- `src/types/userSubscription.ts` — 타입 정의
- `src/lib/userSubscriptionService.ts` — DB CRUD + 결제 흐름
- `src/lib/userSubscription.ts` — 게이팅 헬퍼 `checkInvestmentSubscription`/`requireInvestmentSubscription`
- `src/app/api/investment/subscription/status/route.ts`
- `src/app/api/investment/subscription/register/route.ts`
- `src/app/api/investment/subscription/cancel/route.ts`
- `src/app/api/investment/subscription/webhook/route.ts`
- `src/app/api/master/user-subscription-plans/route.ts` (GET 목록)
- `src/app/api/master/user-subscription-plans/[id]/route.ts` (PUT)
- `src/app/master/subscription/investment/page.tsx` — 가격 관리 UI
- `src/app/investment/subscribe/page.tsx` — 구독 안내/결제 페이지
- `scripts/migrate-investment-subscriptions-to-user.ts` — 1회성 이관 스크립트

### 수정
- `src/config/menuConfig.ts` — 자동매매 메뉴의 `permissions: ['investment_view']` 제거
- `src/app/api/investment/profit-snapshot/route.ts` — clinic_id → user_id 기반 청구 로직으로 재작성
- `src/lib/investmentProfit.ts` — `calculateMonthlyProfitForUser(userId, year, month)` 함수 추가
- `src/app/investment/layout.tsx` — 진입 시 게이팅 체크 (미구독자 → /investment/subscribe)

### 삭제 (마이그레이션 후)
- 없음 (기존 clinic 구독 시스템은 다른 feature plan에서 계속 사용하므로 유지)

---

## Task 1: 데이터베이스 마이그레이션

**Files:**
- Create: `supabase/migrations/20260507_user_subscriptions.sql`

- [ ] **Step 1: 마이그레이션 SQL 파일 작성**

```sql
-- ============================================
-- 개인 구독 시스템 (user_subscriptions)
-- 자동매매 모듈을 clinic → 개인 구독으로 전환하기 위한 신규 테이블
-- ============================================

CREATE TABLE IF NOT EXISTS user_subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  monthly_base_price INT NOT NULL DEFAULT 0,
  revenue_share_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
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
  migrated_from_clinic_id UUID NULL,
  migrated_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, plan_id)
);

CREATE TABLE IF NOT EXISTS user_subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  portone_payment_id TEXT NOT NULL,
  portone_tx_id TEXT,
  amount INT NOT NULL,
  base_amount INT NOT NULL DEFAULT 0,
  revenue_share_amount INT NOT NULL DEFAULT 0,
  realized_profit_basis INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','cancelled','refunded')),
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  fail_reason TEXT,
  billing_period_start DATE,
  billing_period_end DATE,
  order_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_subs_user_status
  ON user_subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_sub_payments_user_time
  ON user_subscription_payments (user_id, created_at DESC);

-- RLS
ALTER TABLE user_subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscription_payments ENABLE ROW LEVEL SECURITY;

-- 플랜은 모두 SELECT 가능, 변경은 master_admin만 (service_role 우회 필요)
CREATE POLICY "user_subscription_plans_select_all"
  ON user_subscription_plans FOR SELECT
  USING (true);

-- 본인 구독만 SELECT
CREATE POLICY "user_subscriptions_select_own"
  ON user_subscriptions FOR SELECT
  USING (user_id = auth.uid());

-- 본인 결제 내역만 SELECT
CREATE POLICY "user_sub_payments_select_own"
  ON user_subscription_payments FOR SELECT
  USING (user_id = auth.uid());

-- INSERT/UPDATE/DELETE는 모두 service_role(API 라우트)에서만 수행 → 별도 정책 추가 안 함

-- 시드: 자동매매 플랜 (운영자가 master UI에서 가격 변경)
INSERT INTO user_subscription_plans (feature_id, display_name, monthly_base_price, revenue_share_pct, description, is_active)
VALUES (
  'investment',
  '주식 자동매매',
  9900,
  5.00,
  '월 정액 + 실현 수익의 5%. 군중심리 분석 기능 포함.',
  true
)
ON CONFLICT (feature_id) DO NOTHING;
```

- [ ] **Step 2: Supabase MCP로 마이그레이션 적용**

`mcp__supabase__apply_migration`으로 위 SQL 적용. project_id=`beahjntkmkfhpcbhfnrr`, name=`20260507_user_subscriptions`.

- [ ] **Step 3: 테이블 생성 검증**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('user_subscription_plans','user_subscriptions','user_subscription_payments');
```

Expected: 3 rows. `mcp__supabase__execute_sql` 사용.

- [ ] **Step 4: 시드 데이터 확인**

```sql
SELECT feature_id, display_name, monthly_base_price, revenue_share_pct, is_active
FROM user_subscription_plans WHERE feature_id='investment';
```

Expected: 1 row with monthly_base_price=9900, revenue_share_pct=5.00.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260507_user_subscriptions.sql
git commit -m "feat(subscription): 개인 구독 테이블 신설 (user_subscriptions)"
```

---

## Task 2: 타입 정의

**Files:**
- Create: `src/types/userSubscription.ts`

- [ ] **Step 1: 타입 파일 작성**

```typescript
// 개인 구독 시스템 타입
// 기존 src/types/subscription.ts(clinic 단위)와 분리하여 user 단위 타입 정의

export type UserSubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'suspended'
  | 'expired'

export type UserSubscriptionPaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded'

export interface UserSubscriptionPlan {
  id: string
  feature_id: string
  display_name: string
  monthly_base_price: number
  revenue_share_pct: number
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UserSubscription {
  id: string
  user_id: string
  plan_id: string
  status: UserSubscriptionStatus
  billing_key: string | null
  card_name: string | null
  card_number_last4: string | null
  current_period_start: string | null
  current_period_end: string | null
  next_billing_date: string | null
  cancel_at_period_end: boolean
  cancelled_at: string | null
  retry_count: number
  next_retry_at: string | null
  migrated_from_clinic_id: string | null
  migrated_at: string | null
  created_at: string
  updated_at: string
  plan?: UserSubscriptionPlan | null
}

export interface UserSubscriptionPayment {
  id: string
  user_id: string
  subscription_id: string | null
  portone_payment_id: string
  portone_tx_id: string | null
  amount: number
  base_amount: number
  revenue_share_amount: number
  realized_profit_basis: number
  status: UserSubscriptionPaymentStatus
  paid_at: string | null
  failed_at: string | null
  fail_reason: string | null
  billing_period_start: string | null
  billing_period_end: string | null
  order_name: string | null
  created_at: string
}

// API 응답
export interface UserSubscriptionStatusResponse {
  subscription: UserSubscription | null
  plan: UserSubscriptionPlan | null
  payments: UserSubscriptionPayment[]
  daysUntilExpiry: number | null
  nextChargeEstimate: {
    base: number
    revenueShareEstimate: number
    total: number
    realizedProfitMonthToDate: number
  } | null
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공 (이 파일은 아직 import되지 않음)

- [ ] **Step 3: Commit**

```bash
git add src/types/userSubscription.ts
git commit -m "feat(subscription): 개인 구독 타입 정의"
```

---

## Task 3: 게이팅 헬퍼

**Files:**
- Create: `src/lib/userSubscription.ts`

- [ ] **Step 1: 헬퍼 작성**

```typescript
// src/lib/userSubscription.ts
// 자동매매(및 그 서브 기능) 진입 게이팅 단일 헬퍼.
// 모든 자동매매 페이지/API는 이 헬퍼 한 줄로 게이팅한다.

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import type { UserSubscription, UserSubscriptionPlan } from '@/types/userSubscription'

export type GateResult =
  | { ok: true; subscription: UserSubscription & { plan: UserSubscriptionPlan } }
  | { ok: false; reason: 'NO_SUBSCRIPTION' | 'PAST_DUE' | 'EXPIRED' | 'CANCELLED' | 'SUSPENDED' }

const FEATURE_INVESTMENT = 'investment'

/**
 * 개인 자동매매 구독 상태 조회. 분기는 호출 측이 처리.
 * 사용자는 한 feature에 대해 1개 활성 구독만 가질 수 있다 (UNIQUE(user_id, plan_id)).
 */
export async function checkInvestmentSubscription(userId: string): Promise<GateResult> {
  const admin = getSupabaseAdmin()
  if (!admin) return { ok: false, reason: 'NO_SUBSCRIPTION' }

  const { data } = await admin
    .from('user_subscriptions')
    .select(`*, plan:user_subscription_plans!inner(*)`)
    .eq('user_id', userId)
    .eq('plan.feature_id', FEATURE_INVESTMENT)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return { ok: false, reason: 'NO_SUBSCRIPTION' }

  const sub = data as unknown as UserSubscription & { plan: UserSubscriptionPlan }
  const status = sub.status

  if (status === 'active') return { ok: true, subscription: sub }
  if (status === 'past_due') return { ok: false, reason: 'PAST_DUE' }
  if (status === 'expired') return { ok: false, reason: 'EXPIRED' }
  if (status === 'cancelled') return { ok: false, reason: 'CANCELLED' }
  if (status === 'suspended') return { ok: false, reason: 'SUSPENDED' }
  return { ok: false, reason: 'NO_SUBSCRIPTION' }
}

/**
 * API 라우트 전용. 통과 시 구독 객체 반환, 실패 시 NextResponse를 throw.
 * 사용 예:
 *   const sub = await requireInvestmentSubscription(userId)
 */
export async function requireInvestmentSubscription(
  userId: string
): Promise<UserSubscription & { plan: UserSubscriptionPlan }> {
  const result = await checkInvestmentSubscription(userId)
  if (result.ok) return result.subscription

  const status =
    result.reason === 'PAST_DUE' || result.reason === 'SUSPENDED' ? 402 : 401
  const message = {
    NO_SUBSCRIPTION: '주식 자동매매 구독이 필요합니다.',
    PAST_DUE: '결제 연체 상태입니다. 결제 수단을 확인해주세요.',
    EXPIRED: '구독이 만료되었습니다.',
    CANCELLED: '구독이 취소되었습니다.',
    SUSPENDED: '결제 실패로 구독이 일시 정지되었습니다.',
  }[result.reason]

  throw NextResponse.json(
    { error: message, code: result.reason },
    { status }
  )
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 3: Commit**

```bash
git add src/lib/userSubscription.ts
git commit -m "feat(subscription): 자동매매 게이팅 헬퍼 추가"
```

---

## Task 4: 개인 구독 서비스 모듈

**Files:**
- Create: `src/lib/userSubscriptionService.ts`

- [ ] **Step 1: 서비스 모듈 작성**

```typescript
// src/lib/userSubscriptionService.ts
// 개인 구독 DB CRUD + 결제 흐름 (PortOne 재사용)

import { getSupabaseAdmin } from '@/lib/supabase/admin'
import {
  chargeBillingKey,
  scheduleNextPayment,
  cancelScheduleByBillingKey,
  getNextBillingDate,
} from '@/lib/portone'
import type {
  UserSubscription,
  UserSubscriptionPlan,
  UserSubscriptionPayment,
} from '@/types/userSubscription'

const FEATURE_INVESTMENT = 'investment'

export async function getInvestmentPlan(): Promise<UserSubscriptionPlan | null> {
  const admin = getSupabaseAdmin()
  if (!admin) return null
  const { data } = await admin
    .from('user_subscription_plans')
    .select('*')
    .eq('feature_id', FEATURE_INVESTMENT)
    .single()
  return (data as UserSubscriptionPlan | null) ?? null
}

export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  const admin = getSupabaseAdmin()
  if (!admin) return null
  const { data } = await admin
    .from('user_subscriptions')
    .select(`*, plan:user_subscription_plans(*)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as UserSubscription | null) ?? null
}

export async function getUserPayments(userId: string, limit = 12): Promise<UserSubscriptionPayment[]> {
  const admin = getSupabaseAdmin()
  if (!admin) return []
  const { data } = await admin
    .from('user_subscription_payments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data as UserSubscriptionPayment[] | null) ?? []
}

/**
 * 구독 등록: 빌링키로 첫 결제 + 다음 달 예약 + 구독 레코드 생성.
 */
export async function registerUserSubscription(params: {
  userId: string
  planId: string
  billingKey: string
  cardName: string
  cardNumberLast4: string
  customerName: string
  customerEmail: string
}): Promise<{ success: boolean; error?: string }> {
  const admin = getSupabaseAdmin()
  if (!admin) return { success: false, error: 'Server configuration error' }

  const { data: planData } = await admin
    .from('user_subscription_plans')
    .select('*')
    .eq('id', params.planId)
    .single()
  const plan = planData as UserSubscriptionPlan | null
  if (!plan) return { success: false, error: '플랜을 찾을 수 없습니다' }

  const now = new Date()
  const nextBilling = getNextBillingDate(now)
  const orderName = `${plan.display_name} 월 정액`

  try {
    const paymentResult = await chargeBillingKey({
      clinicId: params.userId, // PortOne paymentId의 prefix로만 사용 (실제 user 식별은 우리 DB)
      billingKey: params.billingKey,
      amount: plan.monthly_base_price,
      orderName,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      noticeUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/investment/subscription/webhook`,
    })

    if (paymentResult.status !== 'PAID') {
      return { success: false, error: '결제에 실패했습니다. 카드 정보를 확인해주세요.' }
    }

    const subscriptionData = {
      user_id: params.userId,
      plan_id: params.planId,
      status: 'active' as const,
      billing_key: params.billingKey,
      card_name: params.cardName,
      card_number_last4: params.cardNumberLast4,
      current_period_start: now.toISOString(),
      current_period_end: nextBilling.toISOString(),
      next_billing_date: nextBilling.toISOString(),
      cancel_at_period_end: false,
      retry_count: 0,
      next_retry_at: null as string | null,
      updated_at: now.toISOString(),
    }

    const { data: existing } = await admin
      .from('user_subscriptions')
      .select('id')
      .eq('user_id', params.userId)
      .eq('plan_id', params.planId)
      .maybeSingle()

    let subscriptionId: string | null = null
    if (existing) {
      const { data: updated } = await admin
        .from('user_subscriptions')
        .update(subscriptionData)
        .eq('id', (existing as { id: string }).id)
        .select('id')
        .single()
      subscriptionId = (updated as { id: string }).id
    } else {
      const { data: inserted } = await admin
        .from('user_subscriptions')
        .insert(subscriptionData)
        .select('id')
        .single()
      subscriptionId = (inserted as { id: string }).id
    }

    await admin.from('user_subscription_payments').insert({
      user_id: params.userId,
      subscription_id: subscriptionId,
      portone_payment_id: paymentResult.paymentId,
      portone_tx_id: paymentResult.txId,
      amount: plan.monthly_base_price,
      base_amount: plan.monthly_base_price,
      revenue_share_amount: 0,
      realized_profit_basis: 0,
      status: 'paid' as const,
      order_name: orderName,
      paid_at: paymentResult.paidAt || now.toISOString(),
      billing_period_start: now.toISOString().slice(0, 10),
      billing_period_end: nextBilling.toISOString().slice(0, 10),
    })

    await scheduleNextPayment({
      clinicId: params.userId,
      billingKey: params.billingKey,
      planPrice: plan.monthly_base_price,
      planName: orderName,
      customerEmail: params.customerEmail,
      scheduledAt: nextBilling,
      noticeUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/investment/subscription/webhook`,
    })

    return { success: true }
  } catch (err) {
    console.error('[userSubscription.register] 실패:', err)
    return { success: false, error: err instanceof Error ? err.message : '구독 등록 실패' }
  }
}

/**
 * 구독 취소. 기본은 기간 만료 후 취소(즉시는 PortOne 예약 + 빌링키 삭제).
 */
export async function cancelUserSubscription(params: {
  userId: string
  immediate?: boolean
}): Promise<{ success: boolean; error?: string }> {
  const admin = getSupabaseAdmin()
  if (!admin) return { success: false, error: 'Server configuration error' }

  const sub = await getUserSubscription(params.userId)
  if (!sub) return { success: false, error: '구독을 찾을 수 없습니다' }

  try {
    if (sub.billing_key) {
      await cancelScheduleByBillingKey(sub.billing_key)
    }

    const now = new Date().toISOString()
    if (params.immediate) {
      await admin.from('user_subscriptions')
        .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
        .eq('id', sub.id)
    } else {
      await admin.from('user_subscriptions')
        .update({ cancel_at_period_end: true, cancelled_at: now, updated_at: now })
        .eq('id', sub.id)
    }
    return { success: true }
  } catch (err) {
    console.error('[userSubscription.cancel] 실패:', err)
    return { success: false, error: err instanceof Error ? err.message : '구독 취소 실패' }
  }
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 3: Commit**

```bash
git add src/lib/userSubscriptionService.ts
git commit -m "feat(subscription): 개인 구독 서비스 모듈 (등록/조회/취소)"
```

---

## Task 5: 구독 상태 조회 API

**Files:**
- Create: `src/app/api/investment/subscription/status/route.ts`

- [ ] **Step 1: 라우트 작성**

```typescript
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import {
  getUserSubscription,
  getUserPayments,
  getInvestmentPlan,
} from '@/lib/userSubscriptionService'
import { calculateMonthlyProfitForUser } from '@/lib/investmentProfit'
import type { UserSubscriptionStatusResponse } from '@/types/userSubscription'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const [sub, plan, payments] = await Promise.all([
    getUserSubscription(auth.user.id),
    getInvestmentPlan(),
    getUserPayments(auth.user.id, 12),
  ])

  let nextChargeEstimate: UserSubscriptionStatusResponse['nextChargeEstimate'] = null
  if (sub && plan && sub.status === 'active') {
    const now = new Date()
    const kst = new Date(now.getTime() + 9 * 3600_000)
    const { realized } = await calculateMonthlyProfitForUser(
      auth.user.id, kst.getUTCFullYear(), kst.getUTCMonth() + 1
    )
    const revenueShare = Math.max(0, Math.floor(realized * (plan.revenue_share_pct / 100)))
    nextChargeEstimate = {
      base: plan.monthly_base_price,
      revenueShareEstimate: revenueShare,
      total: plan.monthly_base_price + revenueShare,
      realizedProfitMonthToDate: realized,
    }
  }

  let daysUntilExpiry: number | null = null
  if (sub?.current_period_end) {
    const end = new Date(sub.current_period_end)
    daysUntilExpiry = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  }

  const response: UserSubscriptionStatusResponse = {
    subscription: sub,
    plan,
    payments,
    daysUntilExpiry,
    nextChargeEstimate,
  }
  return NextResponse.json(response)
}
```

- [ ] **Step 2: 빌드 + 미인증 호출 검증**

Run: `npm run build`
Expected: 성공

이 라우트는 `calculateMonthlyProfitForUser`에 의존. Task 7에서 추가 예정. 빌드는 임시로 통과되어야 함 — 만약 컴파일 에러면 import를 임시로 주석 처리하지 말고 Task 7을 먼저 진행 후 돌아옴.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/investment/subscription/status/route.ts
git commit -m "feat(subscription): 구독 상태 조회 API"
```

---

## Task 6: 구독 등록/취소 API

**Files:**
- Create: `src/app/api/investment/subscription/register/route.ts`
- Create: `src/app/api/investment/subscription/cancel/route.ts`

- [ ] **Step 1: register 라우트 작성**

```typescript
// src/app/api/investment/subscription/register/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { registerUserSubscription } from '@/lib/userSubscriptionService'

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data: userData } = await admin
    .from('users')
    .select('name, email')
    .eq('id', auth.user.id)
    .single()

  const body = await request.json()
  const { billingKey, planId, cardName, cardNumberLast4 } = body
  if (!billingKey || !planId) {
    return NextResponse.json({ error: '필수 정보가 누락되었습니다' }, { status: 400 })
  }

  const result = await registerUserSubscription({
    userId: auth.user.id,
    planId,
    billingKey,
    cardName: cardName ?? '',
    cardNumberLast4: cardNumberLast4 ?? '',
    customerName: (userData as { name?: string } | null)?.name ?? '',
    customerEmail: (userData as { email?: string } | null)?.email ?? '',
  })

  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: cancel 라우트 작성**

```typescript
// src/app/api/investment/subscription/cancel/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { cancelUserSubscription } from '@/lib/userSubscriptionService'

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const body = await request.json().catch(() => ({}))
  const immediate = body.immediate === true

  const result = await cancelUserSubscription({ userId: auth.user.id, immediate })
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 4: Commit**

```bash
git add src/app/api/investment/subscription/register/route.ts src/app/api/investment/subscription/cancel/route.ts
git commit -m "feat(subscription): 구독 등록/취소 API"
```

---

## Task 7: investmentProfit에 user 단위 함수 추가

**Files:**
- Modify: `src/lib/investmentProfit.ts`

- [ ] **Step 1: 현재 파일 확인**

Run: `cat src/lib/investmentProfit.ts`
Expected: clinic_id 기반 `calculateMonthlyProfit` 함수만 존재.

- [ ] **Step 2: user 단위 함수 추가**

기존 함수는 유지하고 user 변형 추가:

```typescript
/**
 * 월별 user 단위 실현/평가 수익을 반환한다.
 * 자동매매 사용자별 결제 청구의 기초 수치.
 *
 * NOTE: 현재 투자 거래 테이블이 부재하므로 0 반환.
 * 투자 엔진(orders/positions)이 추가되면 user_id 기반 집계 쿼리로 대체.
 */
export async function calculateMonthlyProfitForUser(
  _userId: string, _year: number, _month: number
): Promise<{ realized: number; unrealized: number }> {
  return { realized: 0, unrealized: 0 }
}
```

기존 export 끝에 위 함수를 append.

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공. Task 5의 import가 이제 해결됨.

- [ ] **Step 4: Commit**

```bash
git add src/lib/investmentProfit.ts
git commit -m "feat(profit): user 단위 월별 수익 계산 함수 추가"
```

---

## Task 8: 결제 webhook

**Files:**
- Create: `src/app/api/investment/subscription/webhook/route.ts`

- [ ] **Step 1: webhook 라우트 작성**

PortOne v2 webhook 형식: `{ type, timestamp, data: { paymentId, ... } }`. 결제 성공 시 user_subscription_payments 갱신, 실패 시 retry/suspended 처리.

```typescript
// src/app/api/investment/subscription/webhook/route.ts
// PortOne v2 결제 webhook. 빌링키 자동결제(예약) 결과 처리.
//
// 보안: PortOne webhook 검증은 portone-webhook-secret 헤더 + payload 서명. 1차에는 paymentId 존재 검증만.
// 추후 정식 서명 검증 추가 (별도 task).

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getPayment, getNextBillingDate } from '@/lib/portone'

const MAX_RETRY = 3

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as
    | { type?: string; data?: { paymentId?: string } }
    | null
  if (!body?.data?.paymentId) {
    return NextResponse.json({ ok: true, ignored: 'no paymentId' })
  }

  const portonePaymentId = body.data.paymentId
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ ok: false }, { status: 500 })

  const portonePayment = await getPayment(portonePaymentId).catch(() => null)
  if (!portonePayment) return NextResponse.json({ ok: true, ignored: 'no portone payment' })

  // user_subscriptions 중 paymentId 접두사가 일치하는 사용자 추적
  // PortOne paymentId 포맷: payment-scheduled-<userId>-<timestamp> (registerUserSubscription에서 그대로 사용)
  const m = portonePaymentId.match(/^payment-(?:scheduled-)?([0-9a-f-]{36})-\d+$/i)
  const userId = m?.[1] ?? null
  if (!userId) return NextResponse.json({ ok: true, ignored: 'cannot extract userId' })

  const { data: subData } = await admin
    .from('user_subscriptions')
    .select('id, plan_id, billing_key, retry_count, current_period_end')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sub = subData as
    | { id: string; plan_id: string; billing_key: string | null; retry_count: number; current_period_end: string | null }
    | null
  if (!sub) return NextResponse.json({ ok: true, ignored: 'no user subscription' })

  const now = new Date()

  if (portonePayment.status === 'PAID') {
    // 결제 성공 → 다음 주기로 갱신
    const nextEnd = getNextBillingDate(now)
    await admin.from('user_subscriptions').update({
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: nextEnd.toISOString(),
      next_billing_date: nextEnd.toISOString(),
      retry_count: 0,
      next_retry_at: null,
      updated_at: now.toISOString(),
    }).eq('id', sub.id)

    await admin.from('user_subscription_payments').insert({
      user_id: userId,
      subscription_id: sub.id,
      portone_payment_id: portonePaymentId,
      portone_tx_id: portonePayment.transactionId ?? null,
      amount: portonePayment.amount.total,
      base_amount: portonePayment.amount.total,
      revenue_share_amount: 0,
      realized_profit_basis: 0,
      status: 'paid',
      paid_at: portonePayment.paidAt ?? now.toISOString(),
      order_name: '주식 자동매매 정기결제',
      billing_period_start: now.toISOString().slice(0, 10),
      billing_period_end: nextEnd.toISOString().slice(0, 10),
    })
    return NextResponse.json({ ok: true })
  }

  if (portonePayment.status === 'FAILED') {
    const retryCount = (sub.retry_count ?? 0) + 1
    const newStatus = retryCount >= MAX_RETRY ? 'suspended' : 'past_due'
    const nextRetry = retryCount < MAX_RETRY ? new Date(now.getTime() + 12 * 3600_000) : null

    await admin.from('user_subscriptions').update({
      status: newStatus,
      retry_count: retryCount,
      next_retry_at: nextRetry?.toISOString() ?? null,
      updated_at: now.toISOString(),
    }).eq('id', sub.id)

    await admin.from('user_subscription_payments').insert({
      user_id: userId,
      subscription_id: sub.id,
      portone_payment_id: portonePaymentId,
      portone_tx_id: portonePayment.transactionId ?? null,
      amount: portonePayment.amount.total,
      base_amount: portonePayment.amount.total,
      revenue_share_amount: 0,
      realized_profit_basis: 0,
      status: 'failed',
      failed_at: portonePayment.failedAt ?? now.toISOString(),
      fail_reason: portonePayment.failReason ?? '결제 실패',
      order_name: '주식 자동매매 정기결제',
    })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 3: Commit**

```bash
git add src/app/api/investment/subscription/webhook/route.ts
git commit -m "feat(subscription): PortOne 결제 webhook 핸들러"
```

---

## Task 9: master 가격 관리 API

**Files:**
- Create: `src/app/api/master/user-subscription-plans/route.ts`
- Create: `src/app/api/master/user-subscription-plans/[id]/route.ts`

- [ ] **Step 1: 목록 조회 라우트**

```typescript
// src/app/api/master/user-subscription-plans/route.ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  const auth = await requireAuth(['master_admin'])
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data } = await admin
    .from('user_subscription_plans')
    .select('*')
    .order('feature_id')
  return NextResponse.json(data ?? [])
}
```

- [ ] **Step 2: 가격 변경 라우트**

```typescript
// src/app/api/master/user-subscription-plans/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['master_admin'])
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const { id } = await ctx.params

  const body = await req.json().catch(() => null) as {
    monthly_base_price?: number
    revenue_share_pct?: number
    is_active?: boolean
    description?: string
  } | null
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.monthly_base_price === 'number' && body.monthly_base_price >= 0) {
    update.monthly_base_price = Math.floor(body.monthly_base_price)
  }
  if (typeof body.revenue_share_pct === 'number' && body.revenue_share_pct >= 0 && body.revenue_share_pct <= 50) {
    update.revenue_share_pct = body.revenue_share_pct
  }
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active
  if (typeof body.description === 'string') update.description = body.description

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data, error } = await admin
    .from('user_subscription_plans')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 4: Commit**

```bash
git add src/app/api/master/user-subscription-plans
git commit -m "feat(master): 개인 구독 플랜 가격 관리 API"
```

---

## Task 10: master 가격 관리 UI

**Files:**
- Create: `src/app/master/subscription/investment/page.tsx`

- [ ] **Step 1: UI 작성**

```tsx
// src/app/master/subscription/investment/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'

interface Plan {
  id: string
  feature_id: string
  display_name: string
  monthly_base_price: number
  revenue_share_pct: number
  description: string | null
  is_active: boolean
}

export default function InvestmentPlanAdminPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'master_admin')) {
      router.replace('/dashboard')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user || user.role !== 'master_admin') return
    fetch('/api/master/user-subscription-plans')
      .then(r => r.json())
      .then((rows: Plan[]) => {
        const inv = rows.find(p => p.feature_id === 'investment') ?? null
        setPlan(inv)
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [user])

  const onSave = async () => {
    if (!plan) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/master/user-subscription-plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthly_base_price: plan.monthly_base_price,
          revenue_share_pct: plan.revenue_share_pct,
          is_active: plan.is_active,
          description: plan.description ?? '',
        }),
      })
      if (!res.ok) { setError((await res.json()).error ?? '저장 실패') }
      else setSavedAt(new Date())
    } finally { setSaving(false) }
  }

  if (authLoading || loading) {
    return <div className="p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }
  if (!plan) return <div className="p-8 text-red-600">플랜을 찾을 수 없습니다.</div>

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <h1 className="text-2xl font-bold">자동매매 구독료 관리</h1>
      <p className="text-sm text-gray-500">
        변경된 가격은 다음 청구 주기부터 적용됩니다. 진행 중인 결제에는 영향 없음.
      </p>

      <div className="space-y-4 bg-white rounded-xl border p-6">
        <div>
          <label className="block text-sm font-semibold mb-1">월 정액 (원)</label>
          <input
            type="number"
            min={0}
            value={plan.monthly_base_price}
            onChange={e => setPlan({ ...plan, monthly_base_price: Number(e.target.value) })}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">수익 공유 % (0~50)</label>
          <input
            type="number" step="0.01" min={0} max={50}
            value={plan.revenue_share_pct}
            onChange={e => setPlan({ ...plan, revenue_share_pct: Number(e.target.value) })}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">설명</label>
          <textarea
            value={plan.description ?? ''}
            onChange={e => setPlan({ ...plan, description: e.target.value })}
            className="w-full border rounded-lg px-3 py-2"
            rows={3}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={plan.is_active}
            onChange={e => setPlan({ ...plan, is_active: e.target.checked })}
          />
          플랜 활성화
        </label>

        {error && <div className="text-red-600 text-sm">{error}</div>}
        {savedAt && <div className="text-green-600 text-sm">저장됨: {savedAt.toLocaleTimeString()}</div>}

        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          저장
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 3: 브라우저 검증 (Chrome DevTools MCP)**

1. `mcp__chrome-devtools__navigate_page` → `http://localhost:3000` (dev 서버 사전 실행)
2. `sani81@gmail.com / ghkdgmltn81!`로 로그인 (master_admin 계정)
3. `/master/subscription/investment` 접근
4. 가격 변경 → 저장 → "저장됨" 메시지 확인
5. `mcp__supabase__execute_sql`로 `SELECT monthly_base_price FROM user_subscription_plans WHERE feature_id='investment'` → 변경값 반영 확인

- [ ] **Step 4: Commit**

```bash
git add src/app/master/subscription/investment/page.tsx
git commit -m "feat(master): 자동매매 구독료 변경 UI"
```

---

## Task 11: 자동매매 구독 안내/결제 페이지

**Files:**
- Create: `src/app/investment/subscribe/page.tsx`

- [ ] **Step 1: 페이지 작성**

```tsx
// src/app/investment/subscribe/page.tsx
// 미구독자 안내 + PortOne SDK로 빌링키 발급 + register API 호출
'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle } from 'lucide-react'
import Script from 'next/script'

interface Plan {
  id: string
  display_name: string
  monthly_base_price: number
  revenue_share_pct: number
  description: string | null
  is_active: boolean
}

declare global {
  interface Window {
    PortOne?: {
      requestIssueBillingKey: (params: Record<string, unknown>) => Promise<{
        billingKey?: string
        cardNumber?: string
        cardName?: string
        code?: string
        message?: string
      }>
    }
  }
}

export default function InvestmentSubscribePage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/')
  }, [user, authLoading, router])

  useEffect(() => {
    fetch('/api/investment/subscription/status').then(r => r.json()).then(d => {
      if (d.subscription?.status === 'active') router.replace('/investment')
      setPlan(d.plan)
    })
  }, [router])

  const onSubscribe = async () => {
    if (!plan || !window.PortOne) return
    setSubmitting(true); setError(null)
    try {
      const res = await window.PortOne.requestIssueBillingKey({
        storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID,
        channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY,
        billingKeyMethod: 'CARD',
        issueId: `issue-${user?.id}-${Date.now()}`,
        issueName: '자동매매 구독',
      })
      if (!res?.billingKey) { setError(res?.message ?? '결제 수단 등록 실패'); return }

      const last4 = (res.cardNumber ?? '').slice(-4)
      const reg = await fetch('/api/investment/subscription/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingKey: res.billingKey,
          planId: plan.id,
          cardName: res.cardName ?? '',
          cardNumberLast4: last4,
        }),
      })
      const regJson = await reg.json()
      if (!reg.ok) { setError(regJson.error ?? '구독 등록 실패'); return }
      setDone(true)
      setTimeout(() => router.replace('/investment'), 1500)
    } finally { setSubmitting(false) }
  }

  if (authLoading || !plan) return <div className="p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>

  return (
    <>
      <Script src="https://cdn.portone.io/v2/browser-sdk.js" strategy="afterInteractive" />
      <div className="max-w-xl mx-auto p-8 space-y-6">
        <h1 className="text-2xl font-bold">{plan.display_name} 구독</h1>
        {plan.description && <p className="text-gray-600 text-sm">{plan.description}</p>}

        <div className="bg-white rounded-xl border p-6 space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">{plan.monthly_base_price.toLocaleString()}원</span>
            <span className="text-gray-500">/ 월</span>
          </div>
          <div className="text-sm text-gray-600">
            추가로 매월 실현 수익의 <b>{plan.revenue_share_pct}%</b>가 청구됩니다 (수익이 양수일 때만).
          </div>
          <ul className="text-sm space-y-1 text-gray-700 pt-2">
            <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> AI 자동매매 전략</li>
            <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> 전략 백테스트</li>
            <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> 실시간 포트폴리오</li>
            <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> 군중심리 분석 (포함)</li>
          </ul>
        </div>

        {error && <div className="text-red-600 text-sm">{error}</div>}
        {done && <div className="text-green-600 text-sm">구독이 시작되었습니다. 잠시 후 이동합니다.</div>}

        <button
          onClick={onSubscribe}
          disabled={submitting || done}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold"
        >
          {submitting ? '처리 중...' : '구독 시작'}
        </button>
      </div>
    </>
  )
}
```

- [ ] **Step 2: 환경변수 확인**

다음 변수가 `.env.local`에 있어야 함 (없으면 추가):
- `NEXT_PUBLIC_PORTONE_STORE_ID`
- `NEXT_PUBLIC_PORTONE_CHANNEL_KEY`
- `PORTONE_API_SECRET` (server)
- `PORTONE_STORE_ID` (server)

이미 기존 clinic 구독에서 사용 중인 변수면 그대로 재사용.

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 4: Commit**

```bash
git add src/app/investment/subscribe/page.tsx
git commit -m "feat(subscription): 자동매매 구독 안내/결제 페이지"
```

---

## Task 12: investment 레이아웃 게이팅

**Files:**
- Modify: `src/app/investment/layout.tsx`

- [ ] **Step 1: 현재 파일 확인**

Run: `head -60 src/app/investment/layout.tsx`
Expected: client component, useAuth로 미인증 시 `/`로 리다이렉트.

- [ ] **Step 2: 게이팅 로직 추가**

`useEffect` 인증 체크 다음에 구독 상태 체크 추가. `/investment/subscribe` 와 `/investment/connect`는 게이팅 면제 (구독 결제 흐름 자체).

```typescript
// 기존 useAuth + redirect useEffect 다음에 추가
const [gateChecked, setGateChecked] = useState(false)

useEffect(() => {
  if (!user) return
  // 면제 경로
  if (pathname === '/investment/subscribe' || pathname === '/investment/connect') {
    setGateChecked(true)
    return
  }
  fetch('/api/investment/subscription/status')
    .then(r => r.json())
    .then(d => {
      if (!d.subscription || d.subscription.status !== 'active') {
        router.replace('/investment/subscribe')
      } else setGateChecked(true)
    })
    .catch(() => setGateChecked(true))
}, [user, pathname, router])

if (!gateChecked && pathname !== '/investment/subscribe' && pathname !== '/investment/connect') {
  return (
    <div className="flex items-center justify-center min-h-screen bg-at-surface">
      <Loader2 className="w-8 h-8 animate-spin text-at-accent" />
    </div>
  )
}
```

기존 `if (loading) { ... }` 분기 바로 아래에 위 코드를 통합. `useState`/`useEffect`는 이미 import됨.

- [ ] **Step 3: 빌드 + Chrome DevTools 검증**

Run: `npm run build`

브라우저 검증:
1. `whitedc0902@gmail.com / ghkdgmltn81!`로 로그인 (개인 구독 없는 일반 계정)
2. `/investment` 접근 → 자동으로 `/investment/subscribe`로 리다이렉트되는지 확인

- [ ] **Step 4: Commit**

```bash
git add src/app/investment/layout.tsx
git commit -m "feat(investment): 구독 게이팅 레이아웃 통합"
```

---

## Task 13: 사이드바 권한 분리

**Files:**
- Modify: `src/config/menuConfig.ts`

- [ ] **Step 1: 자동매매 메뉴 항목 권한 제거**

`grep -n "investment" src/config/menuConfig.ts`로 위치 확인. 자동매매 메뉴 항목(`id: 'investment'`)의 `permissions: ['investment_view']` 라인을 빈 배열로 교체.

```typescript
// 변경 전
{
  id: 'investment',
  label: '주식 자동 매매',
  icon: 'TrendingUp',
  route: '/dashboard?tab=investment',
  permissions: ['investment_view'],
  categoryId: 'investment',
  order: 16.5,
},

// 변경 후
{
  id: 'investment',
  label: '주식 자동 매매',
  icon: 'TrendingUp',
  route: '/dashboard?tab=investment',
  permissions: [],   // 모든 사용자에게 노출. 진입 시 개인 구독 게이팅으로 전환.
  categoryId: 'investment',
  order: 16.5,
},
```

- [ ] **Step 2: 빌드 + permissions 체크 확인**

Run: `npm run check:permissions && npm run build`
Expected: 둘 다 통과.

- [ ] **Step 3: Commit**

```bash
git add src/config/menuConfig.ts
git commit -m "feat(menu): 자동매매 메뉴 권한 제거 (개인 구독 게이팅으로 전환)"
```

---

## Task 14: profit-snapshot cron을 user 단위 청구로 재작성

**Files:**
- Modify: `src/app/api/investment/profit-snapshot/route.ts`

- [ ] **Step 1: 라우트 재작성**

월말에 active user 구독자 전체에 대해 base + 5% 수익 청구 + payment 기록.

```typescript
// src/app/api/investment/profit-snapshot/route.ts
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { calculateMonthlyProfitForUser } from '@/lib/investmentProfit'
import { chargeBillingKey, getNextBillingDate } from '@/lib/portone'

function isLastDayOfMonthKST(d: Date): boolean {
  const kst = new Date(d.getTime() + 9 * 3600_000)
  const next = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1))
  return next.getUTCDate() === 1
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET ?? ''}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const now = new Date()
  if (!isLastDayOfMonthKST(now)) return NextResponse.json({ skipped: true })

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'ADMIN_UNAVAILABLE' }, { status: 500 })

  const { data: subs } = await admin
    .from('user_subscriptions')
    .select(`
      id, user_id, billing_key, plan:user_subscription_plans!inner(id, feature_id, monthly_base_price, revenue_share_pct, display_name, is_active)
    `)
    .eq('status', 'active')
    .eq('plan.feature_id', 'investment')
    .eq('plan.is_active', true)
    .not('billing_key', 'is', null)

  if (!subs?.length) return NextResponse.json({ snapshotted: 0 })

  const kst = new Date(now.getTime() + 9 * 3600_000)
  const year = kst.getUTCFullYear()
  const month = kst.getUTCMonth() + 1
  let charged = 0; let failed = 0

  for (const row of subs as unknown as Array<{
    id: string; user_id: string; billing_key: string;
    plan: { id: string; monthly_base_price: number; revenue_share_pct: number; display_name: string }
  }>) {
    const { realized } = await calculateMonthlyProfitForUser(row.user_id, year, month)
    const base = row.plan.monthly_base_price
    const share = Math.max(0, Math.floor(realized * (row.plan.revenue_share_pct / 100)))
    const total = base + share
    if (total <= 0) continue

    const { data: u } = await admin.from('users').select('name, email').eq('id', row.user_id).single()
    const name = (u as { name?: string } | null)?.name ?? ''
    const email = (u as { email?: string } | null)?.email ?? ''

    try {
      const result = await chargeBillingKey({
        clinicId: row.user_id, // paymentId prefix용
        billingKey: row.billing_key,
        amount: total,
        orderName: `${row.plan.display_name} ${year}-${String(month).padStart(2,'0')}`,
        customerName: name,
        customerEmail: email,
        noticeUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/investment/subscription/webhook`,
      })

      const paid = result.status === 'PAID'
      const periodStart = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10)
      const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)

      await admin.from('user_subscription_payments').insert({
        user_id: row.user_id,
        subscription_id: row.id,
        portone_payment_id: result.paymentId,
        portone_tx_id: result.txId ?? null,
        amount: total,
        base_amount: base,
        revenue_share_amount: share,
        realized_profit_basis: Math.max(0, Math.floor(realized)),
        status: paid ? 'paid' : 'failed',
        paid_at: paid ? (result.paidAt ?? now.toISOString()) : null,
        failed_at: paid ? null : now.toISOString(),
        fail_reason: paid ? null : (result.failReason ?? '결제 실패'),
        order_name: `${row.plan.display_name} ${year}-${String(month).padStart(2,'0')}`,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
      })

      if (paid) {
        const nextEnd = getNextBillingDate(now)
        await admin.from('user_subscriptions').update({
          current_period_start: now.toISOString(),
          current_period_end: nextEnd.toISOString(),
          next_billing_date: nextEnd.toISOString(),
          retry_count: 0, next_retry_at: null,
          updated_at: now.toISOString(),
        }).eq('id', row.id)
        charged++
      } else {
        await admin.from('user_subscriptions').update({
          status: 'past_due', retry_count: 1,
          next_retry_at: new Date(now.getTime() + 12 * 3600_000).toISOString(),
          updated_at: now.toISOString(),
        }).eq('id', row.id)
        failed++
      }
    } catch (e) {
      console.error('[profit-snapshot] charge failed:', row.user_id, e)
      failed++
    }
  }

  return NextResponse.json({ charged, failed, total: subs.length })
}
```

기존 GET export가 있다면 유지 가능 — 위는 POST. vercel.json에서 `path: /api/investment/profit-snapshot, schedule: '0 14 28-31 * *'` 같은 KST 23시 매월 말일 트리거 사용 (실제 일자 분기는 코드 내부의 `isLastDayOfMonthKST`).

- [ ] **Step 2: 빌드 + dry-run 검증**

Run: `npm run build`
Expected: 성공.

dev 환경에서 강제 실행 테스트:
- 임시로 `isLastDayOfMonthKST(now)` 부분을 `true`로 바꾸지 말고, 다음 SQL로 모의 활성 구독 1건 생성 후 호출:

```sql
-- (테스트 환경에서만) 모의 활성 구독 + 빌링키
INSERT INTO user_subscriptions (user_id, plan_id, status, billing_key, current_period_start, current_period_end, next_billing_date)
SELECT
  '<test_user_uuid>',
  (SELECT id FROM user_subscription_plans WHERE feature_id='investment'),
  'active', 'TEST_BILLING_KEY',
  NOW(), NOW() + interval '30 days', NOW() + interval '30 days'
;
```

월말 테스트는 production 검증 단계에서 실제 cron 실행으로.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/investment/profit-snapshot/route.ts
git commit -m "feat(billing): user 단위 월말 청구 cron (정액+수익공유 5%)"
```

---

## Task 15: 기존 clinic 구독자 자동 이관 스크립트

**Files:**
- Create: `scripts/migrate-investment-subscriptions-to-user.ts`

- [ ] **Step 1: 이관 스크립트 작성**

```typescript
// scripts/migrate-investment-subscriptions-to-user.ts
//
// 1회성 마이그레이션: clinic 단위 자동매매 구독을 개인 단위로 이관.
//
// 사용법:
//   npx tsx scripts/migrate-investment-subscriptions-to-user.ts --dry-run
//   npx tsx scripts/migrate-investment-subscriptions-to-user.ts --apply
//
// 환경변수:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필수.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE 환경변수 누락'); process.exit(1)
}
const apply = process.argv.includes('--apply')

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  // 1. 자동매매 clinic 구독 조회
  const { data: clinicSubs } = await supabase
    .from('subscriptions')
    .select(`
      id, clinic_id, billing_key, card_name, card_number_last4,
      current_period_start, current_period_end, next_billing_date, retry_count,
      plan:subscription_plans!inner(id, feature_id, display_name)
    `)
    .in('status', ['active','past_due','trialing'])
    .eq('plan.feature_id', 'investment')

  console.log(`[migrate] 대상 clinic 구독: ${clinicSubs?.length ?? 0}건`)
  if (!clinicSubs?.length) return

  // 2. 신규 user_subscription_plans.investment id
  const { data: planRow } = await supabase
    .from('user_subscription_plans')
    .select('id')
    .eq('feature_id', 'investment')
    .single()
  const userPlanId = (planRow as { id: string } | null)?.id
  if (!userPlanId) { console.error('user_subscription_plans.investment 시드 누락'); process.exit(1) }

  let migrated = 0; let skipped = 0; let multiUserClinics = 0

  for (const cs of clinicSubs as Array<{
    id: string; clinic_id: string; billing_key: string | null;
    card_name: string | null; card_number_last4: string | null;
    current_period_start: string | null; current_period_end: string | null;
    next_billing_date: string | null; retry_count: number;
  }>) {
    // 3. 활동 사용자 후보 추출
    const { data: stratUsers } = await supabase
      .from('investment_strategies').select('user_id')
      .eq('clinic_id', cs.clinic_id)
    const stratIds = new Set((stratUsers ?? []).map(r => (r as { user_id: string }).user_id))

    const { data: clinicUsers } = await supabase
      .from('users')
      .select('id, role, created_at')
      .eq('clinic_id', cs.clinic_id)
    const allUsers = (clinicUsers ?? []) as Array<{ id: string; role: string; created_at: string }>

    const { data: credUsers } = await supabase
      .from('user_broker_credentials').select('user_id')
      .in('user_id', allUsers.map(u => u.id))
    const credIds = new Set((credUsers ?? []).map(r => (r as { user_id: string }).user_id))

    let candidates = allUsers.filter(u => stratIds.has(u.id) || credIds.has(u.id))
    if (candidates.length === 0) {
      const owner = allUsers.find(u => u.role === 'owner')
      if (owner) candidates = [owner]
    }
    if (candidates.length > 1) multiUserClinics++

    // 4. created_at 오래된 순 정렬
    candidates.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    if (candidates.length === 0) {
      console.log(`[skip] clinic=${cs.clinic_id}: 후보 사용자 없음`)
      skipped++
      continue
    }

    for (let i = 0; i < candidates.length; i++) {
      const u = candidates[i]
      const isFirst = i === 0
      const billingKey = isFirst ? cs.billing_key : null

      console.log(`${apply ? '[apply]' : '[dry-run]'} migrate clinic=${cs.clinic_id} → user=${u.id} (first=${isFirst}, billingKey=${billingKey ? 'yes' : 'no'})`)

      if (!apply) continue

      const { error } = await supabase.from('user_subscriptions').insert({
        user_id: u.id,
        plan_id: userPlanId,
        status: 'active',
        billing_key: billingKey,
        card_name: isFirst ? cs.card_name : null,
        card_number_last4: isFirst ? cs.card_number_last4 : null,
        current_period_start: cs.current_period_start,
        current_period_end: cs.current_period_end,
        next_billing_date: cs.next_billing_date,
        retry_count: cs.retry_count ?? 0,
        migrated_from_clinic_id: cs.clinic_id,
        migrated_at: new Date().toISOString(),
      })
      if (error) {
        if (error.message.includes('duplicate key')) {
          console.log(`  → 이미 존재 (skip)`)
        } else {
          console.error(`  → 실패: ${error.message}`)
        }
      }
    }

    if (apply) {
      // 5. 기존 clinic 구독 cancel 처리
      await supabase.from('subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', cs.id)
      migrated++
    }
  }

  console.log(`\n[summary] migrated=${migrated} skipped=${skipped} multi-user clinics=${multiUserClinics}`)
}

main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: dry-run 실행 + 보고서 검토**

Run:
```bash
npx tsx scripts/migrate-investment-subscriptions-to-user.ts --dry-run
```

Expected: 대상 clinic 구독 N건과 각 매핑이 출력. 첫 후보(billingKey=yes), 추가 후보(billingKey=no) 분기 확인. 실제 INSERT는 일어나지 않음.

검토 후 사용자에게 결과 공유. 사용자 승인 시 다음 단계.

- [ ] **Step 3: --apply 실행 (사용자 승인 후)**

Run:
```bash
npx tsx scripts/migrate-investment-subscriptions-to-user.ts --apply
```

Expected: `[summary] migrated=N skipped=M multi-user clinics=K` 출력.

검증:
```sql
SELECT COUNT(*) FROM user_subscriptions WHERE migrated_from_clinic_id IS NOT NULL;
SELECT COUNT(*) FROM subscriptions s
  JOIN subscription_plans p ON p.id = s.plan_id
  WHERE p.feature_id = 'investment' AND s.status = 'cancelled';
```

두 카운트가 일치해야 함.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-investment-subscriptions-to-user.ts
git commit -m "feat(migration): clinic 자동매매 구독 → 개인 구독 이관 스크립트"
```

---

## Task 16: 통합 검증 + develop 푸시

- [ ] **Step 1: 빌드 + 린트 + 권한 체크**

```bash
npm run check:permissions && npm run lint && npm run build
```
Expected: 모두 통과.

- [ ] **Step 2: 일반 사용자 흐름 검증 (Chrome DevTools MCP)**

테스트 계정: `whitedc0902@gmail.com / ghkdgmltn81!`

1. 미구독 상태에서 `/investment` 접근 → `/investment/subscribe` 자동 리다이렉트
2. 구독 페이지에서 가격(월 9,900 + 수익 5%) 표시 확인
3. (실제 결제는 PortOne 테스트 카드. 환경 가능 시) 구독 → `/investment` 정상 진입
4. `/api/investment/subscription/status` 호출 결과에 `subscription.status='active'` 확인

- [ ] **Step 3: master 흐름 검증**

테스트 계정: `sani81@gmail.com / ghkdgmltn81!`

1. `/master/subscription/investment` 접근
2. 월 정액 12,000으로 변경 → 저장 → SQL로 반영 확인
3. 다시 9,900으로 복구

- [ ] **Step 4: develop 푸시**

```bash
git push origin develop
```

푸시 실패 시: `git pull --rebase origin develop && git push origin develop` 재시도.

- [ ] **Step 5: PR 생성 → main 머지**

```bash
gh pr create --title "feat: 자동매매 개인 구독 전환 + master 가격 관리" \
  --base main --head develop \
  --body "$(cat <<'EOF'
## Summary
- 자동매매 구독을 clinic → 개인(user) 단위로 전환
- 월 정액 + 수익 5% 하이브리드, master 페이지에서 가격 변경 가능
- 기존 clinic 자동매매 구독자 자동 이관 (1회성 스크립트)
- 자동매매 메뉴 권한(`investment_view`) 분리, 단일 게이팅 헬퍼로 통합

## Test plan
- [ ] 미구독자 `/investment` 접근 → `/investment/subscribe` 리다이렉트
- [ ] 구독 등록 → status='active' 전이
- [ ] 월말 cron (테스트 모의) → user_subscription_payments에 base+share 분해 기록
- [ ] master 페이지 가격 변경 반영
- [ ] 마이그레이션 스크립트 dry-run + apply 보고 일치
EOF
)"
```

main에 머지: `gh pr merge <number> --merge --admin`.

---

## Self-Review

### Spec coverage
- 5.1 데이터 모델 → Task 1
- 6.1 게이팅 헬퍼 → Task 3
- 6.2 결제 흐름 (서비스 + 라우트 4개) → Tasks 4, 5, 6, 8
- 6.3 월말 청구 cron → Task 14 + Task 7 (user 수익 함수)
- 6.4 사이드바 메뉴 변경 → Task 13 (자식 메뉴는 Plan 2에서)
- 6.5 자동 이관 스크립트 → Task 15
- C(7) master 가격 관리 UI → Tasks 9, 10
- 11.2 인프라 테스트 항목 → Task 16
- 12 출시 절차 → Task 16

### 미커버 항목 점검
- spec 11.2 "결제 실패 시 status 전이"는 Task 8 webhook으로 cover. 정식 검증은 PortOne 테스트 환경에서 수동 시뮬.
- spec 13 "월 정액 시드 9,900"은 Task 1 시드에 포함.
- spec 13 "수익 5%"는 Task 1 시드에 포함.

### Type consistency
- `UserSubscription`/`UserSubscriptionPlan` 사용처 일관 (Tasks 2, 3, 4, 5, 9, 10, 11, 12).
- 게이팅 함수명 `checkInvestmentSubscription`/`requireInvestmentSubscription` 일관.
- `calculateMonthlyProfitForUser(userId, year, month)` Task 7 정의 → Task 5, 14에서 사용.

### Placeholder scan
- 각 Step에 실제 코드 또는 명령 포함.
- "TBD"/"TODO" 없음.
- "Add validation" 같은 모호 지시 없음.
