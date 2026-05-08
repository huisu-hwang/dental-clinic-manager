import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { downgradePlan } from '@/lib/billingService'
import { findPlanByHeadcount } from '@/lib/subscriptionPlans'
import { countActiveEmployees } from '@/lib/billingService'

/**
 * 다운그레이드 신청 API.
 *
 * 토스 마이그레이션 후 자동 부분 환불은 지원하지 않으며,
 * `billingService.downgradePlan`은 안내 메시지만 반환한다.
 *
 * 호출부 호환성을 위해 기존 응답 형태(`{ ok, action, refunded, newPlan, error }`)를
 * 비슷하게 유지한다.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const forceName: string | undefined =
    typeof body.newPlanName === 'string' ? body.newPlanName : undefined

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { data: me } = await supabase
    .from('users')
    .select('id, clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!me?.clinic_id || !['owner', 'master_admin'].includes(me.role)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  // 헤드카운트 기반 권장 플랜 (요청 본문이 강제 지정한 게 있으면 그걸 사용)
  const active = await countActiveEmployees(me.clinic_id)
  const targetName = forceName ?? findPlanByHeadcount(active)

  // billingService.downgradePlan은 현재 안내 메시지만 반환 (자동 적용 불가)
  // newPlanId가 필요하므로 plan을 조회해서 ID로 변환
  const { data: targetPlan } = await supabase
    .from('subscription_plans')
    .select('id, name')
    .eq('name', targetName)
    .maybeSingle()

  if (!targetPlan) {
    return NextResponse.json(
      { ok: false, error: `PLAN_NOT_FOUND: ${targetName}` },
      { status: 404 },
    )
  }

  const result = await downgradePlan({
    clinicId: me.clinic_id,
    newPlanId: targetPlan.id,
  })

  if (!result.success) {
    // 안내 메시지를 200 OK + ok:false로 반환 (사용자에게 보여줄 메시지)
    return NextResponse.json(
      { ok: false, error: result.error ?? '다운그레이드 처리 실패' },
      { status: 200 },
    )
  }

  return NextResponse.json({
    ok: true,
    action: 'changed',
    refunded: 0,
    newPlan: targetPlan.name,
  })
}
