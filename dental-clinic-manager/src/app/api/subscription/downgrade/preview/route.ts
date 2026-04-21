import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { planForClinic, prorateRefund } from '@/lib/subscriptionReconciler'
import { getLatestPaidPayment } from '@/lib/subscriptionService'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('clinic_id, role').eq('id', user.id).single()
  if (!me?.clinic_id) return NextResponse.json({ error: 'NO_CLINIC' }, { status: 400 })

  const snap = await planForClinic(me.clinic_id)
  const target = snap.targetName

  // 이 API는 "지금 퇴사시키면" 상태가 아니라 "현재 상태 기준" 스냅샷이다.
  // 호출부(퇴사 직전)에서 정확한 시나리오를 원하면 API에 pending 파라미터를 넘기는 확장이 필요.
  if (!snap.currentPlan || snap.currentPlan.name === target) {
    return NextResponse.json({ changeRequired: false, refunded: 0 })
  }

  const { data: newPlan } = await supabase
    .from('subscription_plans').select('price').eq('name', target).maybeSingle()
  if (!newPlan) {
    return NextResponse.json({ changeRequired: false, refunded: 0 })
  }

  const latest = await getLatestPaidPayment(me.clinic_id)
  let refunded = 0
  if (latest && snap.subscription?.current_period_start && snap.subscription?.current_period_end) {
    refunded = prorateRefund({
      currentPrice: snap.currentPlan.price,
      newPrice: newPlan.price,
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
