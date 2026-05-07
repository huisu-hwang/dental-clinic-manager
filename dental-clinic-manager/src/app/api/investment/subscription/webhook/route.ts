// src/app/api/investment/subscription/webhook/route.ts
// PortOne v2 결제 webhook. 빌링키 자동결제(예약) 결과 처리.
//
// 보안: PortOne webhook 검증은 portone-webhook-secret 헤더 + payload 서명. 1차에는 paymentId 존재 검증만.
// 추후 정식 서명 검증 추가 (별도 task).

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getPayment, getNextBillingDate } from '@/lib/portone'

const MAX_RETRY = 3

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as
    | { type?: string; data?: { paymentId?: string } }
    | null
  if (!body?.data?.paymentId) {
    return NextResponse.json({ ok: true, ignored: 'no paymentId' })
  }

  const portonePaymentId = body.data.paymentId
  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ ok: false }, { status: 500 })

  // Idempotency: 동일 paymentId 이미 처리됐으면 즉시 200
  const { data: existingPayment, error: existingErr } = await admin
    .from('user_subscription_payments')
    .select('id')
    .eq('portone_payment_id', portonePaymentId)
    .maybeSingle()
  if (existingErr) {
    console.error('[webhook] idempotency check failed:', { portonePaymentId, error: existingErr.message })
    return NextResponse.json({ ok: true, ignored: 'idempotency check error' })
  }
  if (existingPayment) {
    return NextResponse.json({ ok: true, ignored: 'already processed' })
  }

  const portonePayment = await getPayment(portonePaymentId).catch((e) => {
    console.error('[webhook] getPayment failed:', { portonePaymentId, error: e instanceof Error ? e.message : e })
    return null
  })
  if (!portonePayment) return NextResponse.json({ ok: true, ignored: 'no portone payment' })

  // PortOne paymentId 포맷: payment-<userId>-<ts> 또는 payment-scheduled-<userId>-<ts>
  // userId는 Supabase auth.users UUID (8-4-4-4-12)
  const m = portonePaymentId.match(/^payment-(?:scheduled-)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-\d+$/i)
  const userId = m?.[1] ?? null
  if (!userId) return NextResponse.json({ ok: true, ignored: 'cannot extract userId' })

  const { data: subData, error: subErr } = await admin
    .from('user_subscriptions')
    .select('id, plan_id, billing_key, retry_count, current_period_end')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (subErr) {
    console.error('[webhook] subscription lookup failed:', { userId, error: subErr.message })
    return NextResponse.json({ ok: true, ignored: 'subscription lookup error' })
  }
  const sub = subData as
    | { id: string; plan_id: string; billing_key: string | null; retry_count: number; current_period_end: string | null }
    | null
  if (!sub) return NextResponse.json({ ok: true, ignored: 'no user subscription' })

  const now = new Date()

  if (portonePayment.status === 'PAID') {
    const nextEnd = getNextBillingDate(now)

    // Insert payment FIRST (UNIQUE 제약으로 멱등 한 번 더 보장)
    const { error: payInsErr } = await admin.from('user_subscription_payments').insert({
      user_id: userId,
      subscription_id: sub.id,
      portone_payment_id: portonePaymentId,
      portone_tx_id: portonePayment.transactionId ?? null,
      amount: portonePayment.amount?.total ?? 0,
      base_amount: portonePayment.amount?.total ?? 0,
      revenue_share_amount: 0,
      realized_profit_basis: 0,
      status: 'paid',
      paid_at: portonePayment.paidAt ?? now.toISOString(),
      order_name: '주식 자동매매 정기결제',
      billing_period_start: now.toISOString().slice(0, 10),
      billing_period_end: nextEnd.toISOString().slice(0, 10),
    })
    if (payInsErr) {
      // UNIQUE 위반(23505) — 동시 webhook 경합. 이미 처리됐다고 보고 200 반환.
      const code = (payInsErr as { code?: string }).code
      if (code === '23505') {
        return NextResponse.json({ ok: true, ignored: 'duplicate (race)' })
      }
      console.error('[webhook] payment insert failed:', { portonePaymentId, error: payInsErr.message })
      // 기록 실패 → 200 반환해 PortOne 재시도 막음 (운영 알림에 의존)
      return NextResponse.json({ ok: true, ignored: 'payment insert failed' })
    }

    // Insert 성공 후에만 subscription 업데이트
    const { error: subUpdErr } = await admin.from('user_subscriptions').update({
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: nextEnd.toISOString(),
      next_billing_date: nextEnd.toISOString(),
      retry_count: 0,
      next_retry_at: null,
      updated_at: now.toISOString(),
    }).eq('id', sub.id)
    if (subUpdErr) {
      console.error('[webhook] subscription update failed:', { userId, error: subUpdErr.message })
    }
    return NextResponse.json({ ok: true })
  }

  if (portonePayment.status === 'FAILED') {
    const retryCount = (sub.retry_count ?? 0) + 1
    const newStatus = retryCount >= MAX_RETRY ? 'suspended' : 'past_due'
    const nextRetry = retryCount < MAX_RETRY ? new Date(now.getTime() + 12 * 3600_000) : null

    // Insert FIRST (멱등)
    const { error: payInsErr } = await admin.from('user_subscription_payments').insert({
      user_id: userId,
      subscription_id: sub.id,
      portone_payment_id: portonePaymentId,
      portone_tx_id: portonePayment.transactionId ?? null,
      amount: portonePayment.amount?.total ?? 0,
      base_amount: portonePayment.amount?.total ?? 0,
      revenue_share_amount: 0,
      realized_profit_basis: 0,
      status: 'failed',
      failed_at: portonePayment.failedAt ?? now.toISOString(),
      fail_reason: portonePayment.failReason ?? '결제 실패',
      order_name: '주식 자동매매 정기결제',
    })
    if (payInsErr) {
      const code = (payInsErr as { code?: string }).code
      if (code === '23505') {
        return NextResponse.json({ ok: true, ignored: 'duplicate (race)' })
      }
      console.error('[webhook] failed payment insert error:', { portonePaymentId, error: payInsErr.message })
      return NextResponse.json({ ok: true, ignored: 'payment insert failed' })
    }

    const { error: subUpdErr } = await admin.from('user_subscriptions').update({
      status: newStatus,
      retry_count: retryCount,
      next_retry_at: nextRetry?.toISOString() ?? null,
      updated_at: now.toISOString(),
    }).eq('id', sub.id)
    if (subUpdErr) {
      console.error('[webhook] subscription failure update failed:', { userId, error: subUpdErr.message })
    }
  }

  return NextResponse.json({ ok: true })
}
