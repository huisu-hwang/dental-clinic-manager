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
  const { data, error } = await admin
    .from('user_subscription_plans')
    .select('*')
    .eq('feature_id', FEATURE_INVESTMENT)
    .single()
  if (error) {
    console.error('[userSubscription.getInvestmentPlan] DB error:', error.message)
    return null
  }
  return (data as UserSubscriptionPlan | null) ?? null
}

export async function getUserSubscription(userId: string): Promise<UserSubscription | null> {
  const admin = getSupabaseAdmin()
  if (!admin) return null
  const { data, error } = await admin
    .from('user_subscriptions')
    .select(`*, plan:user_subscription_plans(*)`)
    .eq('user_id', userId)
    .in('status', ['active', 'past_due', 'suspended'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[userSubscription.getUserSubscription] DB error:', { userId, error: error.message })
    return null
  }
  return (data as UserSubscription | null) ?? null
}

export async function getUserPayments(userId: string, limit = 12): Promise<UserSubscriptionPayment[]> {
  const admin = getSupabaseAdmin()
  if (!admin) return []
  const { data, error } = await admin
    .from('user_subscription_payments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('[userSubscription.getUserPayments] DB error:', { userId, error: error.message })
    return []
  }
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

  // Re-registration guard: 이미 활성 구독이 있으면 중복 결제 방지
  const { data: existingActive } = await admin
    .from('user_subscriptions')
    .select('id, status')
    .eq('user_id', params.userId)
    .eq('plan_id', params.planId)
    .in('status', ['active', 'past_due'])
    .maybeSingle()
  if (existingActive) {
    return { success: false, error: '이미 활성 구독이 있습니다. 결제 수단 변경은 별도 흐름을 사용하세요.' }
  }

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

    const { data: existing, error: existingErr } = await admin
      .from('user_subscriptions')
      .select('id')
      .eq('user_id', params.userId)
      .eq('plan_id', params.planId)
      .maybeSingle()
    if (existingErr) {
      console.error('[userSubscription.register] existing lookup failed:', existingErr.message)
      return { success: false, error: '구독 정보 조회 실패' }
    }

    let subscriptionId: string | null = null
    if (existing) {
      const { data: updated, error: updErr } = await admin
        .from('user_subscriptions')
        .update(subscriptionData)
        .eq('id', (existing as { id: string }).id)
        .select('id')
        .single()
      if (updErr || !updated) {
        console.error('[userSubscription.register] update failed:', updErr?.message)
        return { success: false, error: '구독 정보 갱신 실패' }
      }
      subscriptionId = (updated as { id: string }).id
    } else {
      const { data: inserted, error: insErr } = await admin
        .from('user_subscriptions')
        .insert(subscriptionData)
        .select('id')
        .single()
      if (insErr || !inserted) {
        console.error('[userSubscription.register] insert failed:', insErr?.message)
        return { success: false, error: '구독 생성 실패' }
      }
      subscriptionId = (inserted as { id: string }).id
    }

    const { error: payErr } = await admin.from('user_subscription_payments').insert({
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
    if (payErr) {
      console.error('[userSubscription.register] payment insert failed:', payErr.message)
      // 결제는 성공했지만 기록 실패 — webhook에서 보강 가능 (UNIQUE portone_payment_id)
      return { success: false, error: '결제 기록 저장 실패. 잠시 후 다시 확인해주세요.' }
    }

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
        .update({ status: 'cancelled', cancelled_at: now, billing_key: null, updated_at: now })
        .eq('id', sub.id)
    } else {
      await admin.from('user_subscriptions')
        .update({ cancel_at_period_end: true, updated_at: now })
        .eq('id', sub.id)
    }
    return { success: true }
  } catch (err) {
    console.error('[userSubscription.cancel] 실패:', err)
    return { success: false, error: err instanceof Error ? err.message : '구독 취소 실패' }
  }
}
