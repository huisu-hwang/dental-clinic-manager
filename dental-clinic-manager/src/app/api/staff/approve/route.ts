// 원장용 직원 승인 API — 인원 상한 가드 포함
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
  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.userIds)
    ? body.userIds.filter((x: unknown): x is string => typeof x === 'string')
    : body.userId
      ? [body.userId as string]
      : []
  const permissions: string[] | undefined = Array.isArray(body.permissions) ? body.permissions : undefined

  if (ids.length === 0) {
    return NextResponse.json({ error: 'NO_USER_IDS' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { data: me, error: meErr } = await supabase
    .from('users')
    .select('id, clinic_id, role')
    .eq('id', user.id)
    .single()
  if (meErr || !me?.clinic_id) {
    return NextResponse.json({ error: 'NO_CLINIC' }, { status: 403 })
  }
  if (!['owner', 'master_admin'].includes(me.role as string)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  // 인원 상한 가드
  const [activeCount, subscription] = await Promise.all([
    countActiveEmployees(me.clinic_id),
    getSubscription(me.clinic_id),
  ])
  const currentPlan = subscription?.plan_id ? await getPlanById(subscription.plan_id) : null
  const currentLimit = currentPlan?.max_users ?? FREE_LIMIT

  if (
    requiresUpgrade({
      currentActive: activeCount,
      pendingToApprove: ids.length,
      currentLimit,
    })
  ) {
    const projected = activeCount + ids.length
    return NextResponse.json(
      {
        error: 'UPGRADE_REQUIRED',
        currentPlan: currentPlan?.name ?? 'free',
        currentLimit,
        currentActive: activeCount,
        pendingToApprove: ids.length,
        recommendedPlan: findPlanByHeadcount(projected),
      },
      { status: 403 },
    )
  }

  // 승인 실행 (pending → active)
  const updatePayload: Record<string, unknown> = {
    status: 'active',
    approved_at: new Date().toISOString(),
  }
  if (permissions && permissions.length > 0) {
    updatePayload.permissions = permissions
  }

  const { error: upErr } = await supabase
    .from('users')
    .update(updatePayload)
    .in('id', ids)
    .eq('clinic_id', me.clinic_id)

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, approvedCount: ids.length })
}
