// 원장용 직원 승인 API — 인원 상한 가드 포함
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  countActiveEmployees,
  getSubscription,
  getPlanById,
} from '@/lib/billingService'
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
  if (meErr || !me) {
    return NextResponse.json({ error: 'NO_USER' }, { status: 403 })
  }
  if (!['owner', 'master_admin'].includes(me.role as string)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const isMaster = me.role === 'master_admin'
  // 일반 owner 는 본인 clinic 의 직원만 승인 가능하므로 clinic_id 필수.
  // master_admin 은 전체 서비스의 신규 가입(특히 다른 clinic 의 owner)을 승인하는 권한이므로 clinic_id 없어도 통과.
  if (!isMaster && !me.clinic_id) {
    return NextResponse.json({ error: 'NO_CLINIC' }, { status: 403 })
  }

  // 인원 상한 가드: owner 가 자기 직원을 승인하는 경우에만 본인 clinic 한도로 검사한다.
  // master_admin 은 다른 clinic 의 owner 를 승인하는 행위라 본인 clinic 한도 검사가 의미 없음.
  // (승인 대상 clinic 별 한도는 그 clinic 의 owner 가 자기 직원을 승인할 때 다시 검사됨)
  if (!isMaster) {
    const [activeCount, subscription] = await Promise.all([
      countActiveEmployees(me.clinic_id as string),
      getSubscription(me.clinic_id as string),
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
  }

  // 승인 실행 (pending → active)
  const updatePayload: Record<string, unknown> = {
    status: 'active',
    approved_at: new Date().toISOString(),
  }
  if (permissions && permissions.length > 0) {
    updatePayload.permissions = permissions
  }

  // master_admin 은 어떤 clinic 의 사용자든 승인 가능, owner 는 본인 clinic 의 사용자만.
  let q = supabase.from('users').update(updatePayload).in('id', ids)
  if (!isMaster) {
    q = q.eq('clinic_id', me.clinic_id as string)
  }
  const { error: upErr } = await q

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, approvedCount: ids.length })
}
