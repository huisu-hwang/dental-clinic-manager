// POST /api/webhooks/toss
// 토스 결제 상태 웹훅 처리
// 보안: 페이로드를 신뢰하지 않고 토스 API로 재조회 + secret 검증

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { verifyAndFetchPayment } from '@/lib/tossPayments/webhook'
import type { TossWebhookPayload } from '@/lib/tossPayments/types'

export async function POST(request: Request) {
  const payload = (await request.json()) as TossWebhookPayload
  const { eventType, data } = payload

  // admin 클라이언트로 RLS 우회 (웹훅은 인증된 사용자가 아님)
  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'admin client unavailable' }, { status: 500 })
  }

  // 1. 멱등 INSERT (UNIQUE (event_type, payment_key, status) 충돌 = 중복)
  const { error: insertErr } = await supabase
    .from('billing_webhook_events')
    .insert({
      event_type: eventType,
      payment_key: data?.paymentKey ?? null,
      order_id: data?.orderId ?? null,
      status: data?.status ?? null,
      payload: payload as unknown as Record<string, unknown>,
    })

  if (insertErr) {
    // UNIQUE 충돌 = 이미 처리된 이벤트
    if (insertErr.code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true })
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  if (!data?.paymentKey) {
    // paymentKey 없는 이벤트는 처리 후 종료
    await supabase
      .from('billing_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_type', eventType)
      .is('payment_key', null)
      .eq('status', data?.status ?? null)
    return NextResponse.json({ ok: true })
  }

  // 2. DB에서 expectedSecret 조회
  const { data: paymentRow } = await supabase
    .from('subscription_payments')
    .select('id, toss_secret, status')
    .eq('toss_payment_key', data.paymentKey)
    .maybeSingle()

  // 3. 토스에서 직접 조회 + secret 검증
  let payment
  try {
    payment = await verifyAndFetchPayment({
      paymentKey: data.paymentKey,
      expectedSecret: paymentRow?.toss_secret ?? null,
    })
  } catch (err) {
    await supabase
      .from('billing_webhook_events')
      .update({
        processed_at: new Date().toISOString(),
        process_error: String(err instanceof Error ? err.message : err),
      })
      .eq('event_type', eventType)
      .eq('payment_key', data.paymentKey)
      .eq('status', data.status)
    return NextResponse.json({ error: '검증 실패' }, { status: 401 })
  }

  // 4. 상태 동기화
  if (paymentRow) {
    let nextStatus: string | null = null
    if (payment.status === 'CANCELED' || payment.status === 'PARTIAL_CANCELED') {
      nextStatus = 'cancelled'
    }
    if (payment.status === 'ABORTED' || payment.status === 'EXPIRED') {
      nextStatus = 'failed'
    }

    if (nextStatus && nextStatus !== paymentRow.status) {
      await supabase
        .from('subscription_payments')
        .update({ status: nextStatus })
        .eq('id', paymentRow.id)
    }
  }

  // 5. processed_at 갱신
  await supabase
    .from('billing_webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('event_type', eventType)
    .eq('payment_key', data.paymentKey)
    .eq('status', data.status)

  return NextResponse.json({ ok: true })
}
