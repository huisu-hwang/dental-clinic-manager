# 구독 플랜 개편: 직원 수 기반 게이팅 + 통합 화면 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기본 기능을 직원 수 구간별로 과금하고, 인원 상한 초과 시 원장 승인을 홀드 + 결제 게이트로 강제하며, 플랜 선택 UI를 단일 화면 3섹션으로 통합한다.

**Architecture:** 신규 서버 API `/api/staff/approve`에 인원 상한 가드를 심고 기존 클라이언트 승인 경로(`dataService.approveUser`)를 이 API 호출로 리팩터한다. 포트원 웹훅에서 결제 성공 시 `subscription_payment_succeeded` 알림을 생성해 원장 대시보드가 자동 승인 모달을 띄운다. 기존 `PlanSelectModal`의 탭 구조를 제거하고 3섹션(파랑/보라/초록) 단일 화면으로 재구성한다.

**Tech Stack:** Next.js 15 · React 19 · TypeScript · Supabase (PostgreSQL) · Tailwind CSS 4 · shadcn/ui · 포트원(PortOne) v2 · Vercel Cron · Chrome DevTools MCP (수동 E2E)

**Spec:** [`docs/superpowers/specs/2026-04-19-subscription-headcount-gating-design.md`](../specs/2026-04-19-subscription-headcount-gating-design.md)

**Test Policy:** 이 리포지토리에는 Jest/Vitest 등 자동 테스트 러너가 없다. 각 Task의 "검증" 단계는 `npm run build` 통과 + Chrome DevTools MCP 수동 E2E로 대체한다 (CLAUDE.md 최상위 지시사항).

---

## 파일 구조

### 신규 파일
- `supabase/migrations/20260419_subscription_headcount_gating.sql` — 플랜 경계 조정, premium-bundle, feature-investment, 환불 컬럼
- `supabase/migrations/20260419_investment_profit_snapshots.sql` — 스냅샷 테이블 및 RLS
- `src/lib/subscriptionPlans.ts` — `findPlanByHeadcount`, `formatPlanPrice` 순수 유틸
- `src/lib/investmentProfit.ts` — 월별 수익 계산 stub + 시그니처 고정
- `src/lib/subscriptionReconciler.ts` — 퇴사/삭제 시 플랜 재조정 헬퍼
- `src/app/api/staff/approve/route.ts` — 원장용 승인 API (인원 상한 가드)
- `src/app/api/staff/approve-bulk-auto/route.ts` — 결제 후 전체 자동 승인
- `src/app/api/subscription/downgrade/route.ts` — 다운그레이드 + 부분 환불
- `src/app/api/investment/profit-snapshot/route.ts` — 월말 크론
- `src/app/api/investment/profit-snapshot/refresh/route.ts` — 수동 재집계
- `src/components/Subscription/UpgradeRequiredModal.tsx` — 결제 게이트 모달
- `src/components/Subscription/PostPaymentApprovalModal.tsx` — 결제 후 자동/개별 승인 토글
- `src/components/Subscription/PerformanceSection.tsx` — 주식 자동매매 카드
- `src/components/Subscription/BasicPlansSection.tsx` — 기본 5개 플랜 카드 섹션
- `src/components/Subscription/PremiumBundleSection.tsx` — 프리미엄 패키지 카드 섹션
- `src/components/Subscription/DowngradeConfirmModal.tsx` — 퇴사/다운그레이드 환불 확인
- `src/components/Dashboard/PendingApprovalBanner.tsx` — 대시보드 상단 고정 배너

### 수정 파일
- `src/lib/portone.ts` — `partialRefund` 추가
- `src/lib/dataService.ts` — `approveUser`를 `/api/staff/approve` 호출로 리팩터
- `src/lib/subscriptionService.ts` — `countActiveEmployees`, `getActivePaymentForCurrentPeriod` 추가
- `src/app/api/webhooks/portone/route.ts` — 결제 성공 시 알림 생성
- `src/app/api/admin/users/approve/route.ts` — master_admin 경로에도 상한 가드 적용
- `src/types/notification.ts` — enum에 2개 타입 추가
- `src/components/Subscription/PlanSelectModal.tsx` — 탭 제거, 3섹션 조립
- `src/components/Management/StaffManagement.tsx` — 승인 실패 응답 처리 + 모달 연결
- `src/config/menuConfig.ts` — `formatPlanPrice` 적용 지점 정비 (필요 시)
- `src/app/dashboard/page.tsx` — `PendingApprovalBanner`, `PostPaymentApprovalModal` 장착
- `vercel.json` — `profit-snapshot` 크론 등록

---

## Task 0: 준비

### 파일:
- Check: `package.json`, `supabase/migrations/`, 현재 git 상태

- [ ] **Step 1: develop 브랜치 최신화**

Run:
```bash
git checkout develop
git pull --rebase
git status
```
Expected: clean working tree 또는 이미 추적 중인 수정만 표시.

- [ ] **Step 2: 현재 DB 스키마 점검 (참고용)**

Run (Supabase MCP 가용 가정):
```
mcp__supabase__list_tables({ project_id: "beahjntkmkfhpcbhfnrr", schemas: ["public"] })
```
확인: `clinics`, `users`, `subscriptions`, `subscription_plans`, `subscription_payments`, `user_notifications` 존재.

- [ ] **Step 3: 빌드 베이스라인**

Run: `npm run build`
Expected: 성공. 실패 시 우선 원인을 기록 후 이 플랜 Task 진행 중 재발한 에러와 분리.

---

## Task 1: 플랜 유틸 (`subscriptionPlans.ts`)

### 파일:
- Create: `src/lib/subscriptionPlans.ts`

- [ ] **Step 1: 유틸 파일 생성**

```ts
// src/lib/subscriptionPlans.ts
import type { SubscriptionPlan } from '@/types/subscription'

export type HeadcountPlanName = 'free' | 'starter' | 'growth' | 'pro' | 'enterprise'

/**
 * 총 재직자 수에 맞는 헤드카운트 플랜 이름을 반환한다.
 * 경계: Free 1~4, Starter 5~10, Growth 11~20, Pro 21~50, Enterprise 51+
 */
export function findPlanByHeadcount(total: number): HeadcountPlanName {
  if (total <= 4) return 'free'
  if (total <= 10) return 'starter'
  if (total <= 20) return 'growth'
  if (total <= 50) return 'pro'
  return 'enterprise'
}

/**
 * 플랜 가격을 일관된 문구로 포맷한다.
 * - 주식 자동매매(feature_id='investment'): "수익의 5%"
 * - Enterprise: "맞춤 문의"
 * - price=0: "무료"
 * - 그 외: "월 N,NNN원"
 */
export function formatPlanPrice(plan: Pick<SubscriptionPlan, 'name' | 'price' | 'feature_id'>): string {
  if (plan.feature_id === 'investment') return '수익의 5%'
  if (plan.name === 'enterprise') return '맞춤 문의'
  if (plan.price === 0) return '무료'
  return `월 ${plan.price.toLocaleString()}원`
}

/**
 * 현재 재직자 수와 승인 대기 중인 인원을 합산해 신규 플랜이 필요한지 판정한다.
 */
export function requiresUpgrade(params: {
  currentActive: number
  pendingToApprove: number
  currentLimit: number
}): boolean {
  return params.currentActive + params.pendingToApprove > params.currentLimit
}
```

- [ ] **Step 2: TypeScript 타입 확인**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 신규 파일 관련 에러 0. `SubscriptionPlan` import 경로는 `src/types/subscription.ts`에서 실제 export 이름과 일치해야 한다 (필요 시 재확인 후 수정).

- [ ] **Step 3: 커밋**

```bash
git add src/lib/subscriptionPlans.ts
git commit -m "$(cat <<'EOF'
feat(subscription): findPlanByHeadcount / formatPlanPrice 유틸 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: DB 마이그레이션 — 플랜 경계 및 신규 플랜

### 파일:
- Create: `supabase/migrations/20260419_subscription_headcount_gating.sql`
- Apply via: `mcp__supabase__apply_migration`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- supabase/migrations/20260419_subscription_headcount_gating.sql
-- 구독 플랜 개편: 직원 수 게이팅 + 프리미엄/주식매매 플랜 정비 + 환불 컬럼

BEGIN;

-- 1. Free 상한 4명, Starter 하한 5명으로 조정
UPDATE subscription_plans
   SET max_users = 4, description = '4인 이하 사업장 무료'
 WHERE name = 'free';

UPDATE subscription_plans
   SET min_users = 5, description = '5~10인 사업장'
 WHERE name = 'starter';

-- 2. 프리미엄 패키지 (UI는 이미 premium-bundle 가정)
INSERT INTO subscription_plans
  (name, display_name, type, feature_id, price, description, features, sort_order)
VALUES
  ('premium-bundle', '프리미엄 패키지', 'feature', 'premium-bundle', 499000,
   'AI 분석 + 경영 현황 + 마케팅 자동화 통합',
   '["AI 데이터 분석","경영 현황 관리","마케팅 자동화"]'::jsonb, 9)
ON CONFLICT (name) DO UPDATE
   SET price = EXCLUDED.price,
       feature_id = EXCLUDED.feature_id,
       description = EXCLUDED.description,
       features = EXCLUDED.features,
       display_name = EXCLUDED.display_name,
       sort_order = EXCLUDED.sort_order;

-- 3. 주식 자동매매 플랜 (UI priceLabel: '수익의 5%' 유지)
INSERT INTO subscription_plans
  (name, display_name, type, feature_id, price, description, features, sort_order)
VALUES
  ('feature-investment', '주식 자동매매', 'feature', 'investment', 0,
   '수익의 5% 성과 연동 과금',
   '["AI 자동매매 전략","실시간 포트폴리오","백테스트"]'::jsonb, 13)
ON CONFLICT (name) DO UPDATE
   SET description = EXCLUDED.description,
       features = EXCLUDED.features;

-- 4. 환불 컬럼 (subscription_payments)
ALTER TABLE subscription_payments
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_reason   TEXT,
  ADD COLUMN IF NOT EXISTS refunded_at     TIMESTAMPTZ;

COMMIT;
```

- [ ] **Step 2: 마이그레이션 적용**

Run (MCP):
```
mcp__supabase__apply_migration({
  project_id: "beahjntkmkfhpcbhfnrr",
  name: "20260419_subscription_headcount_gating",
  query: <Step 1 전체 SQL>
})
```

- [ ] **Step 3: 적용 결과 검증**

Run (MCP):
```sql
SELECT name, min_users, max_users, price
  FROM subscription_plans
 WHERE type = 'headcount'
 ORDER BY sort_order;
```
Expected:
| name | min_users | max_users | price |
|---|---|---|---|
| free | 0 | 4 | 0 |
| starter | 5 | 10 | 39000 |
| growth | 11 | 20 | 79000 |
| pro | 21 | 50 | 149000 |
| enterprise | 51 | 9999 | 0 |

```sql
SELECT name, price, feature_id FROM subscription_plans
 WHERE name IN ('premium-bundle','feature-investment');
```
Expected: `premium-bundle` 499000 / `feature-investment` 0 · `investment`.

```sql
\d subscription_payments
```
Expected: `refunded_amount`, `refund_reason`, `refunded_at` 컬럼 존재.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260419_subscription_headcount_gating.sql
git commit -m "$(cat <<'EOF'
feat(db): subscription_plans 경계 조정 + premium-bundle/feature-investment 추가

- Free 1~4, Starter 5~10 경계 조정
- premium-bundle 499,000원 신규 (UI 통합)
- feature-investment 0원 + 5% 설명 명시
- subscription_payments 부분 환불 컬럼 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: DB 마이그레이션 — `investment_profit_snapshots`

### 파일:
- Create: `supabase/migrations/20260419_investment_profit_snapshots.sql`

- [ ] **Step 1: SQL 작성**

```sql
-- supabase/migrations/20260419_investment_profit_snapshots.sql
-- 주식 자동매매 월별 수익 스냅샷 (예정 정산 5% 표시용)

CREATE TABLE IF NOT EXISTS investment_profit_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  realized_profit NUMERIC(15,2) NOT NULL DEFAULT 0,
  unrealized_profit NUMERIC(15,2) NOT NULL DEFAULT 0,
  expected_fee NUMERIC(15,2) GENERATED ALWAYS AS
    (GREATEST(realized_profit, 0) * 0.05) STORED,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_investment_profit_clinic_ym
  ON investment_profit_snapshots (clinic_id, year DESC, month DESC);

ALTER TABLE investment_profit_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "클리닉 멤버만 조회" ON investment_profit_snapshots;
CREATE POLICY "클리닉 멤버만 조회"
  ON investment_profit_snapshots FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "서비스 롤만 기록" ON investment_profit_snapshots;
CREATE POLICY "서비스 롤만 기록"
  ON investment_profit_snapshots FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "서비스 롤만 갱신" ON investment_profit_snapshots;
CREATE POLICY "서비스 롤만 갱신"
  ON investment_profit_snapshots FOR UPDATE
  USING (auth.role() = 'service_role');
```

- [ ] **Step 2: 적용**

Run:
```
mcp__supabase__apply_migration({
  project_id: "beahjntkmkfhpcbhfnrr",
  name: "20260419_investment_profit_snapshots",
  query: <Step 1 SQL>
})
```

- [ ] **Step 3: 검증**

```sql
SELECT column_name, data_type, generation_expression
  FROM information_schema.columns
 WHERE table_name = 'investment_profit_snapshots'
 ORDER BY ordinal_position;
```
Expected: `expected_fee`가 `GREATEST(realized_profit, 0) * 0.05` GENERATED.

테스트 삽입 + 자동 계산 확인:
```sql
INSERT INTO investment_profit_snapshots (clinic_id, year, month, realized_profit, unrealized_profit)
VALUES (
  (SELECT id FROM clinics LIMIT 1), 2099, 1, 1000000, 50000
) RETURNING expected_fee;
-- Expected: 50000.00

INSERT INTO investment_profit_snapshots (clinic_id, year, month, realized_profit, unrealized_profit)
VALUES (
  (SELECT id FROM clinics LIMIT 1), 2099, 2, -500000, 0
) RETURNING expected_fee;
-- Expected: 0.00

DELETE FROM investment_profit_snapshots WHERE year = 2099;
```

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/20260419_investment_profit_snapshots.sql
git commit -m "$(cat <<'EOF'
feat(db): investment_profit_snapshots 테이블 추가

- 월별 실현/평가 수익 + GENERATED expected_fee(5%) 컬럼
- clinic_id, year, month UNIQUE
- RLS: SELECT 클리닉 멤버, INSERT/UPDATE 서비스 롤

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 알림 타입 확장

### 파일:
- Modify: `src/types/notification.ts`

- [ ] **Step 1: 현재 enum 확인**

Run: `grep -n "subscription_" src/types/notification.ts`
확인: 기존 notification type 열거체에 추가할 위치 파악.

- [ ] **Step 2: 두 타입 추가**

Edit `src/types/notification.ts`의 `UserNotificationType` 유니온에 아래 두 항목 추가 (기존 마지막 타입 뒤에):
```ts
  | 'subscription_upgrade_required'
  | 'subscription_payment_succeeded'
```

그리고 같은 파일의 payload 타입 정의 블록(있다면)에 추가:
```ts
export interface SubscriptionUpgradeRequiredPayload {
  recommendedPlan: string       // 'starter' 등
  currentActive: number
  pendingCount: number
}

export interface SubscriptionPaymentSucceededPayload {
  pendingCount: number
  newLimit: number
  newPlanName: string
}
```

- [ ] **Step 3: 빌드로 타입 파급 확인**

Run: `npm run build`
Expected: 성공. 실패 시 enum 참조 누락된 switch/case를 기본 분기 추가로 수정.

- [ ] **Step 4: 커밋**

```bash
git add src/types/notification.ts
git commit -m "feat(notifications): subscription_upgrade_required/payment_succeeded 타입 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `subscriptionService` 보조 유틸 추가

### 파일:
- Modify: `src/lib/subscriptionService.ts`

- [ ] **Step 1: `countActiveEmployees` 추가**

`src/lib/subscriptionService.ts` 맨 아래에 append:
```ts
/**
 * 해당 병원의 재직 중 승인된 직원 수를 반환한다.
 * (status='active' AND employment_status='active')
 */
export async function countActiveEmployees(clinicId: string): Promise<number> {
  const supabase = await ensureConnection()
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('status', 'active')
    .eq('employment_status', 'active')
  if (error) throw new Error(`countActiveEmployees: ${error.message}`)
  return count ?? 0
}

/**
 * 현재 구독의 마지막 성공 결제를 반환한다 (부분 환불 기준 계산용).
 */
export async function getLatestPaidPayment(clinicId: string) {
  const supabase = await ensureConnection()
  const { data, error } = await supabase
    .from('subscription_payments')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getLatestPaidPayment: ${error.message}`)
  return data
}
```

> `ensureConnection` import가 이미 파일 상단에 있는지 확인 후 없으면 추가.

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/subscriptionService.ts
git commit -m "feat(subscription): countActiveEmployees / getLatestPaidPayment 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 원장용 승인 API `/api/staff/approve`

### 파일:
- Create: `src/app/api/staff/approve/route.ts`

- [ ] **Step 1: API 라우트 구현**

```ts
// src/app/api/staff/approve/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  countActiveEmployees,
  getSubscription,
  getPlanById,
} from '@/lib/subscriptionService'
import { findPlanByHeadcount, requiresUpgrade } from '@/lib/subscriptionPlans'

const FREE_LIMIT = 4

export async function POST(req: Request) {
  const body = await req.json()
  const userIds: string[] = body.userIds ?? (body.userId ? [body.userId] : [])
  const permissions: string[] | undefined = body.permissions
  if (userIds.length === 0) {
    return NextResponse.json({ error: 'NO_USER_IDS' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { data: me, error: meErr } = await supabase
    .from('users')
    .select('id, clinic_id, role')
    .eq('id', user.id)
    .single()
  if (meErr || !me?.clinic_id) {
    return NextResponse.json({ error: 'NO_CLINIC' }, { status: 403 })
  }
  if (!['owner', 'master_admin'].includes(me.role)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  // 인원 상한 가드
  const [activeCount, subscription] = await Promise.all([
    countActiveEmployees(me.clinic_id),
    getSubscription(me.clinic_id),
  ])

  const currentPlan = subscription?.plan_id
    ? await getPlanById(subscription.plan_id)
    : null
  const currentLimit = currentPlan?.max_users ?? FREE_LIMIT

  if (requiresUpgrade({
    currentActive: activeCount,
    pendingToApprove: userIds.length,
    currentLimit,
  })) {
    const projected = activeCount + userIds.length
    return NextResponse.json({
      error: 'UPGRADE_REQUIRED',
      currentPlan: currentPlan?.name ?? 'free',
      currentLimit,
      currentActive: activeCount,
      pendingToApprove: userIds.length,
      recommendedPlan: findPlanByHeadcount(projected),
    }, { status: 403 })
  }

  // 승인 실행 (기존 dataService 로직과 동일한 업데이트)
  const updatePayload: Record<string, unknown> = {
    status: 'active',
    approved_at: new Date().toISOString(),
  }
  if (permissions && permissions.length > 0) updatePayload.permissions = permissions

  const { error: upErr } = await supabase
    .from('users')
    .update(updatePayload)
    .in('id', userIds)
    .eq('clinic_id', me.clinic_id)

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, approvedCount: userIds.length })
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공. `getPlanById`/`getSubscription` import 경로가 실제 export 이름과 일치하는지 재확인 (Task 5에서 `subscriptionService.ts`를 확장한 파일).

- [ ] **Step 3: 수동 검증 (DevTools MCP — 원장 계정)**

`whitedc0902@gmail.com` 로그인 → 직원 관리 진입 → 승인 가능한 pending 없을 때 curl로 직접 호출:
```
POST /api/staff/approve  body: { "userIds": ["<임의 UUID>"] }
```
Expected:
- 상한 이내 → `success: true`
- 상한 초과(시뮬레이션 위해 pending 여러 건) → 403 + `UPGRADE_REQUIRED`

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/staff/approve/route.ts
git commit -m "feat(api): 원장용 승인 API + 인원 상한 가드

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `dataService.approveUser`를 새 API 호출로 리팩터

### 파일:
- Modify: `src/lib/dataService.ts:1737-1778`

- [ ] **Step 1: 함수 본문 교체**

기존 메서드를 아래로 치환:
```ts
  async approveUser(userId: string, clinicId: string | null, permissions?: string[]) {
    try {
      const res = await fetch('/api/staff/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          userIds: [userId],
          permissions,
        }),
      })
      const data = await res.json().catch(() => ({}))

      if (res.status === 403 && data?.error === 'UPGRADE_REQUIRED') {
        // 호출부가 구분해 처리할 수 있게 구조화된 응답 반환
        return {
          upgradeRequired: true,
          currentPlan: data.currentPlan,
          currentLimit: data.currentLimit,
          currentActive: data.currentActive,
          pendingToApprove: data.pendingToApprove,
          recommendedPlan: data.recommendedPlan,
        } as const
      }

      if (!res.ok) {
        return { error: data?.error ?? '승인 처리에 실패했습니다.' }
      }
      return { success: true as const }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      return { error: errorMessage }
    }
  },
```

- [ ] **Step 2: 호출부 타입 호환 확인**

Run:
```
grep -rn "approveUser(" src --include="*.ts" --include="*.tsx"
```
각 호출지점에서 `result.error` / `result.success` 사용을 확인. 신규 `upgradeRequired` 분기를 처리하지 않는 지점은 Task 9에서 `StaffManagement.tsx`만 업데이트하고, 다른 호출부는 기존처럼 `error`도 유지되므로 영향 없음.

- [ ] **Step 3: 빌드**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 4: 커밋**

```bash
git add src/lib/dataService.ts
git commit -m "refactor(dataService): approveUser를 /api/staff/approve 호출로 전환

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: master_admin 승인 API에 동일 가드 적용

### 파일:
- Modify: `src/app/api/admin/users/approve/route.ts`

- [ ] **Step 1: 상한 가드 블록 삽입**

기존 `requireMasterAdmin()` 성공 후, 사용자 정보 조회(5단계) 이전에 삽입:
```ts
import { countActiveEmployees, getSubscription, getPlanById } from '@/lib/subscriptionService'
import { findPlanByHeadcount, requiresUpgrade } from '@/lib/subscriptionPlans'

// ... 기존 requireMasterAdmin 통과 후
const targetClinicId = body.clinicId
if (targetClinicId) {
  const [activeCount, subscription] = await Promise.all([
    countActiveEmployees(targetClinicId),
    getSubscription(targetClinicId),
  ])
  const currentPlan = subscription?.plan_id ? await getPlanById(subscription.plan_id) : null
  const currentLimit = currentPlan?.max_users ?? 4
  if (requiresUpgrade({ currentActive: activeCount, pendingToApprove: 1, currentLimit })) {
    return NextResponse.json({
      error: 'UPGRADE_REQUIRED',
      currentPlan: currentPlan?.name ?? 'free',
      currentLimit,
      currentActive: activeCount,
      pendingToApprove: 1,
      recommendedPlan: findPlanByHeadcount(activeCount + 1),
    }, { status: 403 })
  }
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/admin/users/approve/route.ts
git commit -m "feat(api): master_admin 승인 경로에도 인원 상한 가드 적용

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: `UpgradeRequiredModal` 컴포넌트

### 파일:
- Create: `src/components/Subscription/UpgradeRequiredModal.tsx`

- [ ] **Step 1: 컴포넌트 생성**

```tsx
// src/components/Subscription/UpgradeRequiredModal.tsx
'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatPlanPrice } from '@/lib/subscriptionPlans'
import type { SubscriptionPlan } from '@/types/subscription'

interface Props {
  open: boolean
  onClose: () => void
  onPayNow: () => void
  context: {
    currentPlan: string
    currentLimit: number
    currentActive: number
    pendingToApprove: number
    recommendedPlan: string
  }
}

export default function UpgradeRequiredModal({ open, onClose, onPayNow, context }: Props) {
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null)

  useEffect(() => {
    if (!open) return
    fetch(`/api/subscription/plans?name=${context.recommendedPlan}`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.plans ?? []
        setPlan(list.find((p: SubscriptionPlan) => p.name === context.recommendedPlan) ?? null)
      })
      .catch(() => setPlan(null))
  }, [open, context.recommendedPlan])

  const projected = context.currentActive + context.pendingToApprove

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>구독 업그레이드가 필요합니다</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p>
            현재 플랜(<b>{context.currentPlan}</b>)의 상한은 <b>{context.currentLimit}명</b>입니다.
            재직자 {context.currentActive}명 + 승인 대기 {context.pendingToApprove}명 = <b>{projected}명</b>
            이라 승인을 진행할 수 없습니다.
          </p>
          {plan && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
              <div className="text-base font-semibold">{plan.display_name}</div>
              <div className="text-sm text-muted-foreground">
                {plan.min_users}~{plan.max_users}인 · {formatPlanPrice(plan)}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>나중에 결제</Button>
          <Button onClick={onPayNow}>지금 결제하기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: 빌드**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/components/Subscription/UpgradeRequiredModal.tsx
git commit -m "feat(subscription): UpgradeRequiredModal 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `StaffManagement`에 업그레이드 모달 연결

### 파일:
- Modify: `src/components/Management/StaffManagement.tsx` (`handleApproveRequest` 근처)

- [ ] **Step 1: 상태 추가**

상단 훅 선언 영역에 추가:
```tsx
const [upgradeContext, setUpgradeContext] = useState<null | {
  currentPlan: string
  currentLimit: number
  currentActive: number
  pendingToApprove: number
  recommendedPlan: string
}>(null)
const [planModalOpen, setPlanModalOpen] = useState(false)
```

import:
```tsx
import UpgradeRequiredModal from '@/components/Subscription/UpgradeRequiredModal'
import PlanSelectModal from '@/components/Subscription/PlanSelectModal'
```

- [ ] **Step 2: 승인 함수 분기**

`handleApproveRequest` 내부의 `dataService.approveUser` 응답 처리를 교체:
```tsx
const result = await dataService.approveUser(requestId, currentUser.clinic_id, permissions)

if ('upgradeRequired' in result && result.upgradeRequired) {
  setUpgradeContext({
    currentPlan: result.currentPlan,
    currentLimit: result.currentLimit,
    currentActive: result.currentActive,
    pendingToApprove: result.pendingToApprove,
    recommendedPlan: result.recommendedPlan,
  })
  return
}
if ('error' in result && result.error) {
  setError(result.error)
  return
}
setSuccess('가입 요청이 승인되었습니다.')
setShowPermissionModal(false)
setSelectedRequest(null)
fetchJoinRequests()
fetchStaff()
```

- [ ] **Step 3: JSX 말미에 모달 렌더**

컴포넌트 return 블록 최상위에 추가:
```tsx
{upgradeContext && (
  <UpgradeRequiredModal
    open={!!upgradeContext}
    onClose={() => setUpgradeContext(null)}
    onPayNow={() => {
      setUpgradeContext(null)
      setPlanModalOpen(true)
    }}
    context={upgradeContext}
  />
)}
<PlanSelectModal
  isOpen={planModalOpen}
  onClose={() => setPlanModalOpen(false)}
  onSelect={async (plan) => {
    // 결제 진입(기존 흐름에 위임) — PlanSelectModal 내부의 결제 트리거 유지
    setPlanModalOpen(false)
  }}
/>
```

- [ ] **Step 4: 빌드 + 수동 검증**

Run: `npm run build`

Chrome DevTools MCP로 원장 계정 로그인 → 인원 관리 → 상한 초과 pending 승인 시도 → 모달 표시 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/components/Management/StaffManagement.tsx
git commit -m "feat(staff): 승인 실패 시 UpgradeRequiredModal 연결

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: 포트원 웹훅 확장 — 결제 성공 알림 생성

### 파일:
- Modify: `src/app/api/webhooks/portone/route.ts:70-91` (`handleTransactionPaid` 또는 `handlePaymentSuccess`)

- [ ] **Step 1: 알림 생성 로직 삽입**

`handlePaymentSuccess` 내부에서 구독 업데이트가 성공한 다음 위치에 삽입:
```ts
import { countActiveEmployees, getSubscription, getPlanById } from '@/lib/subscriptionService'
import { userNotificationService } from '@/lib/userNotificationService'

// 결제 후 구독 active 전환이 끝난 뒤:
const sub = await getSubscription(clinicId)
const plan = sub?.plan_id ? await getPlanById(sub.plan_id) : null
if (plan) {
  const activeCount = await countActiveEmployees(clinicId)
  // 대기 중 pending 수 조회
  const supabase = await createServiceClient() // 기존 패턴 따라 service role 클라이언트
  const { data: pendingRows } = await supabase
    .from('users')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('status', 'pending')
  const pendingCount = pendingRows?.length ?? 0

  if (pendingCount > 0) {
    // 클리닉 owner(들)에게 알림 생성
    const { data: owners } = await supabase
      .from('users')
      .select('id')
      .eq('clinic_id', clinicId)
      .in('role', ['owner', 'master_admin'])
      .eq('status', 'active')
    for (const o of owners ?? []) {
      await userNotificationService.createNotification({
        userId: o.id,
        type: 'subscription_payment_succeeded',
        payload: {
          pendingCount,
          newLimit: plan.max_users ?? 0,
          newPlanName: plan.name,
        },
      })
    }
  }
}
```

> `createServiceClient` 또는 `ensureServiceConnection` 등 기존 패턴을 이 파일 상단에서 이미 사용 중인지 확인 후 동일한 헬퍼 사용.

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 3: 수동 검증 (스테이징 결제 후)**

- 테스트 병원에 pending 직원 1명 만들고 Starter 결제 완료 → `user_notifications` 테이블에서 `subscription_payment_succeeded` 레코드 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/webhooks/portone/route.ts
git commit -m "feat(portone): 결제 성공 시 subscription_payment_succeeded 알림 생성

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: 벌크 자동 승인 API

### 파일:
- Create: `src/app/api/staff/approve-bulk-auto/route.ts`

- [ ] **Step 1: 라우트 구현**

```ts
// src/app/api/staff/approve-bulk-auto/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { countActiveEmployees, getSubscription, getPlanById } from '@/lib/subscriptionService'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('id, clinic_id, role').eq('id', user.id).single()
  if (!me?.clinic_id || !['owner', 'master_admin'].includes(me.role)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const sub = await getSubscription(me.clinic_id)
  const plan = sub?.plan_id ? await getPlanById(sub.plan_id) : null
  const limit = plan?.max_users ?? 4

  const active = await countActiveEmployees(me.clinic_id)
  const available = Math.max(0, limit - active)
  if (available === 0) {
    return NextResponse.json({ approvedCount: 0, remainingPending: 0 })
  }

  const { data: pending } = await supabase
    .from('users')
    .select('id')
    .eq('clinic_id', me.clinic_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(available)

  const ids = (pending ?? []).map((p) => p.id)
  if (ids.length === 0) return NextResponse.json({ approvedCount: 0, remainingPending: 0 })

  const { error } = await supabase
    .from('users')
    .update({ status: 'active', approved_at: new Date().toISOString() })
    .in('id', ids)
    .eq('clinic_id', me.clinic_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 전체 대기자 재집계
  const { count: remaining } = await supabase
    .from('users').select('id', { count: 'exact', head: true })
    .eq('clinic_id', me.clinic_id).eq('status', 'pending')

  return NextResponse.json({ approvedCount: ids.length, remainingPending: remaining ?? 0 })
}
```

- [ ] **Step 2: 빌드**

Run: `npm run build`

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/staff/approve-bulk-auto/route.ts
git commit -m "feat(api): 결제 후 대기자 일괄 자동 승인 API

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: `PostPaymentApprovalModal` 컴포넌트

### 파일:
- Create: `src/components/Subscription/PostPaymentApprovalModal.tsx`

- [ ] **Step 1: 구현**

```tsx
// src/components/Subscription/PostPaymentApprovalModal.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onClose: () => void
  pendingCount: number
  newLimit: number
  newPlanName: string
}

export default function PostPaymentApprovalModal({ open, onClose, pendingCount, newLimit }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ approved: number; remaining: number } | null>(null)
  const router = useRouter()

  const handleAutoApprove = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/staff/approve-bulk-auto', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'AUTO_APPROVE_FAILED')
      setResult({ approved: data.approvedCount, remaining: data.remainingPending })
    } finally {
      setLoading(false)
    }
  }

  const handleIndividual = () => {
    onClose()
    router.push('/management?tab=requests')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>결제 완료 · 대기 직원 승인</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-2 text-sm">
            <p><b>{result.approved}명</b>이 자동 승인되었습니다.</p>
            {result.remaining > 0 && (
              <p className="text-amber-600">
                여전히 {result.remaining}명이 대기 중입니다 (신규 상한 {newLimit}명 초과).
              </p>
            )}
            <DialogFooter className="pt-2">
              <Button onClick={onClose}>확인</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-2 text-sm">
              <p>결제가 완료되었습니다. 대기 중인 직원 <b>{pendingCount}명</b>을 어떻게 처리할까요?</p>
              {pendingCount > newLimit && (
                <p className="text-amber-600">신규 상한 {newLimit}명보다 대기자가 많아 일부만 자동 승인됩니다.</p>
              )}
            </div>
            <DialogFooter className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleIndividual} disabled={loading}>개별 승인</Button>
              <Button onClick={handleAutoApprove} disabled={loading}>
                {loading ? '승인 중…' : '전체 자동 승인'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: 대시보드에서 트리거 연결**

`src/app/dashboard/page.tsx`의 클라이언트 컴포넌트 내에서 미읽음 `subscription_payment_succeeded` 알림을 폴링/구독해 모달 open:
```tsx
// 대시보드 컴포넌트 내부
const [paymentSuccessPayload, setPaymentSuccessPayload] = useState<{
  pendingCount: number; newLimit: number; newPlanName: string
} | null>(null)

useEffect(() => {
  let cancelled = false
  async function check() {
    const res = await fetch('/api/notifications/latest?type=subscription_payment_succeeded')
    if (!res.ok) return
    const n = await res.json()
    if (!cancelled && n?.payload) {
      setPaymentSuccessPayload(n.payload)
      // 표시 후 읽음 처리
      await fetch(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {})
    }
  }
  check()
  const t = setInterval(check, 30_000)
  return () => { cancelled = true; clearInterval(t) }
}, [])

// 렌더
{paymentSuccessPayload && (
  <PostPaymentApprovalModal
    open
    onClose={() => setPaymentSuccessPayload(null)}
    pendingCount={paymentSuccessPayload.pendingCount}
    newLimit={paymentSuccessPayload.newLimit}
    newPlanName={paymentSuccessPayload.newPlanName}
  />
)}
```

> `/api/notifications/latest`, `/api/notifications/:id/read`가 기존에 있으면 사용, 없으면 `userNotificationService`를 직접 써서 동등한 클라이언트 함수로 대체.

- [ ] **Step 3: 빌드**

Run: `npm run build`

- [ ] **Step 4: 커밋**

```bash
git add src/components/Subscription/PostPaymentApprovalModal.tsx src/app/dashboard/page.tsx
git commit -m "feat(subscription): 결제 후 자동/개별 승인 모달 + 대시보드 트리거

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: `PendingApprovalBanner`

### 파일:
- Create: `src/components/Dashboard/PendingApprovalBanner.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: 배너 컴포넌트**

```tsx
// src/components/Dashboard/PendingApprovalBanner.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'

export default function PendingApprovalBanner({ clinicId, role }: { clinicId: string; role: string }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!['owner', 'master_admin'].includes(role)) return
    let cancelled = false
    async function load() {
      const res = await fetch(`/api/staff/pending-count?clinicId=${clinicId}`)
      if (!res.ok) return
      const data = await res.json()
      if (!cancelled) setCount(data.count ?? 0)
    }
    load()
    const t = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [clinicId, role])

  if (count === 0) return null

  return (
    <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/30">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <span>직원 <b>{count}명</b>이 승인 대기 중입니다.</span>
      </div>
      <Link
        href="/management?tab=requests"
        className="font-medium text-amber-700 underline dark:text-amber-300"
      >
        지금 확인
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: `/api/staff/pending-count` 라우트**

```ts
// src/app/api/staff/pending-count/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const clinicId = url.searchParams.get('clinicId')
  if (!clinicId) return NextResponse.json({ count: 0 })

  const supabase = await createClient()
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('status', 'pending')

  return NextResponse.json({ count: count ?? 0 })
}
```

- [ ] **Step 3: 대시보드 페이지 상단에 삽입**

`src/app/dashboard/page.tsx`에서 로그인 사용자 정보 획득 후:
```tsx
{user?.clinic_id && (
  <PendingApprovalBanner clinicId={user.clinic_id} role={user.role} />
)}
```

- [ ] **Step 4: 빌드**

Run: `npm run build`

- [ ] **Step 5: 커밋**

```bash
git add src/components/Dashboard/PendingApprovalBanner.tsx src/app/api/staff/pending-count/route.ts src/app/dashboard/page.tsx
git commit -m "feat(dashboard): 승인 대기 직원 고정 배너 + pending-count API

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: 포트원 `partialRefund` 추가

### 파일:
- Modify: `src/lib/portone.ts`

- [ ] **Step 1: 함수 추가**

파일 끝에 append:
```ts
export async function partialRefund(params: {
  portonePaymentId: string
  amount: number
  reason: string
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `${PORTONE_API_BASE}/payments/${encodeURIComponent(params.portonePaymentId)}/cancel`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `PortOne ${process.env.PORTONE_API_SECRET ?? ''}`,
      },
      body: JSON.stringify({
        amount: params.amount,
        reason: params.reason,
      }),
    }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, error: `REFUND_FAILED: ${res.status} ${body}` }
  }
  return { ok: true }
}
```

> `PORTONE_API_BASE`, `PORTONE_API_SECRET` 상수/env 명은 기존 파일 상단과 맞춰 일치시킨다.

- [ ] **Step 2: 빌드**

Run: `npm run build`

- [ ] **Step 3: 커밋**

```bash
git add src/lib/portone.ts
git commit -m "feat(portone): partialRefund API 래퍼 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: 다운그레이드 API

### 파일:
- Create: `src/app/api/subscription/downgrade/route.ts`
- Create: `src/lib/subscriptionReconciler.ts`

- [ ] **Step 1: 환불 계산 유틸**

```ts
// src/lib/subscriptionReconciler.ts
import {
  countActiveEmployees,
  getSubscription,
  getPlanById,
  getLatestPaidPayment,
} from '@/lib/subscriptionService'
import { findPlanByHeadcount } from '@/lib/subscriptionPlans'
import { partialRefund } from '@/lib/portone'
import { createServiceClient } from '@/lib/supabase/server'

const MS_PER_DAY = 86400000

export async function planForClinic(clinicId: string) {
  const active = await countActiveEmployees(clinicId)
  const target = findPlanByHeadcount(active)
  const sub = await getSubscription(clinicId)
  const currentPlan = sub?.plan_id ? await getPlanById(sub.plan_id) : null
  return { active, targetName: target, currentPlan, subscription: sub }
}

export function prorateRefund(params: {
  currentPrice: number
  newPrice: number
  periodStart: string
  periodEnd: string
  today?: Date
}): number {
  const start = new Date(params.periodStart).getTime()
  const end = new Date(params.periodEnd).getTime()
  const today = (params.today ?? new Date()).getTime()
  const totalDays = Math.max(1, Math.round((end - start) / MS_PER_DAY))
  const remainDays = Math.max(0, Math.round((end - today) / MS_PER_DAY))
  const diff = Math.max(0, params.currentPrice - params.newPrice)
  return Math.floor(diff * (remainDays / totalDays))
}

export async function executeDowngrade(params: {
  clinicId: string
  newPlanName: string
  reason: string
}) {
  const supabase = await createServiceClient()
  const sub = await getSubscription(params.clinicId)
  if (!sub) return { ok: false, error: 'NO_SUBSCRIPTION' }

  const currentPlan = sub.plan_id ? await getPlanById(sub.plan_id) : null
  if (!currentPlan) return { ok: false, error: 'NO_CURRENT_PLAN' }

  const { data: newPlan } = await supabase
    .from('subscription_plans').select('*').eq('name', params.newPlanName).single()
  if (!newPlan) return { ok: false, error: 'NO_TARGET_PLAN' }

  if (newPlan.name === currentPlan.name) {
    return { ok: true, action: 'no_change' as const, refunded: 0 }
  }

  const latest = await getLatestPaidPayment(params.clinicId)
  let refunded = 0

  if (latest && sub.current_period_start && sub.current_period_end) {
    refunded = prorateRefund({
      currentPrice: currentPlan.price,
      newPrice: newPlan.price,
      periodStart: sub.current_period_start,
      periodEnd: sub.current_period_end,
    })

    if (refunded > 0) {
      const refund = await partialRefund({
        portonePaymentId: latest.portone_payment_id,
        amount: refunded,
        reason: params.reason,
      })
      if (!refund.ok) return { ok: false, error: refund.error ?? 'REFUND_FAILED' }

      await supabase.from('subscription_payments').update({
        refunded_amount: (latest.refunded_amount ?? 0) + refunded,
        refund_reason: params.reason,
        refunded_at: new Date().toISOString(),
      }).eq('id', latest.id)
    }
  }

  await supabase.from('subscriptions').update({
    plan_id: newPlan.id,
    updated_at: new Date().toISOString(),
  }).eq('id', sub.id)

  return { ok: true, action: 'changed' as const, refunded, newPlan: newPlan.name }
}
```

- [ ] **Step 2: API 라우트**

```ts
// src/app/api/subscription/downgrade/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { executeDowngrade, planForClinic } from '@/lib/subscriptionReconciler'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const reason: string = body.reason ?? '플랜 다운그레이드'
  const forceName: string | undefined = body.newPlanName

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('id, clinic_id, role').eq('id', user.id).single()
  if (!me?.clinic_id || !['owner', 'master_admin'].includes(me.role)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const snapshot = await planForClinic(me.clinic_id)
  const target = forceName ?? snapshot.targetName
  const result = await executeDowngrade({
    clinicId: me.clinic_id,
    newPlanName: target,
    reason,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json(result)
}
```

- [ ] **Step 3: 빌드**

Run: `npm run build`

- [ ] **Step 4: 수동 검증**

테스트 병원에 Starter 결제 후 임의 직원 1명 퇴사 처리 → `POST /api/subscription/downgrade` 호출 → `refunded`가 예상 일할 금액과 근사한지 확인. DB에서 `subscription_payments.refunded_amount` 증분 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/subscription/downgrade/route.ts src/lib/subscriptionReconciler.ts
git commit -m "feat(subscription): 다운그레이드 API + 포트원 일할 부분 환불

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: 퇴사 처리에 환불 확인 모달 + 재조정 호출

### 파일:
- Create: `src/components/Subscription/DowngradeConfirmModal.tsx`
- Modify: `src/components/Management/StaffManagement.tsx` (퇴사/삭제 버튼 핸들러)

- [ ] **Step 1: 환불 미리보기 API**

```ts
// src/app/api/subscription/downgrade/preview/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { planForClinic } from '@/lib/subscriptionReconciler'
import { prorateRefund } from '@/lib/subscriptionReconciler'
import { getLatestPaidPayment, getPlanById } from '@/lib/subscriptionService'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { data: me } = await supabase
    .from('users').select('clinic_id, role').eq('id', user.id).single()
  if (!me?.clinic_id) return NextResponse.json({ error: 'NO_CLINIC' }, { status: 400 })

  const snap = await planForClinic(me.clinic_id)
  const target = snap.targetName
  if (!snap.currentPlan || snap.currentPlan.name === target) {
    return NextResponse.json({ changeRequired: false, refunded: 0 })
  }
  const newPlan = await supabase
    .from('subscription_plans').select('*').eq('name', target).single()
  const latest = await getLatestPaidPayment(me.clinic_id)
  let refunded = 0
  if (latest && snap.subscription?.current_period_start && snap.subscription?.current_period_end && newPlan.data) {
    refunded = prorateRefund({
      currentPrice: snap.currentPlan.price,
      newPrice: newPlan.data.price,
      periodStart: snap.subscription.current_period_start,
      periodEnd: snap.subscription.current_period_end,
    })
  }
  return NextResponse.json({
    changeRequired: true,
    currentPlan: snap.currentPlan.name,
    targetPlan: target,
    refunded,
  })
}
```

- [ ] **Step 2: 확인 모달 컴포넌트**

```tsx
// src/components/Subscription/DowngradeConfirmModal.tsx
'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void> | void
  triggerLabel: string   // '퇴사 처리' | '직원 삭제' 등
}

export default function DowngradeConfirmModal({ open, onClose, onConfirm, triggerLabel }: Props) {
  const [preview, setPreview] = useState<null | {
    changeRequired: boolean; currentPlan?: string; targetPlan?: string; refunded: number
  }>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/subscription/downgrade/preview').then((r) => r.json()).then(setPreview).catch(() => setPreview({ changeRequired: false, refunded: 0 }))
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{triggerLabel} 확인</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {!preview && <p>계산 중…</p>}
          {preview && !preview.changeRequired && <p>플랜 변경 없이 처리됩니다.</p>}
          {preview && preview.changeRequired && (
            <p>
              재직자가 감소하여 <b>{preview.currentPlan} → {preview.targetPlan}</b>로 전환됩니다.
              일할 기준 환불 예상액은 <b>{preview.refunded.toLocaleString()}원</b>입니다.
            </p>
          )}
        </div>
        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>취소</Button>
          <Button onClick={async () => { setLoading(true); await onConfirm(); setLoading(false); onClose() }} disabled={loading}>
            {loading ? '처리 중…' : triggerLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: 퇴사 핸들러에 훅 연결**

`StaffManagement.tsx`의 퇴사 버튼 onClick → 모달 open → 확인 시:
```ts
await dataService.markAsResigned(staffId)               // 기존 함수명에 맞춰 조정
await fetch('/api/subscription/downgrade', {
  method: 'POST', body: JSON.stringify({ reason: '직원 퇴사' })
})
fetchStaff()
```

- [ ] **Step 4: 빌드 + 수동 검증**

Run: `npm run build`
Chrome DevTools MCP로 퇴사 처리 실행 → 환불 금액 모달 → 확정 → `subscription.plan_id`와 `refunded_amount` 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/subscription/downgrade/preview/route.ts src/components/Subscription/DowngradeConfirmModal.tsx src/components/Management/StaffManagement.tsx
git commit -m "feat(staff): 퇴사 처리 시 다운그레이드 환불 확인 모달 연결

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 18: `PlanSelectModal` 리팩터 — 탭 제거, 3섹션 조립

### 파일:
- Create: `src/components/Subscription/BasicPlansSection.tsx`
- Create: `src/components/Subscription/PremiumBundleSection.tsx`
- Create: `src/components/Subscription/PerformanceSection.tsx`
- Modify: `src/components/Subscription/PlanSelectModal.tsx`

- [ ] **Step 1: `BasicPlansSection`**

```tsx
// src/components/Subscription/BasicPlansSection.tsx
'use client'
import { Users } from 'lucide-react'
import type { SubscriptionPlan, Subscription } from '@/types/subscription'
import { formatPlanPrice } from '@/lib/subscriptionPlans'

interface Props {
  plans: SubscriptionPlan[]
  current?: Subscription | null
  activeCount: number
  onSelect: (plan: SubscriptionPlan) => void
}

export default function BasicPlansSection({ plans, current, activeCount, onSelect }: Props) {
  const headcountPlans = plans.filter((p) => p.type === 'headcount').sort((a, b) => a.sort_order - b.sort_order)
  const currentId = current?.plan_id
  const currentPlan = headcountPlans.find((p) => p.id === currentId)
  const limit = currentPlan?.max_users ?? 4
  const usage = Math.min(100, Math.round((activeCount / Math.max(1, limit)) * 100))

  return (
    <section aria-labelledby="basic-plans-heading" className="space-y-3">
      <div className="flex items-center justify-between rounded-md bg-blue-500/10 px-3 py-2">
        <h2 id="basic-plans-heading" className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
          <Users className="h-4 w-4" /> 기본 플랜 (직원 수 기준)
        </h2>
        <div className="text-xs text-blue-700 dark:text-blue-300">
          {activeCount}/{limit}명 사용 중
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {headcountPlans.map((plan) => {
          const isCurrent = plan.id === currentId
          const isDisabled = plan.max_users != null && plan.max_users < activeCount
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => !isDisabled && onSelect(plan)}
              disabled={isDisabled}
              className={[
                'flex flex-col gap-1 rounded-lg border p-4 text-left transition',
                'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
                isCurrent ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-blue-300',
                isDisabled ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
              title={isDisabled ? `현재 ${activeCount}명 재직 중` : undefined}
            >
              {isCurrent && <span className="text-[10px] font-semibold text-blue-700">현재 이용 중</span>}
              <div className="text-sm font-semibold">{plan.display_name}</div>
              <div className="text-xs text-muted-foreground">
                {plan.min_users}~{plan.max_users}인
              </div>
              <div className="mt-1 text-sm font-bold">{formatPlanPrice(plan)}</div>
            </button>
          )
        })}
      </div>

      <div className="h-1.5 overflow-hidden rounded bg-blue-100 dark:bg-blue-950">
        <div className={`h-full bg-blue-500 transition-all`} style={{ width: `${usage}%` }} />
      </div>
    </section>
  )
}
```

- [ ] **Step 2: `PremiumBundleSection`**

```tsx
// src/components/Subscription/PremiumBundleSection.tsx
'use client'
import { Sparkles } from 'lucide-react'
import type { SubscriptionPlan, Subscription } from '@/types/subscription'
import { formatPlanPrice } from '@/lib/subscriptionPlans'

interface Props {
  plans: SubscriptionPlan[]
  current?: Subscription | null
  onSelect: (plan: SubscriptionPlan) => void
}

export default function PremiumBundleSection({ plans, current, onSelect }: Props) {
  const bundle = plans.find((p) => p.name === 'premium-bundle')
  if (!bundle) return null
  const isCurrent = current?.plan_id === bundle.id

  return (
    <section aria-labelledby="premium-heading" className="space-y-3">
      <div className="rounded-md bg-purple-500/10 px-3 py-2">
        <h2 id="premium-heading" className="flex items-center gap-2 text-sm font-semibold text-purple-700 dark:text-purple-300">
          <Sparkles className="h-4 w-4" /> 프리미엄 패키지
        </h2>
      </div>

      <button
        type="button"
        onClick={() => onSelect(bundle)}
        className={[
          'w-full rounded-lg border p-5 text-left transition',
          'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800',
          isCurrent ? 'ring-2 ring-purple-500' : 'hover:ring-1 hover:ring-purple-300',
        ].join(' ')}
      >
        {isCurrent && <div className="mb-1 text-[10px] font-semibold text-purple-700">현재 이용 중</div>}
        <div className="text-base font-semibold">{bundle.display_name}</div>
        <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
          <li>AI 데이터 분석 — 매출/환자 추이 자동 분석</li>
          <li>경영 현황 — 수입/지출 관리</li>
          <li>마케팅 자동화 — AI 임상글 생성</li>
        </ul>
        <div className="mt-3 text-sm font-bold">{formatPlanPrice(bundle)}</div>
      </button>
    </section>
  )
}
```

- [ ] **Step 3: `PerformanceSection`**

```tsx
// src/components/Subscription/PerformanceSection.tsx
'use client'
import { useEffect, useState } from 'react'
import { TrendingUp, RefreshCw } from 'lucide-react'
import type { SubscriptionPlan } from '@/types/subscription'

interface Props {
  plans: SubscriptionPlan[]
  onSelect: (plan: SubscriptionPlan) => void
}

interface Snapshot {
  year: number
  month: number
  realized_profit: number
  unrealized_profit: number
  expected_fee: number
}

export default function PerformanceSection({ plans, onSelect }: Props) {
  const investment = plans.find((p) => p.feature_id === 'investment')
  const [current, setCurrent] = useState<Snapshot | null>(null)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    const res = await fetch('/api/investment/profit-snapshot/latest?months=4')
    if (!res.ok) return
    const data: Snapshot[] = await res.json()
    const [first, ...rest] = data
    setCurrent(first ?? null)
    setHistory(rest)
  }
  useEffect(() => { load() }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await fetch('/api/investment/profit-snapshot/refresh', { method: 'POST' })
      await load()
    } finally { setRefreshing(false) }
  }

  if (!investment) return null

  return (
    <section aria-labelledby="performance-heading" className="space-y-3">
      <div className="rounded-md bg-emerald-500/10 px-3 py-2">
        <h2 id="performance-heading" className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          <TrendingUp className="h-4 w-4" /> 성과 연동
        </h2>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/30">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-base font-semibold">주식 자동매매</div>
            <div className="mt-1 text-sm font-bold">구독료 0원 · 수익의 5%</div>
            <div className="text-xs text-muted-foreground">매월 실현 수익이 있을 때만 정산됩니다.</div>
          </div>
          <button type="button" onClick={() => onSelect(investment)}
            className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700">
            시작하기
          </button>
        </div>

        <div className="mt-4 border-t border-emerald-200 pt-3 text-sm dark:border-emerald-800">
          <div className="flex items-center justify-between">
            <div>이번 달 ({current ? `${current.year}-${String(current.month).padStart(2, '0')}` : '—'})</div>
            <button type="button" onClick={handleRefresh} disabled={refreshing}
              className="flex items-center gap-1 text-xs text-emerald-700 hover:underline">
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> 새로고침
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div>실현 수익<br/><b>{(current?.realized_profit ?? 0).toLocaleString()}원</b></div>
            <div>평가 수익<br/><span>{(current?.unrealized_profit ?? 0).toLocaleString()}원</span></div>
            <div>예정 정산 5%<br/><b>{(current?.expected_fee ?? 0).toLocaleString()}원</b></div>
          </div>
        </div>

        {history.length > 0 && (
          <div className="mt-4 border-t border-emerald-200 pt-3 text-xs dark:border-emerald-800">
            <div className="mb-1 font-semibold">지난 3개월</div>
            <ul className="space-y-1">
              {history.slice(0, 3).map((h) => (
                <li key={`${h.year}-${h.month}`} className="flex justify-between">
                  <span>{h.year}-{String(h.month).padStart(2, '0')}</span>
                  <span>수익 {h.realized_profit.toLocaleString()} / 정산 {h.expected_fee.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: `PlanSelectModal` 재구성**

기존 파일의 탭 UI 제거. 렌더 영역 교체:
```tsx
// src/components/Subscription/PlanSelectModal.tsx (본문 렌더 영역만 교체)
import BasicPlansSection from './BasicPlansSection'
import PremiumBundleSection from './PremiumBundleSection'
import PerformanceSection from './PerformanceSection'
import { countActiveEmployeesClient } from '@/lib/subscriptionClient' // 아래 Step 5에서 신규

// ... useState 정리: activeTab 제거, activeCount 추가
const [activeCount, setActiveCount] = useState(0)
useEffect(() => { countActiveEmployeesClient().then(setActiveCount).catch(() => setActiveCount(0)) }, [])

// JSX
<Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
  <DialogContent className="max-w-4xl">
    <DialogHeader>
      <DialogTitle>구독 플랜</DialogTitle>
    </DialogHeader>
    <div className="space-y-6">
      <BasicPlansSection plans={plans} current={currentSubscription} activeCount={activeCount} onSelect={onSelect} />
      <PremiumBundleSection plans={plans} current={currentSubscription} onSelect={onSelect} />
      <PerformanceSection plans={plans} onSelect={onSelect} />
    </div>
  </DialogContent>
</Dialog>
```

- [ ] **Step 5: 클라이언트용 인원 조회 헬퍼**

```ts
// src/lib/subscriptionClient.ts
export async function countActiveEmployeesClient(): Promise<number> {
  const res = await fetch('/api/staff/active-count')
  if (!res.ok) return 0
  const data = await res.json()
  return data.count ?? 0
}
```

```ts
// src/app/api/staff/active-count/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { countActiveEmployees } from '@/lib/subscriptionService'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ count: 0 })
  const { data: me } = await supabase.from('users').select('clinic_id').eq('id', user.id).single()
  if (!me?.clinic_id) return NextResponse.json({ count: 0 })
  return NextResponse.json({ count: await countActiveEmployees(me.clinic_id) })
}
```

- [ ] **Step 6: 빌드 + 수동 검증**

Run: `npm run build`
Chrome DevTools MCP: 플랜 모달 열기 → 탭 없음 · 3섹션 색 구분 확인. 모바일 뷰(375px)에서 기본 플랜 카드 1~2열로 스택되는지.

- [ ] **Step 7: 커밋**

```bash
git add src/components/Subscription/BasicPlansSection.tsx src/components/Subscription/PremiumBundleSection.tsx src/components/Subscription/PerformanceSection.tsx src/components/Subscription/PlanSelectModal.tsx src/lib/subscriptionClient.ts src/app/api/staff/active-count/route.ts
git commit -m "feat(subscription): PlanSelectModal 3섹션 색 구분 통합 화면

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: 투자 수익 스냅샷 API + 크론 + stub 계산

### 파일:
- Create: `src/lib/investmentProfit.ts`
- Create: `src/app/api/investment/profit-snapshot/route.ts`
- Create: `src/app/api/investment/profit-snapshot/refresh/route.ts`
- Create: `src/app/api/investment/profit-snapshot/latest/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: stub 계산기**

```ts
// src/lib/investmentProfit.ts
/**
 * 월별 실현/평가 수익을 반환한다.
 * NOTE: 현재 투자 거래 테이블이 부재하므로 0 반환. 투자 엔진 구현 후 본체 연결.
 */
export async function calculateMonthlyProfit(
  _clinicId: string, _year: number, _month: number
): Promise<{ realized: number; unrealized: number }> {
  return { realized: 0, unrealized: 0 }
}
```

- [ ] **Step 2: 크론 엔드포인트**

```ts
// src/app/api/investment/profit-snapshot/route.ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { calculateMonthlyProfit } from '@/lib/investmentProfit'

function isLastDayOfMonthKST(d: Date): boolean {
  const kst = new Date(d.getTime() + 9 * 3600_000)
  const next = new Date(kst.getFullYear(), kst.getMonth(), kst.getDate() + 1)
  return next.getDate() === 1
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET ?? ''}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const now = new Date()
  if (!isLastDayOfMonthKST(now)) return NextResponse.json({ skipped: true })

  const supabase = await createServiceClient()
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('clinic_id, plan_id, subscription_plans!inner(feature_id)')
    .eq('status', 'active')
    .eq('subscription_plans.feature_id', 'investment')

  const kst = new Date(now.getTime() + 9 * 3600_000)
  const year = kst.getFullYear()
  const month = kst.getMonth() + 1

  let count = 0
  for (const s of subs ?? []) {
    const { realized, unrealized } = await calculateMonthlyProfit(s.clinic_id, year, month)
    await supabase.from('investment_profit_snapshots').upsert({
      clinic_id: s.clinic_id, year, month,
      realized_profit: realized, unrealized_profit: unrealized,
      snapshot_at: new Date().toISOString(),
    }, { onConflict: 'clinic_id,year,month' })
    count++
  }
  return NextResponse.json({ snapshotted: count })
}
```

- [ ] **Step 3: 수동 재집계 엔드포인트**

```ts
// src/app/api/investment/profit-snapshot/refresh/route.ts
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { calculateMonthlyProfit } from '@/lib/investmentProfit'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  const { data: me } = await supabase
    .from('users').select('clinic_id, role').eq('id', user.id).single()
  if (!me?.clinic_id || me.role !== 'owner') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const kst = new Date(Date.now() + 9 * 3600_000)
  const year = kst.getFullYear()
  const month = kst.getMonth() + 1
  const { realized, unrealized } = await calculateMonthlyProfit(me.clinic_id, year, month)

  const svc = await createServiceClient()
  const { error } = await svc.from('investment_profit_snapshots').upsert({
    clinic_id: me.clinic_id, year, month,
    realized_profit: realized, unrealized_profit: unrealized,
    snapshot_at: new Date().toISOString(),
  }, { onConflict: 'clinic_id,year,month' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, year, month, realized, unrealized })
}
```

- [ ] **Step 4: 최근 N개월 조회 엔드포인트**

```ts
// src/app/api/investment/profit-snapshot/latest/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const months = Math.max(1, Math.min(12, Number(url.searchParams.get('months') ?? 4)))
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([])
  const { data: me } = await supabase.from('users').select('clinic_id').eq('id', user.id).single()
  if (!me?.clinic_id) return NextResponse.json([])

  const { data } = await supabase
    .from('investment_profit_snapshots')
    .select('year, month, realized_profit, unrealized_profit, expected_fee')
    .eq('clinic_id', me.clinic_id)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(months)
  return NextResponse.json(data ?? [])
}
```

- [ ] **Step 5: `vercel.json` 크론 등록**

기존 `vercel.json`을 읽어 `crons` 배열에 추가:
```json
{
  "crons": [
    { "path": "/api/investment/profit-snapshot", "schedule": "5 15 * * *" }
  ]
}
```
> 기존 cron이 있으면 배열에 append. Authorization 헤더는 Vercel Cron이 자동으로 `Bearer ${CRON_SECRET}` 주입 (환경 변수 `CRON_SECRET` 등록 필요 — 이미 다른 크론에서 쓰고 있으면 동일 값 재사용).

- [ ] **Step 6: 빌드 + 수동 호출**

Run: `npm run build`
원장 계정 로그인 → `/api/investment/profit-snapshot/refresh` POST → 응답 `{ ok: true, realized: 0, unrealized: 0 }` 확인 → `investment_profit_snapshots` 테이블에 레코드 생성 확인.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/investmentProfit.ts src/app/api/investment/profit-snapshot vercel.json
git commit -m "feat(investment): 월별 수익 스냅샷 API + 크론 (계산은 stub)

- calculateMonthlyProfit stub (투자 엔진 연결은 별도 작업)
- 크론/수동/조회 3개 엔드포인트
- vercel.json에 profit-snapshot 스케줄 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 20: 가격 표시 일관화 (`formatPlanPrice` 적용)

### 파일:
- Modify: 가격 렌더 지점 전반 (`menuConfig.ts`, 대시보드 홍보 카드, 게이트 화면 등)

- [ ] **Step 1: "무료" 문구가 주식 자동매매 맥락에 남아 있는지 전수 검수**

Run:
```
grep -rn "무료\|free" src --include="*.ts" --include="*.tsx" | grep -vi "test\|comment"
```
각 지점에서 주식 자동매매(`investment` / `priceLabel`) 컨텍스트이면 "수익의 5%"로 교체. 일반 Free 플랜 문구는 유지.

- [ ] **Step 2: `formatPlanPrice` 일괄 적용**

`PlanSelectModal` 내부 `formatPrice` 로컬 함수를 삭제하고 `import { formatPlanPrice } from '@/lib/subscriptionPlans'`로 교체. 기존 사용처(`PremiumGate`, 대시보드 홍보 카드 등)에서 `formatPlanPrice(plan)` 사용.

- [ ] **Step 3: 빌드 + 시각적 확인**

Run: `npm run build`
Chrome DevTools MCP로 플랜 모달/대시보드/게이트 페이지 순회하며 "수익의 5%"가 주식 카드에만, "무료"는 Free 플랜 카드에만 노출되는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add -p   # 변경 지점 선별
git commit -m "refactor(pricing): formatPlanPrice 일관 적용 · 주식매매 '수익의 5%' 명확화

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 21: E2E 수동 검증 (Chrome DevTools MCP)

### 파일: (테스트만)

- [ ] **Step 1: 시나리오 A — Free에서 5번째 직원 승인 시도**

준비:
```sql
-- 테스트 병원(whitedc0902 소속) 재직자 4명 세팅, pending 1명 추가 생성
```
동작:
1. `mcp__playwright__browser_navigate`로 `http://localhost:3000/auth` 이동, `whitedc0902@gmail.com` 로그인
2. `/management?tab=requests` 진입
3. 승인 버튼 클릭
4. `list_network_requests()`로 `/api/staff/approve` 403 + `UPGRADE_REQUIRED` 확인
5. `browser_snapshot()`으로 모달 렌더 확인

- [ ] **Step 2: 시나리오 B — 결제 후 자동 승인**

1. "지금 결제하기" → PlanSelectModal → Starter 카드 클릭 → 포트원 테스트 결제
2. 대시보드 복귀 → `PostPaymentApprovalModal` 자동 노출 확인
3. "전체 자동 승인" → 대기자 `active` 전환 확인 (DB 또는 UI)

- [ ] **Step 3: 시나리오 C — 경계 정확성**

DB에 재직 10명 + pending 1명 시나리오 구성 → 승인 시도 → `recommendedPlan: 'growth'` 반환 확인.

- [ ] **Step 4: 시나리오 D — 퇴사 환불**

Starter 결제 후 15일 경과 상태(결제일 수동 수정) → 직원 1명 퇴사 → 환불 확인 모달에 근사 19,500원 표시 → 확정 → DB `refunded_amount` 증가.

- [ ] **Step 5: 시나리오 F — 통합 UI**

플랜 모달 진입 → 탭 없음, 3섹션 색 구분 확인 → 모바일 뷰(375px) 스택 확인.

- [ ] **Step 6: 시나리오 G — "수익의 5%" 명확화**

주식 자동매매 관련 모든 노출 지점 순회하며 "무료" 단어 잔존 없는지 확인.

- [ ] **Step 7: 시나리오 H — 수동 재집계**

`PerformanceSection` 🔄 클릭 → `investment_profit_snapshots`에 당월 레코드 upsert 확인 (stub이므로 0 기록).

- [ ] **Step 8: 회귀 — Free 병원 일상 기능**

별도 Free 병원 계정(또는 테스트 병원의 Starter 해제 상태)에서 출퇴근, 게시판, 스케줄 정상 동작 확인.

- [ ] **Step 9: 검증 결과 기록**

각 시나리오의 결과(PASS/FAIL + 스크린샷/네트워크 로그 경로)를 `.claude/WORK_LOG.md`에 추가:
```markdown
## 2026-04-19 [기능 개발] 구독 플랜 개편

### 🧪 E2E 검증 결과
- 시나리오 A: PASS (스크린샷: ...)
...
```

- [ ] **Step 10: 발견된 이슈 수정 후 재검증**

실패 시나리오 있으면 해당 Task로 복귀, 수정 → 재실행 (사이클 반복, CLAUDE.md 최상위 지시사항 준수).

---

## Task 22: 최종 빌드 및 develop 푸시

- [ ] **Step 1: 린트**

Run: `npm run lint`
Expected: 경고 0 목표. 남은 경고는 이 스펙과 무관한 기존 경고인지 확인.

- [ ] **Step 2: 빌드**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 3: 커밋 상태 정리**

Run: `git status` / `git log --oneline -20`
미커밋 변경 없음, 모든 Task 커밋이 순서대로 들어가 있는지 확인.

- [ ] **Step 4: 푸시**

Run:
```bash
git push origin develop
```
실패 시 (rebase 필요 등) → `git pull --rebase origin develop` → `git push origin develop` 재시도 (CLAUDE.md: 성공할 때까지).

- [ ] **Step 5: WORK_LOG 최종 업데이트**

`.claude/WORK_LOG.md`에 이 작업의 카테고리/키워드/변경 요약/테스트 결과/배운 점을 추가하고 `develop`로 한 번 더 커밋+푸시.

---

## Self-Review 체크 결과

- **스펙 커버리지**: 스펙 §4.1~§4.7 전부 Task 매핑 (1→경계/가격, 2→프리미엄, 3→주식 스냅샷, 4→홀드, 5→다층 알림, 6→환불, 7→통합 UI)
- **플레이스홀더**: "TBD/TODO" 없음. 모든 step에 실제 코드/명령/기대값 포함
- **타입 일관성**: `findPlanByHeadcount`, `formatPlanPrice`, `requiresUpgrade`, `countActiveEmployees`, `getLatestPaidPayment`, `prorateRefund`, `executeDowngrade`, `planForClinic` — 모든 호출이 선언과 일치
- **범위**: 22개 Task, 실제 개발자가 순서대로 실행 가능. 테스트 러너 부재 사실을 Test Policy에서 명시
- **알려진 한계**: `investment_transactions` 부재로 `calculateMonthlyProfit`은 stub (`{realized:0, unrealized:0}`). 투자 엔진 구현 시 이 함수만 교체. 이 한계를 Task 19 Step 1 주석과 커밋 메시지에 명시함
