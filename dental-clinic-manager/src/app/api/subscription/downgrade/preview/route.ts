import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  countActiveEmployees,
  getSubscription,
  getPlanById,
  getLatestPaidPayment,
} from '@/lib/billingService'
import { findPlanByHeadcount } from '@/lib/subscriptionPlans'

const MS_PER_DAY = 86400000

/**
 * 일할 환불액 계산 (기존 subscriptionReconciler.prorateRefund과 동일).
 *
 * 토스 마이그레이션 후 실제 환불은 자동으로 진행되지 않지만,
 * 미리보기에는 동일 공식의 추정치를 그대로 보여준다.
 */
function prorateRefund(params: {
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

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { data: me } = await supabase
    .from('users')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!me?.clinic_id) return NextResponse.json({ error: 'NO_CLINIC' }, { status: 400 })

  // 현재 활성 직원 수 → 권장 플랜
  const active = await countActiveEmployees(me.clinic_id)
  const target = findPlanByHeadcount(active)

  const subscription = await getSubscription(me.clinic_id)
  const currentPlan = subscription?.plan_id
    ? await getPlanById(subscription.plan_id)
    : null

  if (!currentPlan || currentPlan.name === target) {
    return NextResponse.json({ changeRequired: false, refunded: 0 })
  }

  const { data: newPlan } = await supabase
    .from('subscription_plans')
    .select('price')
    .eq('name', target)
    .maybeSingle()
  if (!newPlan) {
    return NextResponse.json({ changeRequired: false, refunded: 0 })
  }

  const latest = await getLatestPaidPayment(me.clinic_id)
  let refunded = 0
  if (
    latest &&
    subscription?.current_period_start &&
    subscription?.current_period_end
  ) {
    refunded = prorateRefund({
      currentPrice: currentPlan.price,
      newPrice: newPlan.price,
      periodStart: subscription.current_period_start,
      periodEnd: subscription.current_period_end,
    })
  }

  return NextResponse.json({
    changeRequired: true,
    currentPlan: currentPlan.name,
    targetPlan: target,
    refunded,
  })
}
