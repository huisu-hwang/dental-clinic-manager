import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { issueBillingKey, confirmBilling } from '@/lib/tossPayments/billing'
import { TossPaymentsError } from '@/lib/tossPayments/client'
import { userMessageForCode } from '@/lib/tossPayments/errors'
import { getIssuerName } from '@/lib/tossPayments/issuerCodes'
import type { SubscriptionPlan } from '@/types/subscription'

/**
 * 클리닉의 토스 customerKey를 발급/조회.
 * - 기존 row(임의 status)의 customer_key 존재 → 그 값 반환
 * - 없으면 새 UUID 발급 + status='pending' 빈 subscription row 생성
 *
 * 멱등하게 동작 (여러 번 호출해도 동일 customer_key 반환).
 */
export async function getOrCreateCustomerKey(clinicId: string): Promise<string> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id, customer_key')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.customer_key) {
    return existing.customer_key as string
  }

  const customerKey = randomUUID()
  const { error } = await supabase.from('subscriptions').insert({
    clinic_id: clinicId,
    customer_key: customerKey,
    status: 'pending',
    cancel_at_period_end: false,
    retry_count: 0,
  })
  if (error) throw new Error(`customer_key 생성 실패: ${error.message}`)

  return customerKey
}

// ===========================================================================
// Helpers (exported for testability)
// ===========================================================================

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * 한국 시간 기준 YYYYMM 문자열 반환.
 */
export function nowKstYyyymm(): string {
  const kst = new Date(Date.now() + KST_OFFSET_MS)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  return `${y}${m}`
}

/**
 * 토스 orderId 생성: `sub-{clinicId 앞 8자}-{YYYYMM}` (재시도 시 `-rN` 접미사).
 */
export function makeOrderId(clinicId: string, retryCount = 0): string {
  const prefix8 = clinicId.replace(/-/g, '').slice(0, 8)
  const ym = nowKstYyyymm()
  return retryCount > 0
    ? `sub-${prefix8}-${ym}-r${retryCount}`
    : `sub-${prefix8}-${ym}`
}

/**
 * 주어진 날짜에 1개월 더하기 (JS Date 자연 처리: 1/31 → 3/3 등).
 */
export function addOneMonth(from: Date): Date {
  const d = new Date(from)
  d.setMonth(d.getMonth() + 1)
  return d
}

// ===========================================================================
// registerSubscription (saga pattern)
// ===========================================================================

interface RegisterParams {
  clinicId: string
  planId: string
  authKey: string
  customerKey: string
  customerName: string
  customerEmail: string
}

interface RegisterResult {
  success: boolean
  subscriptionId?: string
  paymentKey?: string
  error?: string
  errorCode?: string
}

/**
 * 구독 등록: 빌링키 발급 + 첫 결제 + DB 저장을 단계적으로 수행 (saga).
 *
 * Step 0: 중복 active/past_due/trialing 차단
 * Step 1: 빌링키 발급 (issueBillingKey) → subscriptions 업데이트 (billing_key, plan_id, card_company)
 * Step 2: subscription_payments INSERT (status='pending', toss_order_id, idempotency_key)
 * Step 3: 첫 결제 (confirmBilling)
 *   - 성공: subscription_payments(status='paid') + subscriptions(status='active', period_*)
 *   - 실패: subscription_payments(status='failed') + subscriptions(status='past_due', retry_count=1, next_retry_at=Day+1)
 */
export async function registerSubscription(
  params: RegisterParams
): Promise<RegisterResult> {
  const supabase = await createClient()

  // Step 0: 중복 active/past_due/trialing 차단
  const { data: existingActive } = await supabase
    .from('subscriptions')
    .select('id, status')
    .eq('clinic_id', params.clinicId)
    .in('status', ['active', 'past_due', 'trialing'])
    .maybeSingle()
  if (existingActive) {
    return {
      success: false,
      error: '이미 활성 구독이 있습니다. 플랜 변경은 업그레이드를 사용하세요.',
    }
  }

  // 플랜 조회
  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('id', params.planId)
    .single<SubscriptionPlan>()
  if (!plan) {
    return { success: false, error: '플랜을 찾을 수 없습니다.' }
  }

  // Step 1: 빌링키 발급
  let billing
  try {
    billing = await issueBillingKey({
      authKey: params.authKey,
      customerKey: params.customerKey,
    })
  } catch (err) {
    const tossErr = err instanceof TossPaymentsError ? err : null
    return {
      success: false,
      errorCode: tossErr?.code,
      error: tossErr
        ? userMessageForCode(tossErr.code)
        : '빌링키 발급에 실패했습니다.',
    }
  }

  // 빌링키/플랜/카드 정보 저장
  await supabase
    .from('subscriptions')
    .update({
      plan_id: params.planId,
      billing_key: billing.billingKey,
      card_company: getIssuerName(billing.card.issuerCode),
      billing_method: 'card',
    })
    .eq('clinic_id', params.clinicId)
    .eq('customer_key', params.customerKey)

  // Step 2: 결제 시도 row 사전 INSERT
  const orderId = makeOrderId(params.clinicId, 0)
  const orderName = `${plan.display_name} 플랜 (월 구독)`

  const { data: subRow } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('customer_key', params.customerKey)
    .single()

  const { data: paymentRow, error: insertErr } = await supabase
    .from('subscription_payments')
    .insert({
      clinic_id: params.clinicId,
      subscription_id: subRow?.id,
      toss_order_id: orderId,
      idempotency_key: orderId,
      amount: plan.price,
      status: 'pending',
      order_name: orderName,
    })
    .select('id')
    .single()

  if (insertErr) {
    return { success: false, error: `결제 기록 생성 실패: ${insertErr.message}` }
  }

  // Step 3: 첫 결제 호출
  try {
    const payment = await confirmBilling({
      billingKey: billing.billingKey,
      customerKey: params.customerKey,
      orderId,
      orderName,
      amount: plan.price,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
    })

    const periodStart = new Date()
    const periodEnd = addOneMonth(periodStart)
    const nextBilling = addOneMonth(periodStart)

    await supabase
      .from('subscription_payments')
      .update({
        status: 'paid',
        toss_payment_key: payment.paymentKey,
        toss_secret: payment.secret ?? null,
        method: payment.method,
        receipt_url: payment.receipt?.url ?? null,
        raw_response: payment as unknown as Record<string, unknown>,
        paid_at: payment.approvedAt ?? new Date().toISOString(),
      })
      .eq('id', paymentRow!.id)

    await supabase
      .from('subscriptions')
      .update({
        status: 'active',
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        next_billing_date: nextBilling.toISOString(),
        retry_count: 0,
      })
      .eq('id', subRow!.id)

    return {
      success: true,
      subscriptionId: subRow!.id,
      paymentKey: payment.paymentKey,
    }
  } catch (err) {
    const tossErr = err instanceof TossPaymentsError ? err : null
    const failMsg = tossErr ? `${tossErr.code}: ${tossErr.message}` : String(err)

    await supabase
      .from('subscription_payments')
      .update({
        status: 'failed',
        fail_reason: failMsg,
        failed_at: new Date().toISOString(),
      })
      .eq('id', paymentRow!.id)

    await supabase
      .from('subscriptions')
      .update({
        status: 'past_due',
        retry_count: 1,
        next_retry_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', subRow!.id)

    return {
      success: false,
      errorCode: tossErr?.code,
      error: tossErr
        ? userMessageForCode(tossErr.code)
        : '결제에 실패했습니다.',
    }
  }
}
