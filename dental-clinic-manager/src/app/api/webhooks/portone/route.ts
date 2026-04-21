// POST /api/webhooks/portone
// 포트원 v2 웹훅 수신 및 처리
// 보안: @portone/server-sdk Webhook.verify() 로 서명 검증

import { NextResponse } from 'next/server'
import { verify as portoneVerify } from '@portone/server-sdk/webhook'
import type { Webhook } from '@portone/server-sdk/webhook'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getPayment } from '@/lib/portone'
import { handlePaymentSuccess, handlePaymentFailure } from '@/lib/subscriptionService'

export async function POST(request: Request) {
  // raw body 필요 (서명 검증용)
  const rawBody = await request.text()
  const headers = Object.fromEntries(request.headers.entries())

  const webhookSecret = process.env.PORTONE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('PORTONE_WEBHOOK_SECRET 환경 변수가 설정되지 않았습니다')
    return NextResponse.json({ error: 'server configuration error' }, { status: 500 })
  }

  // 웹훅 서명 검증
  let webhook: Webhook
  try {
    webhook = await portoneVerify(webhookSecret, rawBody, headers)
  } catch (e) {
    console.error('포트원 웹훅 서명 검증 실패:', e)
    return NextResponse.json({ error: 'invalid webhook signature' }, { status: 401 })
  }

  try {
    switch (webhook.type) {
      case 'Transaction.Paid': {
        const { paymentId } = webhook.data
        await handleTransactionPaid(paymentId)
        break
      }
      case 'Transaction.Failed': {
        const { paymentId } = webhook.data
        await handleTransactionFailed(paymentId)
        break
      }
      case 'Transaction.Cancelled': {
        // WebhookTransactionCancelledCancelled.data.paymentId
        const data = webhook.data as { paymentId?: string }
        if (data.paymentId) await handleTransactionCancelled(data.paymentId)
        break
      }
      case 'BillingKey.Deleted': {
        // 빌링키가 외부에서 삭제된 경우 구독 일시 정지
        const { billingKey } = webhook.data
        await handleBillingKeyDeleted(billingKey)
        break
      }
      default:
        // 처리하지 않는 이벤트는 무시
        break
    }
  } catch (err) {
    console.error('웹훅 처리 오류:', err)
    // 500 반환 시 포트원이 재전송함 (최대 5회)
    return NextResponse.json({ error: 'internal server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// 결제 성공 처리
async function handleTransactionPaid(paymentId: string) {
  // 포트원에서 실제 결제 정보 재조회 (위변조 방지)
  const payment = await getPayment(paymentId)
  if (payment.status !== 'PAID') return

  // paymentId에서 clinicId 추출
  // paymentId 형식: payment-{clinicId}-{timestamp} 또는 payment-scheduled-{clinicId}-{timestamp}
  const clinicId = extractClinicIdFromPaymentId(paymentId)
  if (!clinicId) {
    console.error('paymentId에서 clinicId를 추출할 수 없습니다:', paymentId)
    return
  }

  await handlePaymentSuccess({
    clinicId,
    portonePaymentId: paymentId,
    portoneTransactionId: payment.transactionId ?? '',
    amount: payment.amount.total,
    orderName: paymentId,
    paidAt: payment.paidAt ?? new Date().toISOString(),
  })

  // 결제 완료 후 대기 직원 자동 승인 트리거용 알림 생성 (Task 11)
  await notifyPaymentSucceededOwners(clinicId)
}

// 결제 실패 처리
async function handleTransactionFailed(paymentId: string) {
  const payment = await getPayment(paymentId)

  const clinicId = extractClinicIdFromPaymentId(paymentId)
  if (!clinicId) return

  await handlePaymentFailure({
    clinicId,
    portonePaymentId: paymentId,
    failReason: payment.failReason,
  })
}

// 결제 취소 처리
async function handleTransactionCancelled(paymentId: string) {
  const supabase = await createClient()
  await supabase
    .from('subscription_payments')
    .update({ status: 'cancelled' })
    .eq('portone_payment_id', paymentId)
}

// 빌링키 삭제 처리
async function handleBillingKeyDeleted(billingKey: string) {
  const supabase = await createClient()
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('billing_key', billingKey)
    .single()

  if (sub) {
    await supabase
      .from('subscriptions')
      .update({ status: 'suspended', billing_key: null, updated_at: new Date().toISOString() })
      .eq('id', sub.id)
  }
}

// paymentId에서 clinicId 추출 헬퍼
// 형식: payment-{clinicId}-{timestamp}
//       payment-scheduled-{clinicId}-{timestamp}
//       payment-upgrade-{clinicId}-{timestamp}
//       payment-retry-{clinicId}-{retryNum}-{timestamp}
function extractClinicIdFromPaymentId(paymentId: string): string | null {
  // UUID 패턴 추출 (8-4-4-4-12)
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
  const match = paymentId.match(uuidPattern)
  return match ? match[0] : null
}

// 결제 성공 후 owner/master_admin에게 알림 전송 (Task 11)
async function notifyPaymentSucceededOwners(clinicId: string): Promise<void> {
  const admin = getSupabaseAdmin()
  if (!admin) {
    console.error('[portone webhook] admin client unavailable — skipping payment success notification')
    return
  }

  // 현재 구독 + 플랜 정보 조회
  const { data: sub, error: subErr } = await admin
    .from('subscriptions')
    .select('plan_id')
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (subErr) console.error('[portone webhook] subscription lookup failed:', subErr.message)
  if (!sub?.plan_id) return

  const { data: plan, error: planErr } = await admin
    .from('subscription_plans')
    .select('name, max_users')
    .eq('id', sub.plan_id)
    .maybeSingle()

  if (planErr) console.error('[portone webhook] subscription_plans lookup failed:', planErr.message)
  if (!plan) return

  // 대기 인원 확인
  const { count: pendingCount, error: pendingErr } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .eq('status', 'pending')

  if (pendingErr) console.error('[portone webhook] pending user count failed:', pendingErr.message)
  if (!pendingCount || pendingCount === 0) return

  // Fix C: 10분 내 미읽음 중복 알림이 있으면 skip
  const recentCutoff = new Date(Date.now() - 10 * 60_000).toISOString()
  const { data: recent } = await admin
    .from('user_notifications')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('type', 'subscription_payment_succeeded')
    .eq('is_read', false)
    .gte('created_at', recentCutoff)
    .limit(1)
  if (recent && recent.length > 0) {
    console.log('[portone webhook] recent unread notification exists, skip dedup')
    return
  }

  // 원장 + master_admin 알림 대상
  const { data: owners, error: ownersErr } = await admin
    .from('users')
    .select('id')
    .eq('clinic_id', clinicId)
    .in('role', ['owner', 'master_admin'])
    .eq('status', 'active')

  if (ownersErr) console.error('[portone webhook] owners lookup failed:', ownersErr.message)
  if (!owners || owners.length === 0) return

  const payload = {
    pendingCount,
    newLimit: plan.max_users ?? 0,
    newPlanName: plan.name,
  }

  const rows = owners.map((o: { id: string }) => ({
    clinic_id: clinicId,
    user_id: o.id,
    type: 'subscription_payment_succeeded' as const,
    title: '결제 완료 · 대기 직원 승인',
    content: `대기 중인 직원 ${pendingCount}명을 검토해 주세요.`,
    link: '/dashboard?payment_success=1',
    reference_type: 'subscription',
    reference_id: clinicId,
    metadata: payload,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from('user_notifications').insert(rows)
  if (error) {
    console.error('[portone webhook] notification insert failed:', error.message)
  }
}
