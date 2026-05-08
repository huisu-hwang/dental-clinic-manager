// src/lib/userBillingService.ts
// 개인 (user-level) 투자 구독 토스 빌링 서비스
// 클리닉 billingService 패턴을 user_id 기준으로 미러링

import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { issueBillingKey, confirmBilling } from '@/lib/tossPayments/billing'
import { TossPaymentsError } from '@/lib/tossPayments/client'
import { userMessageForCode } from '@/lib/tossPayments/errors'
import { getIssuerName } from '@/lib/tossPayments/issuerCodes'

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export function nowKstYyyymm(): string {
  const kst = new Date(Date.now() + KST_OFFSET_MS)
  return `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, '0')}`
}

export function makeInvOrderId(userId: string, retryCount = 0): string {
  const prefix8 = userId.replace(/-/g, '').slice(0, 8)
  const ym = nowKstYyyymm()
  return retryCount > 0 ? `inv-${prefix8}-${ym}-r${retryCount}` : `inv-${prefix8}-${ym}`
}

export function addOneMonth(from: Date): Date {
  const d = new Date(from)
  d.setMonth(d.getMonth() + 1)
  return d
}

/**
 * user_subscriptions의 customer_key 발급/조회.
 * - 기존 row의 customer_key가 있으면 그 값 반환
 * - 없으면 새 UUID 발급 + (user_id, plan_id) row 생성 (status='pending')
 */
export async function getOrCreateUserCustomerKey(
  userId: string,
  planId: string
): Promise<string> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('user_subscriptions')
    .select('id, customer_key')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.customer_key) return existing.customer_key as string

  const customerKey = randomUUID()
  // user_subscriptions에는 (user_id, plan_id) UNIQUE가 있으므로 plan_id 함께 저장
  const { error } = await supabase.from('user_subscriptions').insert({
    user_id: userId,
    plan_id: planId,
    customer_key: customerKey,
    status: 'pending',
  })
  if (error) throw new Error(`customer_key 생성 실패: ${error.message}`)

  return customerKey
}

interface RegisterUserParams {
  userId: string
  planId: string
  authKey: string
  customerKey: string
  customerName: string
  customerEmail: string
  amount: number
  planName: string
}

interface RegisterUserResult {
  success: boolean
  paymentKey?: string
  error?: string
  errorCode?: string
}

/**
 * 개인 투자 구독 등록: 빌링키 발급 + 첫 결제 + DB 저장 (saga).
 * Step 1: 빌링키 발급 → user_subscriptions UPDATE (billing_key, card_company)
 * Step 2: user_subscription_payments INSERT (status='pending')
 * Step 3: 첫 결제 호출
 *   - 성공: payment(status='paid') + subscription(status='active', period_*)
 *   - 실패: payment(status='failed') + subscription(status='past_due')
 */
export async function registerUserSubscription(
  params: RegisterUserParams
): Promise<RegisterUserResult> {
  const supabase = await createClient()

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
      error: tossErr ? userMessageForCode(tossErr.code) : '빌링키 발급 실패',
    }
  }

  // user_subscriptions UPDATE — billing_key + 카드 정보
  await supabase
    .from('user_subscriptions')
    .update({
      billing_key: billing.billingKey,
      card_company: getIssuerName(billing.card.issuerCode),
      billing_method: 'card',
    })
    .eq('user_id', params.userId)
    .eq('customer_key', params.customerKey)

  const orderId = makeInvOrderId(params.userId, 0)
  const orderName = `${params.planName} (월 구독)`

  const { data: subRow } = await supabase
    .from('user_subscriptions')
    .select('id')
    .eq('user_id', params.userId)
    .eq('customer_key', params.customerKey)
    .single()

  // Step 2: user_subscription_payments INSERT
  const { data: paymentRow, error: insertErr } = await supabase
    .from('user_subscription_payments')
    .insert({
      user_id: params.userId,
      subscription_id: subRow?.id,
      toss_order_id: orderId,
      idempotency_key: orderId,
      amount: params.amount,
      base_amount: params.amount,
      status: 'pending',
      order_name: orderName,
    })
    .select('id')
    .single()

  if (insertErr) {
    return { success: false, error: `결제 기록 생성 실패: ${insertErr.message}` }
  }

  // Step 3: 첫 결제
  try {
    const payment = await confirmBilling({
      billingKey: billing.billingKey,
      customerKey: params.customerKey,
      orderId,
      orderName,
      amount: params.amount,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
    })

    const periodStart = new Date()
    const nextBilling = addOneMonth(periodStart)

    await supabase
      .from('user_subscription_payments')
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
      .from('user_subscriptions')
      .update({
        status: 'active',
        current_period_start: periodStart.toISOString(),
        current_period_end: nextBilling.toISOString(),
        next_billing_date: nextBilling.toISOString(),
      })
      .eq('id', subRow!.id)

    return { success: true, paymentKey: payment.paymentKey }
  } catch (err) {
    const tossErr = err instanceof TossPaymentsError ? err : null
    const failMsg = tossErr ? `${tossErr.code}: ${tossErr.message}` : String(err)

    if (paymentRow) {
      await supabase
        .from('user_subscription_payments')
        .update({
          status: 'failed',
          fail_reason: failMsg,
          failed_at: new Date().toISOString(),
        })
        .eq('id', paymentRow.id)
    }

    await supabase
      .from('user_subscriptions')
      .update({
        status: 'past_due',
      })
      .eq('user_id', params.userId)
      .eq('customer_key', params.customerKey)

    return {
      success: false,
      errorCode: tossErr?.code,
      error: tossErr ? userMessageForCode(tossErr.code) : '첫 결제 실패',
    }
  }
}

/**
 * 활성 사용자 구독 취소.
 * - immediate=true: 즉시 cancelled 상태로 전환 + next_billing_date 제거
 * - immediate=false: 현재 결제 주기 종료 시점에 만료 (cancel_at_period_end=true)
 */
export async function cancelUserSubscription(
  userId: string,
  immediate: boolean
): Promise<{ success: boolean }> {
  const supabase = await createClient()
  if (immediate) {
    await supabase
      .from('user_subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        next_billing_date: null,
      })
      .eq('user_id', userId)
      .in('status', ['active', 'past_due'])
  } else {
    await supabase
      .from('user_subscriptions')
      .update({
        cancel_at_period_end: true,
        cancelled_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .in('status', ['active', 'past_due'])
  }
  return { success: true }
}
