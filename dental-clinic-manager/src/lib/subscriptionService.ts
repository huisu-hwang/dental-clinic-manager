// ============================================
// 구독 서비스 - DB CRUD 및 비즈니스 로직
// ============================================

import { createClient } from '@/lib/supabase/server'
import type {
  Subscription,
  SubscriptionPlan,
  SubscriptionPayment,
  SubscriptionStatusResponse,
} from '@/types/subscription'
import {
  chargeBillingKey,
  scheduleNextPayment,
  cancelScheduleByBillingKey,
  getNextBillingDate,
  calculateProratedAmount,
  getDaysBetween,
} from '@/lib/portone'

// 클리닉의 현재 구독 조회
export async function getSubscription(clinicId: string): Promise<Subscription | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('subscriptions')
    .select(`
      *,
      plan:subscription_plans(*)
    `)
    .eq('clinic_id', clinicId)
    .in('status', ['active', 'past_due', 'trialing', 'suspended'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null

  return {
    ...data,
    plan: data.plan as unknown as SubscriptionPlan | null,
  } as Subscription
}

// 플랜 목록 조회
export async function getPlans(type?: 'headcount' | 'feature'): Promise<SubscriptionPlan[]> {
  const supabase = await createClient()
  let query = supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  if (type) {
    query = query.eq('type', type)
  }

  const { data, error } = await query
  if (error || !data) return []

  return data.map(plan => ({
    ...plan,
    features: Array.isArray(plan.features) ? plan.features : JSON.parse(String(plan.features ?? '[]')),
  })) as SubscriptionPlan[]
}

// 플랜 단건 조회
export async function getPlanById(planId: string): Promise<SubscriptionPlan | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('id', planId)
    .single()

  if (error || !data) return null
  return {
    ...data,
    features: Array.isArray(data.features) ? data.features : JSON.parse(String(data.features ?? '[]')),
  } as SubscriptionPlan
}

// 클리닉 인원수에 맞는 헤드카운트 플랜 찾기
export async function getRecommendedPlan(userCount: number): Promise<SubscriptionPlan | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('type', 'headcount')
    .eq('is_active', true)
    .lte('min_users', userCount)
    .gte('max_users', userCount)
    .single()

  if (error || !data) return null
  return data as SubscriptionPlan
}

// 구독 결제 내역 조회
export async function getPayments(clinicId: string, limit = 12): Promise<SubscriptionPayment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('subscription_payments')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data as SubscriptionPayment[]
}

// 구독 등록 (빌링키 저장 + 첫 결제 + 다음달 예약)
export async function registerSubscription(params: {
  clinicId: string
  planId: string
  billingKey: string
  cardName: string
  cardNumberLast4: string
  customerName: string
  customerEmail: string
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const plan = await getPlanById(params.planId)
  if (!plan) return { success: false, error: '플랜을 찾을 수 없습니다' }

  // Free 플랜은 결제 없이 즉시 활성화
  if (plan.price === 0) {
    return activateFreePlan(params.clinicId, plan.id)
  }

  const now = new Date()
  const nextBilling = getNextBillingDate(now)

  try {
    // 1. 즉시 결제
    const paymentResult = await chargeBillingKey({
      clinicId: params.clinicId,
      billingKey: params.billingKey,
      amount: plan.price,
      orderName: `${plan.display_name} 플랜`,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      noticeUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/portone`,
    })

    if (paymentResult.status !== 'PAID') {
      return { success: false, error: '결제에 실패했습니다. 카드 정보를 확인해주세요.' }
    }

    // 2. 구독 레코드 생성 또는 업데이트
    const subscriptionData = {
      clinic_id: params.clinicId,
      plan_id: params.planId,
      status: 'active',
      billing_key: params.billingKey,
      card_name: params.cardName,
      card_number_last4: params.cardNumberLast4,
      current_period_start: now.toISOString(),
      current_period_end: nextBilling.toISOString(),
      next_billing_date: nextBilling.toISOString(),
      cancel_at_period_end: false,
      retry_count: 0,
      next_retry_at: null,
      updated_at: now.toISOString(),
    }

    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('clinic_id', params.clinicId)
      .single()

    if (existingSub) {
      await supabase.from('subscriptions').update(subscriptionData).eq('id', existingSub.id)
    } else {
      await supabase.from('subscriptions').insert(subscriptionData)
    }

    // 3. 결제 내역 저장
    await supabase.from('subscription_payments').insert({
      clinic_id: params.clinicId,
      portone_payment_id: paymentResult.paymentId,
      portone_tx_id: paymentResult.txId,
      amount: plan.price,
      status: 'paid',
      order_name: `${plan.display_name} 플랜`,
      paid_at: paymentResult.paidAt || now.toISOString(),
    })

    // 4. 다음 달 결제 예약
    await scheduleNextPayment({
      clinicId: params.clinicId,
      billingKey: params.billingKey,
      planPrice: plan.price,
      planName: `${plan.display_name} 플랜`,
      customerEmail: params.customerEmail,
      scheduledAt: nextBilling,
      noticeUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/portone`,
    })

    return { success: true }
  } catch (err) {
    console.error('구독 등록 오류:', err)
    return { success: false, error: err instanceof Error ? err.message : '구독 등록 중 오류가 발생했습니다' }
  }
}

// 무료 플랜 즉시 활성화
async function activateFreePlan(clinicId: string, planId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const now = new Date()
  const nextYear = new Date(now)
  nextYear.setFullYear(nextYear.getFullYear() + 10)

  const { error } = await supabase
    .from('subscriptions')
    .upsert({
      clinic_id: clinicId,
      plan_id: planId,
      status: 'active',
      billing_key: null,
      current_period_start: now.toISOString(),
      current_period_end: nextYear.toISOString(),
      next_billing_date: null,
      cancel_at_period_end: false,
      retry_count: 0,
      updated_at: now.toISOString(),
    }, { onConflict: 'clinic_id' })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// 플랜 변경 (업그레이드/다운그레이드)
export async function changePlan(params: {
  clinicId: string
  newPlanId: string
  customerName: string
  customerEmail: string
}): Promise<{ success: boolean; error?: string; chargedAmount?: number }> {
  const supabase = await createClient()

  const currentSub = await getSubscription(params.clinicId)
  if (!currentSub) return { success: false, error: '현재 구독 정보를 찾을 수 없습니다' }
  if (!currentSub.billing_key) return { success: false, error: '등록된 결제 수단이 없습니다' }

  const newPlan = await getPlanById(params.newPlanId)
  if (!newPlan) return { success: false, error: '새 플랜을 찾을 수 없습니다' }

  const currentPlan = currentSub.plan
  const now = new Date()
  const nextBilling = currentSub.next_billing_date
    ? new Date(currentSub.next_billing_date)
    : getNextBillingDate(now)

  const remainingDays = Math.max(0, getDaysBetween(now, nextBilling))

  try {
    let chargedAmount = 0

    // 업그레이드 시 차액 즉시 청구
    if (currentPlan && newPlan.price > currentPlan.price) {
      const oldPlanProrated = calculateProratedAmount(currentPlan.price, remainingDays)
      const newPlanProrated = calculateProratedAmount(newPlan.price, remainingDays)
      const diff = newPlanProrated - oldPlanProrated

      if (diff > 0) {
        const paymentResult = await chargeBillingKey({
          clinicId: params.clinicId,
          billingKey: currentSub.billing_key,
          amount: diff,
          orderName: `${newPlan.display_name} 플랜 업그레이드 차액`,
          customerName: params.customerName,
          customerEmail: params.customerEmail,
          noticeUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/portone`,
        })

        if (paymentResult.status !== 'PAID') {
          return { success: false, error: '업그레이드 차액 결제에 실패했습니다' }
        }

        await supabase.from('subscription_payments').insert({
          clinic_id: params.clinicId,
          portone_payment_id: paymentResult.paymentId,
          portone_tx_id: paymentResult.txId,
          amount: diff,
          status: 'paid',
          order_name: `${newPlan.display_name} 플랜 업그레이드 차액`,
          paid_at: paymentResult.paidAt || now.toISOString(),
        })

        chargedAmount = diff
      }
    }

    // 기존 예약 취소
    await cancelScheduleByBillingKey(currentSub.billing_key)

    // 새 예약 등록
    await scheduleNextPayment({
      clinicId: params.clinicId,
      billingKey: currentSub.billing_key,
      planPrice: newPlan.price,
      planName: `${newPlan.display_name} 플랜`,
      customerEmail: params.customerEmail,
      scheduledAt: nextBilling,
      noticeUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/portone`,
    })

    // 구독 정보 업데이트
    await supabase
      .from('subscriptions')
      .update({ plan_id: params.newPlanId, updated_at: now.toISOString() })
      .eq('id', currentSub.id)

    return { success: true, chargedAmount }
  } catch (err) {
    console.error('플랜 변경 오류:', err)
    return { success: false, error: err instanceof Error ? err.message : '플랜 변경 중 오류가 발생했습니다' }
  }
}

// 구독 취소
export async function cancelSubscription(params: {
  clinicId: string
  immediate: boolean
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const currentSub = await getSubscription(params.clinicId)
  if (!currentSub) return { success: false, error: '구독 정보를 찾을 수 없습니다' }

  try {
    // 포트원 예약 결제 취소
    if (currentSub.billing_key) {
      await cancelScheduleByBillingKey(currentSub.billing_key)
    }

    const now = new Date()

    if (params.immediate) {
      // 즉시 취소
      await supabase.from('subscriptions').update({
        status: 'cancelled',
        cancelled_at: now.toISOString(),
        billing_key: null,
        updated_at: now.toISOString(),
      }).eq('id', currentSub.id)
    } else {
      // 기간 만료 후 취소 (서비스는 현재 기간까지 유지)
      await supabase.from('subscriptions').update({
        cancel_at_period_end: true,
        updated_at: now.toISOString(),
      }).eq('id', currentSub.id)
    }

    return { success: true }
  } catch (err) {
    console.error('구독 취소 오류:', err)
    return { success: false, error: err instanceof Error ? err.message : '구독 취소 중 오류가 발생했습니다' }
  }
}

// 결제 성공 처리 (웹훅에서 호출)
export async function handlePaymentSuccess(params: {
  clinicId: string
  portonePaymentId: string
  portoneTransactionId: string
  amount: number
  orderName: string
  paidAt: string
}): Promise<void> {
  const supabase = await createClient()

  // 결제 내역 저장
  await supabase.from('subscription_payments').upsert({
    clinic_id: params.clinicId,
    portone_payment_id: params.portonePaymentId,
    portone_tx_id: params.portoneTransactionId,
    amount: params.amount,
    status: 'paid',
    order_name: params.orderName,
    paid_at: params.paidAt,
  }, { onConflict: 'portone_payment_id' })

  // 구독 상태 갱신
  const sub = await getSubscription(params.clinicId)
  if (!sub) return

  const now = new Date()
  const nextBilling = getNextBillingDate(now)

  await supabase.from('subscriptions').update({
    status: 'active',
    current_period_start: now.toISOString(),
    current_period_end: nextBilling.toISOString(),
    next_billing_date: nextBilling.toISOString(),
    retry_count: 0,
    next_retry_at: null,
    updated_at: now.toISOString(),
  }).eq('id', sub.id)

  // 다음 달 예약 재등록
  if (sub.billing_key && sub.plan && sub.plan.price > 0) {
    await scheduleNextPayment({
      clinicId: params.clinicId,
      billingKey: sub.billing_key,
      planPrice: sub.plan.price,
      planName: `${sub.plan.display_name} 플랜`,
      customerEmail: '',
      scheduledAt: nextBilling,
      noticeUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/portone`,
    })
  }
}

// 결제 실패 처리 (Dunning)
export async function handlePaymentFailure(params: {
  clinicId: string
  portonePaymentId: string
  failReason?: string
}): Promise<void> {
  const supabase = await createClient()

  // 결제 실패 기록
  await supabase.from('subscription_payments').upsert({
    clinic_id: params.clinicId,
    portone_payment_id: params.portonePaymentId,
    amount: 0,
    status: 'failed',
    failed_at: new Date().toISOString(),
    fail_reason: params.failReason,
  }, { onConflict: 'portone_payment_id' })

  const sub = await getSubscription(params.clinicId)
  if (!sub) return

  const retryDelays = [3, 7, 14] // 재시도 간격 (일)
  const retryCount = sub.retry_count

  if (retryCount < retryDelays.length) {
    // 재시도 예약
    const nextRetry = new Date()
    nextRetry.setDate(nextRetry.getDate() + retryDelays[retryCount])

    if (sub.billing_key && sub.plan) {
      await scheduleNextPayment({
        clinicId: params.clinicId,
        billingKey: sub.billing_key,
        planPrice: sub.plan.price,
        planName: `${sub.plan.display_name} 플랜 (재시도 ${retryCount + 1}회)`,
        customerEmail: '',
        scheduledAt: nextRetry,
        noticeUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/portone`,
      })
    }

    await supabase.from('subscriptions').update({
      status: 'past_due',
      retry_count: retryCount + 1,
      next_retry_at: nextRetry.toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', sub.id)
  } else {
    // 최대 재시도 초과 → 서비스 정지
    await supabase.from('subscriptions').update({
      status: 'suspended',
      updated_at: new Date().toISOString(),
    }).eq('id', sub.id)
  }
}

// 구독 상태 종합 조회 (API 응답용)
export async function getSubscriptionStatus(clinicId: string): Promise<SubscriptionStatusResponse> {
  const [subscription, payments] = await Promise.all([
    getSubscription(clinicId),
    getPayments(clinicId, 12),
  ])

  const plan = subscription?.plan ?? null
  const isFreePlan = !plan || plan.price === 0

  let daysUntilExpiry: number | null = null
  if (subscription?.current_period_end) {
    const expiry = new Date(subscription.current_period_end)
    daysUntilExpiry = getDaysBetween(new Date(), expiry)
  }

  return {
    subscription: subscription ?? null,
    plan,
    payments,
    isFreePlan,
    canUpgrade: isFreePlan || (plan?.type === 'headcount' && plan.name !== 'enterprise'),
    daysUntilExpiry,
  }
}

// 해당 병원의 승인된(active) 직원 수 조회 — 인원 상한 체크용
export async function countActiveEmployees(clinicId: string): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('status', 'active')
  if (error) throw new Error(`countActiveEmployees: ${error.message}`)
  return count ?? 0
}

// 현재 구독의 가장 최근 성공 결제 조회 (부분 환불 기준 계산용)
export async function getLatestPaidPayment(clinicId: string) {
  const supabase = await createClient()
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
