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

// ===========================================================================
// runDueCharges (cron 호출용)
// ===========================================================================

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

interface ChargeOneParams {
  clinicId: string
  subscriptionId: string
  billingKey: string
  customerKey: string
  customerName: string
  customerEmail: string
  amount: number
  planName: string
  retryCount: number
}

async function chargeOne(
  p: ChargeOneParams
): Promise<{ ok: boolean; failMsg?: string; errorCode?: string }> {
  const supabase = await createClient()
  const orderId = makeOrderId(p.clinicId, p.retryCount)
  const orderName = `${p.planName} 플랜 (월 구독)`

  // 시도 row 사전 INSERT (orderId UNIQUE 충돌 시 결제만 재시도)
  const { data: paymentRow, error: insertErr } = await supabase
    .from('subscription_payments')
    .insert({
      clinic_id: p.clinicId,
      subscription_id: p.subscriptionId,
      toss_order_id: orderId,
      idempotency_key: orderId,
      amount: p.amount,
      status: 'pending',
      order_name: orderName,
    })
    .select('id')
    .single()

  let paymentRowId: string | undefined = paymentRow?.id
  if (insertErr) {
    const { data: existing } = await supabase
      .from('subscription_payments')
      .select('id, status')
      .eq('toss_order_id', orderId)
      .single()
    if (!existing) return { ok: false, failMsg: 'INSERT 실패 + 기존 row 없음' }
    if (existing.status === 'paid') return { ok: true } // 이미 결제됨
    paymentRowId = existing.id
  }

  try {
    const payment = await confirmBilling({
      billingKey: p.billingKey,
      customerKey: p.customerKey,
      orderId,
      orderName,
      amount: p.amount,
      customerName: p.customerName,
      customerEmail: p.customerEmail,
    })

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
      .eq('id', paymentRowId)

    return { ok: true }
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
      .eq('id', paymentRowId)

    return { ok: false, failMsg, errorCode: tossErr?.code }
  }
}

/**
 * 결제일 도래 구독을 직렬로 일괄 청구.
 * - 매일 KST 02:00 cron이 호출
 * - `next_billing_date <= NOW() AND status='active'` 인 구독을 조회
 * - 토스 율 제한 회피를 위해 각 호출 간 150ms 지연
 */
export async function runDueCharges(): Promise<{
  processed: number
  succeeded: number
  failed: number
}> {
  const supabase = await createClient()
  const { data: dueSubs } = await supabase
    .from('subscriptions')
    .select(
      'id, clinic_id, billing_key, customer_key, plan_id, plan:subscription_plans(*)'
    )
    .eq('status', 'active')
    .lte('next_billing_date', new Date().toISOString())

  if (!dueSubs || dueSubs.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 }
  }

  let succeeded = 0
  let failed = 0

  for (const sub of dueSubs) {
    const plan = sub.plan as unknown as SubscriptionPlan | null
    if (!plan || !sub.billing_key) {
      failed++
      continue
    }

    // 클리닉 owner 정보
    const { data: owner } = await supabase
      .from('users')
      .select('name, email')
      .eq('clinic_id', sub.clinic_id)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle()

    const result = await chargeOne({
      clinicId: sub.clinic_id,
      subscriptionId: sub.id,
      billingKey: sub.billing_key,
      customerKey: sub.customer_key,
      customerName: owner?.name ?? '',
      customerEmail: owner?.email ?? '',
      amount: plan.price,
      planName: plan.display_name,
      retryCount: 0,
    })

    if (result.ok) {
      succeeded++
      const nextBilling = addOneMonth(new Date())
      await supabase
        .from('subscriptions')
        .update({
          current_period_start: new Date().toISOString(),
          current_period_end: nextBilling.toISOString(),
          next_billing_date: nextBilling.toISOString(),
          retry_count: 0,
        })
        .eq('id', sub.id)
    } else {
      failed++
      await supabase
        .from('subscriptions')
        .update({
          status: 'past_due',
          retry_count: 1,
          next_retry_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', sub.id)
    }

    await sleep(150) // 토스 율 제한 회피
  }

  return { processed: dueSubs.length, succeeded, failed }
}

// ===========================================================================
// runRetries (cron 호출용 — past_due 재시도)
// ===========================================================================

const MAX_RETRY = 3 // 1~3회차까지 재시도 (Day+1, Day+2, Day+3)
const SUSPEND_AFTER = 4 // retry_count >= 4 → 정지

/**
 * past_due 구독 재시도 (매일 KST 03:00 cron).
 * - `status='past_due' AND next_retry_at <= NOW()` 구독을 조회
 * - retry_count >= 4 → 토스 호출 없이 즉시 정지
 * - 1~3회차 실패 → next_retry_at += 1day
 * - 3회차 실패(retry_count 3 → 4) → next_retry_at += 7day (유예 후 다음 cron이 정지 처리)
 * - 성공 시 status='active' 복구 + 다음 결제일 갱신
 * - 토스 율 제한 회피를 위해 각 호출 간 150ms 지연
 */
export async function runRetries(): Promise<{
  processed: number
  recovered: number
  suspended: number
}> {
  const supabase = await createClient()
  const { data: candidates } = await supabase
    .from('subscriptions')
    .select(
      'id, clinic_id, billing_key, customer_key, retry_count, plan:subscription_plans(*)'
    )
    .eq('status', 'past_due')
    .lte('next_retry_at', new Date().toISOString())

  if (!candidates || candidates.length === 0) {
    return { processed: 0, recovered: 0, suspended: 0 }
  }

  let recovered = 0
  let suspended = 0

  for (const sub of candidates) {
    if (sub.retry_count >= SUSPEND_AFTER) {
      // 토스 호출 없이 즉시 정지
      await supabase
        .from('subscriptions')
        .update({
          status: 'suspended',
        })
        .eq('id', sub.id)
      suspended++
      continue
    }

    const plan = sub.plan as unknown as SubscriptionPlan | null
    if (!plan || !sub.billing_key) {
      suspended++
      continue
    }

    // 클리닉 owner 정보
    const { data: owner } = await supabase
      .from('users')
      .select('name, email')
      .eq('clinic_id', sub.clinic_id)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle()

    const result = await chargeOne({
      clinicId: sub.clinic_id,
      subscriptionId: sub.id,
      billingKey: sub.billing_key,
      customerKey: sub.customer_key,
      customerName: owner?.name ?? '',
      customerEmail: owner?.email ?? '',
      amount: plan.price,
      planName: plan.display_name,
      retryCount: sub.retry_count,
    })

    if (result.ok) {
      recovered++
      const nextBilling = addOneMonth(new Date())
      await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: nextBilling.toISOString(),
          next_billing_date: nextBilling.toISOString(),
          retry_count: 0,
          next_retry_at: null,
        })
        .eq('id', sub.id)
    } else {
      const newCount = sub.retry_count + 1
      // 1~3회차: +1 day; 3회차 실패(newCount=4) → +7 day 유예; 그 후엔 cron이 retry_count=4 보고 즉시 정지
      const nextRetryDays = newCount >= MAX_RETRY ? 7 : 1
      await supabase
        .from('subscriptions')
        .update({
          retry_count: newCount,
          next_retry_at: new Date(
            Date.now() + nextRetryDays * 24 * 60 * 60 * 1000
          ).toISOString(),
        })
        .eq('id', sub.id)
    }

    await sleep(150) // 토스 율 제한 회피
  }

  return { processed: candidates.length, recovered, suspended }
}
