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

  const portonePayment = await getPayment(portonePaymentId).catch(() => null)
  if (!portonePayment) return NextResponse.json({ ok: true, ignored: 'no portone payment' })

  // user_subscriptions 중 paymentId 접두사가 일치하는 사용자 추적
  // PortOne paymentId 포맷: payment-scheduled-<userId>-<timestamp> (registerUserSubscription에서 그대로 사용)
  const m = portonePaymentId.match(/^payment-(?:scheduled-)?([0-9a-f-]{36})-\d+$/i)
  const userId = m?.[1] ?? null
  if (!userId) return NextResponse.json({ ok: true, ignored: 'cannot extract userId' })

  const { data: subData } = await admin
    .from('user_subscriptions')
    .select('id, plan_id, billing_key, retry_count, current_period_end')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sub = subData as
    | { id: string; plan_id: string; billing_key: string | null; retry_count: number; current_period_end: string | null }
    | null
  if (!sub) return NextResponse.json({ ok: true, ignored: 'no user subscription' })

  const now = new Date()

  if (portonePayment.status === 'PAID') {
    // 결제 성공 → 다음 주기로 갱신
    const nextEnd = getNextBillingDate(now)
    await admin.from('user_subscriptions').update({
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: nextEnd.toISOString(),
      next_billing_date: nextEnd.toISOString(),
      retry_count: 0,
      next_retry_at: null,
      updated_at: now.toISOString(),
    }).eq('id', sub.id)

    await admin.from('user_subscription_payments').insert({
      user_id: userId,
      subscription_id: sub.id,
      portone_payment_id: portonePaymentId,
      portone_tx_id: portonePayment.transactionId ?? null,
      amount: portonePayment.amount.total,
      base_amount: portonePayment.amount.total,
      revenue_share_amount: 0,
      realized_profit_basis: 0,
      status: 'paid',
      paid_at: portonePayment.paidAt ?? now.toISOString(),
      order_name: '주식 자동매매 정기결제',
      billing_period_start: now.toISOString().slice(0, 10),
      billing_period_end: nextEnd.toISOString().slice(0, 10),
    })
    return NextResponse.json({ ok: true })
  }

  if (portonePayment.status === 'FAILED') {
    const retryCount = (sub.retry_count ?? 0) + 1
    const newStatus = retryCount >= MAX_RETRY ? 'suspended' : 'past_due'
    const nextRetry = retryCount < MAX_RETRY ? new Date(now.getTime() + 12 * 3600_000) : null

    await admin.from('user_subscriptions').update({
      status: newStatus,
      retry_count: retryCount,
      next_retry_at: nextRetry?.toISOString() ?? null,
      updated_at: now.toISOString(),
    }).eq('id', sub.id)

    await admin.from('user_subscription_payments').insert({
      user_id: userId,
      subscription_id: sub.id,
      portone_payment_id: portonePaymentId,
      portone_tx_id: portonePayment.transactionId ?? null,
      amount: portonePayment.amount.total,
      base_amount: portonePayment.amount.total,
      revenue_share_amount: 0,
      realized_profit_basis: 0,
      status: 'failed',
      failed_at: portonePayment.failedAt ?? now.toISOString(),
      fail_reason: portonePayment.failReason ?? '결제 실패',
      order_name: '주식 자동매매 정기결제',
    })
  }

  return NextResponse.json({ ok: true })
}
