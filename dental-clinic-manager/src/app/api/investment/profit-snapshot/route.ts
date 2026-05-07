import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { calculateMonthlyProfitForUser } from '@/lib/investmentProfit'
import { chargeBillingKey, getNextBillingDate } from '@/lib/portone'

function isLastDayOfMonthKST(d: Date): boolean {
  const kst = new Date(d.getTime() + 9 * 3600_000)
  const next = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1))
  return next.getUTCDate() === 1
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET ?? ''}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const now = new Date()
  if (!isLastDayOfMonthKST(now)) return NextResponse.json({ skipped: true })

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'ADMIN_UNAVAILABLE' }, { status: 500 })

  const { data: subs } = await admin
    .from('user_subscriptions')
    .select(`
      id, user_id, billing_key, plan:user_subscription_plans!inner(id, feature_id, monthly_base_price, revenue_share_pct, display_name, is_active)
    `)
    .eq('status', 'active')
    .eq('plan.feature_id', 'investment')
    .eq('plan.is_active', true)
    .not('billing_key', 'is', null)

  if (!subs?.length) return NextResponse.json({ snapshotted: 0 })

  const kst = new Date(now.getTime() + 9 * 3600_000)
  const year = kst.getUTCFullYear()
  const month = kst.getUTCMonth() + 1
  let charged = 0
  let failedCount = 0

  for (const row of subs as unknown as Array<{
    id: string
    user_id: string
    billing_key: string
    plan: { id: string; monthly_base_price: number; revenue_share_pct: number; display_name: string }
  }>) {
    const periodStart = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10)
    const periodEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)

    // CRITICAL: 동일 (subscription_id, billing_period_start)에 이미 paid 행이 있으면 skip — 중복 청구 방지
    const { data: existingPayment } = await admin
      .from('user_subscription_payments')
      .select('id, status')
      .eq('subscription_id', row.id)
      .eq('billing_period_start', periodStart)
      .in('status', ['paid', 'pending'])
      .maybeSingle()
    if (existingPayment) {
      // 이미 처리됨 — skip
      continue
    }

    const { realized } = await calculateMonthlyProfitForUser(row.user_id, year, month)
    const base = row.plan.monthly_base_price
    const share = Math.max(0, Math.floor(realized * (row.plan.revenue_share_pct / 100)))
    const total = base + share
    if (total <= 0) continue

    const { data: u } = await admin.from('users').select('name, email').eq('id', row.user_id).single()
    const name = (u as { name?: string } | null)?.name ?? ''
    const email = (u as { email?: string } | null)?.email ?? ''

    try {
      const result = await chargeBillingKey({
        clinicId: row.user_id,
        billingKey: row.billing_key,
        amount: total,
        orderName: `${row.plan.display_name} ${year}-${String(month).padStart(2, '0')}`,
        customerName: name,
        customerEmail: email,
        noticeUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/investment/subscription/webhook`,
      })

      const paid = result.status === 'PAID'
      const failed = result.status === 'FAILED'
      // 그 외 상태 (READY, VIRTUAL_ACCOUNT_ISSUED 등): webhook으로 reconcile, 여기선 mid-flight 상태 기록만
      const isMidFlight = !paid && !failed

      const { error: payErr } = await admin.from('user_subscription_payments').insert({
        user_id: row.user_id,
        subscription_id: row.id,
        portone_payment_id: result.paymentId,
        portone_tx_id: result.txId ?? null,
        amount: total,
        base_amount: base,
        revenue_share_amount: share,
        realized_profit_basis: Math.max(0, Math.floor(realized)),
        status: paid ? 'paid' : (failed ? 'failed' : 'pending'),
        paid_at: paid ? (result.paidAt ?? now.toISOString()) : null,
        failed_at: failed ? now.toISOString() : null,
        fail_reason: failed ? (result.failReason ?? '결제 실패') : null,
        order_name: `${row.plan.display_name} ${year}-${String(month).padStart(2, '0')}`,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
      })
      if (payErr) {
        console.error('[profit-snapshot] payment insert failed:', { userId: row.user_id, error: payErr.message })
      }

      if (paid && !payErr) {
        // 결제 성공 + DB 기록 성공 시에만 다음 주기 갱신
        const nextEnd = getNextBillingDate(now)
        await admin
          .from('user_subscriptions')
          .update({
            current_period_start: now.toISOString(),
            current_period_end: nextEnd.toISOString(),
            next_billing_date: nextEnd.toISOString(),
            retry_count: 0,
            next_retry_at: null,
            updated_at: now.toISOString(),
          })
          .eq('id', row.id)
        charged++
      } else if (failed) {
        await admin
          .from('user_subscriptions')
          .update({
            status: 'past_due',
            retry_count: 1,
            next_retry_at: new Date(now.getTime() + 12 * 3600_000).toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('id', row.id)
        failedCount++
      } else if (isMidFlight) {
        console.warn('[profit-snapshot] payment in transient state:', { userId: row.user_id, status: result.status })
      } else if (paid && payErr) {
        // CRITICAL: 결제는 성공했지만 DB 기록 실패. 운영 알림 필요.
        console.error('[profit-snapshot] CRITICAL: charged without record:', { userId: row.user_id, paymentId: result.paymentId })
      }
    } catch (e) {
      console.error('[profit-snapshot] charge failed:', row.user_id, e)
      failedCount++
    }
  }

  return NextResponse.json({ charged, failed: failedCount, total: subs.length })
}
