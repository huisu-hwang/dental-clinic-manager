# 구독 플랜 개편: 직원 수 기반 게이팅 + 통합 플랜 화면

- **작성일**: 2026-04-19
- **작성자**: huisu-hwang (brainstorming by Claude)
- **대상 브랜치**: `develop`
- **관련 커밋**: `415ee1c9 feat(premium): AI분석+경영현황+마케팅을 프리미엄 패키지(499,000원)로 통합`

## 1. 배경 및 문제

현재 구독 체계는 아래 두 가지 문제가 있다.

1. **요금제가 직원 수와 연동되지 않음**: 기본 기능(근태/직원관리/게시판 등)이 모든 병원에 동일 가격(또는 무료)으로 제공되고 있어, 인원이 많은 병원도 과금되지 않는다.
2. **플랜 선택 UX 분절**: `PlanSelectModal`이 "인원별 플랜"과 "기능별 추가" 두 탭으로 나뉘어 있어 전체 체계가 한눈에 들어오지 않는다.
3. **주식 자동매매 가격 오표기**: 실제로는 "수익의 5%"인데 메뉴/홍보 카드 곳곳에서 "무료"처럼 노출되는 지점이 남아 있다.

본 스펙은 위 세 문제를 한 번에 해결한다.

## 2. 목표 (Goals)

1. **기본 기능을 직원 수 구간별로 차등 과금**: 5인 미만 무료, 이상은 구간별 정액.
2. **원장이 결제 전에 직원을 추가로 승인할 수 없도록 홀드**하고, 결제 알람을 다층으로 확실히 전달.
3. **플랜 선택 화면을 한 화면으로 통합**하고 카테고리별 색상으로 구분.
4. **프리미엄 패키지 DB 마이그레이션**을 추가하여 UI(`premium-bundle`)와 DB 불일치를 해소.
5. **주식 자동매매의 "수익의 5%"를 명확히 표시**하고, 월별 수익 스냅샷 기반으로 예정 정산액을 원장이 인지할 수 있게 한다.

## 3. 비목표 (Non-Goals)

- 주식 자동매매 5%의 실제 자동 청구 / 인보이스 발행 / 증권사 연동 (별도 프로젝트).
- 기존 개별 feature 플랜(`feature-ai-analysis`, `feature-financial`, `feature-marketing`) 구독자의 강제 이관. 기존 구독은 유지되며 `PremiumGate`가 호환 처리한다.
- 다국어, 달러 결제, 환율 대응.

## 4. 확정 요구사항 요약

### 4.1 인원 구간별 과금 (기본 플랜)
| 플랜 | 인원 | 월 가격 |
|---|---|---|
| Free | 1~4명 | 0원 |
| Starter | 5~10명 | 39,000원 |
| Growth | 11~20명 | 79,000원 |
| Pro | 21~50명 | 149,000원 |
| Enterprise | 51명+ | 맞춤 문의 |

### 4.2 프리미엄 패키지
- AI 분석 + 경영 현황 + 마케팅 자동화 통합
- 월 **499,000원** (DB `premium-bundle` 신규)

### 4.3 주식 자동매매
- 구독료 0원, **수익의 5%** (성과 연동)
- 이번 스펙에서는 UI 명확화 + 월별 수익 스냅샷까지

### 4.4 홀드 로직
- 스태프 가입 요청은 기존처럼 `pending`으로 저장.
- **원장이 승인할 때** 인원 상한 초과 여부를 검사.
- 초과 시 승인 차단 + `UpgradeRequiredModal` 표시.
- 결제 완료 시 "전체 자동 승인 / 개별 승인" 토글을 원장에게 제공.

### 4.5 알림 (다층)
1. 승인 시점 차단 모달
2. `user_notifications`에 인앱 알림 생성
3. 대시보드 상단 고정 배너 ("직원 N명 승인 대기 중")

### 4.6 다운그레이드
- 직원 퇴사 / 원장 수동 다운그레이드 시 **일할 기준 즉시 부분 환불** (포트원 부분 환불 API).

### 4.7 통합 UI
- `PlanSelectModal`의 탭 구조 제거.
- 단일 스크롤 화면에 3개 섹션:
  - 🟦 파랑: 기본 플랜
  - 🟪 보라: 프리미엄 패키지
  - 🟩 초록: 성과 연동 (주식 자동매매)

## 5. 시스템 아키텍처

### 5.1 컴포넌트 변경 맵
| 영역 | 파일 | 변경 |
|---|---|---|
| DB 마이그레이션 | `supabase/migrations/20260419_subscription_headcount_gating.sql` | 신규 |
| 플랜 유틸 | `src/lib/subscriptionPlans.ts` | 신규 (`findPlanByHeadcount`, `formatPlanPrice`) |
| 구독 조회 유틸 | `src/lib/subscriptionService.ts` (기존 확장) | `getCurrentPlan`, `countActiveEmployees` |
| 승인 API | `src/app/api/admin/users/approve/route.ts` | 인원 상한 가드 추가 |
| 벌크 자동 승인 API | `src/app/api/admin/users/approve-bulk-auto/route.ts` | 신규 |
| 다운그레이드 API | `src/app/api/subscription/downgrade/route.ts` | 신규 |
| 포트원 클라이언트 | `src/lib/portone.ts` | `partialRefund` 추가 |
| 포트원 웹훅 | `src/app/api/webhooks/portone/route.ts` | 결제 성공 시 `subscription_payment_succeeded` 알림 생성 |
| 크론 API | `src/app/api/investment/profit-snapshot/route.ts` | 신규 (말일 가드) |
| 수동 재집계 API | `src/app/api/investment/profit-snapshot/refresh/route.ts` | 신규 |
| 수익 계산 유틸 | `src/lib/investmentProfit.ts` | 신규 |
| 플랜 선택 모달 | `src/components/Subscription/PlanSelectModal.tsx` | 리팩터 (탭 제거, 3섹션) |
| 업그레이드 필요 모달 | `src/components/Subscription/UpgradeRequiredModal.tsx` | 신규 |
| 결제 후 승인 모달 | `src/components/Subscription/PostPaymentApprovalModal.tsx` | 신규 |
| 대기 배너 | `src/components/Dashboard/PendingApprovalBanner.tsx` | 신규 |
| 성과 섹션 | `src/components/Subscription/PerformanceSection.tsx` | 신규 |
| 직원 관리 | `src/components/Management/StaffManagement.tsx` | 승인 실패 시 모달 트리거 분기 |
| 알림 타입 | `src/types/notification.ts` | enum 확장 |
| 메뉴/홍보 카드 | `src/config/menuConfig.ts` 외 | "수익의 5%" 문구 전수 검수 및 `formatPlanPrice` 적용 |
| Vercel Cron | `vercel.json` | `profit-snapshot` 스케줄 추가 |

### 5.2 데이터 흐름
1. 스태프 가입 요청 → `users.status='pending'`
2. 원장 승인 → `/api/admin/users/approve` 호출 → 인원 상한 가드
   - 상한 내 → 즉시 `approved`
   - 초과 → 403 + `UPGRADE_REQUIRED` + 권장 플랜
3. `UpgradeRequiredModal`에서 "지금 결제" → `PlanSelectModal` → 포트원 결제
4. 포트원 웹훅 → `subscriptions.status='active'` + 원장 알림 생성
5. 원장 대시보드 자동 감지 → `PostPaymentApprovalModal` 노출
   - 전체 자동 승인 → 신규 상한까지 `created_at` 오름차순 일괄 승인
   - 개별 승인 → 인원 관리 페이지로 이동

## 6. 데이터베이스 스키마 변경

### 6.1 `subscription_plans` 업데이트 및 신규
```sql
-- Free 상단 4명, Starter 하단 5명으로 조정
UPDATE subscription_plans SET max_users = 4 WHERE name = 'free';
UPDATE subscription_plans SET min_users = 5 WHERE name = 'starter';

-- 프리미엄 패키지 신규
INSERT INTO subscription_plans
  (name, display_name, type, feature_id, price, description, features, sort_order)
VALUES
  ('premium-bundle', '프리미엄 패키지', 'feature', 'premium-bundle', 499000,
   'AI 분석 + 경영 현황 + 마케팅 자동화 통합',
   '["AI 데이터 분석","경영 현황 관리","마케팅 자동화"]', 9)
ON CONFLICT (name) DO UPDATE
  SET price = EXCLUDED.price,
      feature_id = EXCLUDED.feature_id,
      description = EXCLUDED.description,
      features = EXCLUDED.features;

-- 주식 자동매매 명시
INSERT INTO subscription_plans
  (name, display_name, type, feature_id, price, description, features, sort_order)
VALUES
  ('feature-investment', '주식 자동매매', 'feature', 'investment', 0,
   '수익의 5% 성과 연동 과금',
   '["AI 자동매매 전략","실시간 포트폴리오","백테스트"]', 13)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description;
```

`price = 0`이지만 UI는 `priceLabel: '수익의 5%'` + `formatPlanPrice` 유틸로 "수익의 5%"로 렌더.

### 6.2 `investment_profit_snapshots` (신규)
```sql
CREATE TABLE investment_profit_snapshots (
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

CREATE INDEX idx_investment_profit_clinic_ym
  ON investment_profit_snapshots (clinic_id, year DESC, month DESC);

ALTER TABLE investment_profit_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "클리닉 멤버만 조회"
  ON investment_profit_snapshots FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));
```

### 6.3 `subscription_payments` 환불 컬럼
```sql
ALTER TABLE subscription_payments
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
```

### 6.4 `user_notifications` 타입 enum 확장
코드에서만 확장 (DB는 TEXT 컬럼 가정):
- `subscription_upgrade_required`
- `subscription_payment_succeeded`

### 6.5 `clinics.current_plan_id` 확인/추가
실제 스키마에 이미 있는지 마이그레이션 작성 시 점검. 없으면:
```sql
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS current_plan_id UUID REFERENCES subscription_plans(id);
```

## 7. 홀드·결제 게이트 로직 상세

### 7.1 인원 상한 가드 (서버)
`POST /api/admin/users/approve`가 승인 대상 `userIds`를 받은 뒤 기존 로직 앞에 삽입:

```ts
const activeCount = await countActiveEmployees(clinicId);
const projected = activeCount + userIds.length;
const currentPlan = await getCurrentPlan(clinicId) ?? FREE_PLAN;
if (projected > currentPlan.max_users) {
  const recommendedPlan = await findPlanByHeadcount(projected);
  return NextResponse.json({
    error: 'UPGRADE_REQUIRED',
    currentPlan: currentPlan.name,
    currentLimit: currentPlan.max_users,
    currentActive: activeCount,
    pendingToApprove: userIds.length,
    recommendedPlan,
  }, { status: 403 });
}
```

### 7.2 플랜 매핑 유틸
```ts
// src/lib/subscriptionPlans.ts
export function findPlanByHeadcount(total: number): PlanName {
  if (total <= 4) return 'free';
  if (total <= 10) return 'starter';
  if (total <= 20) return 'growth';
  if (total <= 50) return 'pro';
  return 'enterprise';
}

export function formatPlanPrice(plan: SubscriptionPlan): string {
  if (plan.feature_id === 'investment') return '수익의 5%';
  if (plan.name === 'enterprise') return '맞춤 문의';
  if (plan.price === 0) return '무료';
  return `월 ${plan.price.toLocaleString()}원`;
}
```

### 7.3 `UpgradeRequiredModal`
- 상단: "현재 X명 / 상한 Y명 · Z명이 대기 중"
- 추천 플랜 카드(가격/구간) + "다른 플랜 보기" → `PlanSelectModal` 오픈
- CTA: `지금 결제하기` / `나중에 결제`
- "나중에 결제" 클릭 시 `subscription_upgrade_required` 알림 생성

### 7.4 결제 완료 후 자동 승인
웹훅 `payment.completed`:
```ts
await updateSubscriptionActive(clinicId, planId);
const pending = await listPending(clinicId);
if (pending.length > 0) {
  await userNotificationService.createNotification({
    userId: ownerId,
    type: 'subscription_payment_succeeded',
    payload: { pendingCount: pending.length, newLimit: newPlan.max_users },
  });
}
```

`PostPaymentApprovalModal`:
- 트리거: 대시보드 `useEffect`에서 `subscription_payment_succeeded` 미읽음 알림 감지
- 두 CTA:
  - **전체 자동 승인** → `/api/admin/users/approve-bulk-auto`
  - **개별 승인** → `/management?tab=requests` 이동
- 대기자 수 > 신규 상한 여유일 때 경고 표시

### 7.5 `PendingApprovalBanner`
- 위치: `src/app/dashboard/page.tsx` 상단
- 조건: `user.role === 'owner'` && `pendingCount > 0`
- 문구: "직원 N명이 승인 대기 중 · **지금 확인**"

## 8. 통합 플랜 화면 UI

### 8.1 구조
```
┌─ 구독 플랜 (현재: Starter · 8/10명) ─────────┐
│ 🟦 기본 플랜                                  │
│  [Free][Starter*][Growth][Pro][Enterprise]   │
│                                               │
│ 🟪 프리미엄 패키지                            │
│  [ AI분석+경영현황+마케팅 · 월 499,000원 ]    │
│                                               │
│ 🟩 성과 연동                                  │
│  [ 주식 자동매매 · 구독료 0 + 수익 5% ]       │
│  이번 달 예정 정산: 62,500원 🔄               │
└───────────────────────────────────────────────┘
```

### 8.2 색상 토큰
| 섹션 | 헤더 | 카드 배경 | 액센트 | 아이콘 |
|---|---|---|---|---|
| 기본 | `bg-blue-500` | `bg-blue-50 dark:bg-blue-950/30` | `ring-blue-500` | Users |
| 프리미엄 | `bg-purple-500` | `bg-purple-50 dark:bg-purple-950/30` | `ring-purple-500` | Sparkles |
| 성과 | `bg-emerald-500` | `bg-emerald-50 dark:bg-emerald-950/30` | `ring-emerald-500` | TrendingUp |

### 8.3 카드 상태
| 상태 | 시각 |
|---|---|
| current | "현재 이용 중" 배지 + `ring-2` |
| available | 기본 외관 + "구독하기"/"업그레이드" |
| downgrade | 회색톤 + "다운그레이드" |
| disabled | grayout + tooltip ("현재 N명 재직") |

### 8.4 반응형·접근성
- 모바일(`<640px`): 기본 플랜 5카드 세로 스택
- 태블릿: 기본 플랜 2~3열 그리드
- 섹션 헤더 `<h2>` + `aria-labelledby`
- 포커스: `focus-visible:ring-2 ring-offset-2`
- 색 외에 배지 텍스트로도 상태 구분

### 8.5 `menuConfig.ts` 및 기타 가격 표시 일관화
- `formatPlanPrice` 유틸을 모든 가격 렌더 지점에 적용
- "무료" 문구가 주식 자동매매 컨텍스트에 남아 있는지 전수 검수

## 9. 다운그레이드 및 환불

### 9.1 트리거
- `users.employment_status: active → resigned/terminated`
- `users.deleted_at` 설정 (hard/soft delete)
- 원장이 `PlanSelectModal`에서 낮은 카드 선택

### 9.2 계산 공식
```
refund = floor((currentPlan.price - newPlan.price) × remainDays / totalDays)
```
- `totalDays`: `current_period_start ~ current_period_end` 일수
- `remainDays`: `today ~ current_period_end` 일수
- 같은 구간 내 감소는 `no_change`로 0원

### 9.3 트랜잭션
```sql
BEGIN;
  UPDATE subscription_payments
     SET refunded_amount = refunded_amount + :amount,
         refund_reason   = :reason,
         refunded_at     = NOW()
   WHERE id = :paymentId;

  UPDATE subscriptions
     SET plan_id = :newPlanId,
         updated_at = NOW()
   WHERE clinic_id = :clinicId AND status = 'active';
COMMIT;
```

### 9.4 포트원 호출
```ts
export async function partialRefund(p: {
  portone_payment_id: string;
  amount: number;
  reason: string;
}): Promise<void>
```
- 실패 시 DB 트랜잭션 롤백 + 에러 모달 + `master_admin` 알림
- 포트원 취소 정책(7일 등) 만료 시 "다음 결제 주기부터 자동 하향" 폴백

### 9.5 재조정 헬퍼
```ts
// src/lib/subscriptionReconciler.ts
export async function reconcileSubscriptionOnHeadcountChange(clinicId: string) {
  const activeCount = await countActiveEmployees(clinicId);
  const target = findPlanByHeadcount(activeCount);
  const current = await getActiveSubscription(clinicId);
  if (current.plan.name !== target) {
    await requestDowngrade({ clinicId, newPlanName: target });
  }
}
```

## 10. 주식 수익 스냅샷

### 10.1 크론
`vercel.json`에 매일 스케줄 추가 후 API가 "말일" 가드:
```json
{ "crons": [
  { "path": "/api/investment/profit-snapshot", "schedule": "5 15 * * *" }
] }
```
(UTC 15:05 = KST 00:05)

### 10.2 API
```ts
// /api/investment/profit-snapshot
// - Authorization: Bearer CRON_SECRET 검증
// - 말일 아니면 skipped 반환
// - 주식 자동매매 활성 클리닉 대상 calculateMonthlyProfit 실행 후 upsert

// /api/investment/profit-snapshot/refresh
// - owner 권한, throttle 5분/회
// - 당월/지정월 즉시 재집계
```

### 10.3 수익 계산
```ts
export async function calculateMonthlyProfit(
  clinicId: string, year: number, month: number
): Promise<{ realized: number; unrealized: number }>
```
- `investment_transactions`의 `side='sell'` + `executed_at` 월 범위에서 `realized_pnl - fee - tax` 합
- `investment_positions`에서 `(current_price - avg_price) × quantity` 합
- 실제 컬럼명은 구현 시 `src/types/investment.ts`와 매칭

### 10.4 UI
`PerformanceSection`에 이번 달 실현/평가/예정 정산 5% + 지난 3개월 히스토리. 수동 재집계 🔄 버튼은 5분 throttle.

## 11. 에러 처리 / 엣지 케이스

| 상황 | 처리 |
|---|---|
| 결제 실패 웹훅 | `subscription.status='past_due'` + 재결제 유도 알림 |
| 포트원 환불 실패 | 트랜잭션 롤백 + 재시도 모달 + 마스터 알림 |
| 중복 승인 시도 | 동일 403 재노출 (모달 다시 열림) |
| 원장 없는 클리닉 | 알림을 `master_admin`에게 병행 전송 |
| Enterprise | 결제 대신 "문의하기" CTA |
| 기존 feature 플랜 구독자 | 기존 구독 유지, `PremiumGate`에서 OR 조건으로 호환 |
| 재직자 수 > 새 플랜 상한 다운그레이드 시도 | 차단 + "재직자 먼저 조정" 안내 |
| 크론 중복 실행 | `ON CONFLICT (clinic_id,year,month)` upsert로 idempotent |

## 12. 테스트 계획 요약

### 12.1 수동 E2E (Chrome DevTools MCP)
- 시나리오 A~I (Section 7 참조): 홀드·결제·자동 승인·다운그레이드·환불·색 구분 UI·주식 스냅샷
- 테스트 계정: `whitedc0902@gmail.com` (원장) / `sani81@gmail.com` (마스터)

### 12.2 DB 검증
- 마이그레이션 후 `subscription_plans` 경계값, `premium-bundle` 존재, RLS 정책, GENERATED 컬럼 동작

### 12.3 회귀
- Free 병원 일상 기능 (출퇴근/게시판/스케줄)
- 기존 feature 플랜 구독자의 프리미엄 기능 접근 유지

### 12.4 빌드/배포
- `npm run build` 0 에러
- `npm run lint` 무경고 목표
- Vercel Preview에서 E2E 재수행 후 `develop` 푸시

## 13. 구현 순서 (하이레벨)

1. DB 마이그레이션 + 플랜 유틸 + `formatPlanPrice` 적용
2. 승인 API 가드 + `UpgradeRequiredModal`
3. 포트원 웹훅 확장 + `PostPaymentApprovalModal` + 벌크 자동 승인 API
4. `PendingApprovalBanner` + 알림 타입 확장
5. 다운그레이드 API + 포트원 부분 환불 + UI 확인 모달
6. `PlanSelectModal` 리팩터 (탭 제거 → 3섹션 색 구분)
7. 주식 수익 스냅샷 테이블 + 크론 + `PerformanceSection`
8. 전체 E2E 시나리오 수행 → 회귀 검사 → develop 푸시

세부 스텝/파일 단위 작업은 구현 플랜(Implementation Plan)에서 분해한다.

## 14. 미해결 항목

- `clinics.current_plan_id`가 실제 스키마에 존재하는지 (마이그레이션 시 확인)
- `investment_transactions` / `investment_positions` 테이블의 실제 컬럼명 (구현 시 확정)
- Vercel Cron `L` 미지원 확정 여부 — 현재 설계는 매일 실행 + 말일 가드로 대응

## 15. 참고 자료

- 경쟁사 조사:
  - 시프티 (per-seat 2,000~4,000원/인월, 일할 계산)
  - Notion/Slack (free tier + per-seat 유료)
  - Dentrix/Curve ($150~500/provider/월)
- 프로젝트 컨벤션: 상위 `CLAUDE.md` 및 `.claude/CLAUDE.md`
- 기존 구현: `supabase/migrations/20260418_subscription_system.sql`, `src/lib/portone.ts`, `src/components/Subscription/PlanSelectModal.tsx`, `src/config/menuConfig.ts`, `src/hooks/usePremiumFeatures.ts`
