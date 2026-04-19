import {
  countActiveEmployees,
  getSubscription,
  getPlanById,
  getLatestPaidPayment,
} from '@/lib/subscriptionService'
import { findPlanByHeadcount } from '@/lib/subscriptionPlans'
import { partialRefund } from '@/lib/portone'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

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
}): Promise<
  | { ok: true; action: 'no_change'; refunded: 0 }
  | { ok: true; action: 'changed'; refunded: number; newPlan: string }
  | { ok: false; error: string }
> {
  const admin = getSupabaseAdmin()
  if (!admin) return { ok: false, error: 'ADMIN_UNAVAILABLE' }

  const sub = await getSubscription(params.clinicId)
  if (!sub) return { ok: false, error: 'NO_SUBSCRIPTION' }

  const currentPlan = sub.plan_id ? await getPlanById(sub.plan_id) : null
  if (!currentPlan) return { ok: false, error: 'NO_CURRENT_PLAN' }

  const { data: newPlan, error: planErr } = await admin
    .from('subscription_plans').select('*').eq('name', params.newPlanName).maybeSingle()
  if (planErr) return { ok: false, error: `PLAN_FETCH_FAILED: ${planErr.message}` }
  if (!newPlan) return { ok: false, error: 'NO_TARGET_PLAN' }

  if (newPlan.name === currentPlan.name) {
    return { ok: true, action: 'no_change', refunded: 0 }
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

      const { error: updPayErr } = await admin.from('subscription_payments').update({
        refunded_amount: (latest.refunded_amount ?? 0) + refunded,
        refund_reason: params.reason,
        refunded_at: new Date().toISOString(),
      }).eq('id', latest.id)
      if (updPayErr) return { ok: false, error: `PAYMENT_UPDATE_FAILED: ${updPayErr.message}` }
    }
  }

  const { error: updSubErr } = await admin.from('subscriptions').update({
    plan_id: newPlan.id,
    updated_at: new Date().toISOString(),
  }).eq('id', sub.id)
  if (updSubErr) return { ok: false, error: `SUBSCRIPTION_UPDATE_FAILED: ${updSubErr.message}` }

  return { ok: true, action: 'changed', refunded, newPlan: newPlan.name }
}
