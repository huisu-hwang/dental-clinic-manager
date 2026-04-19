import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { calculateMonthlyProfit } from '@/lib/investmentProfit'

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

  const { data: subs, error: subsErr } = await admin
    .from('subscriptions')
    .select('clinic_id, plan_id, subscription_plans!inner(feature_id)')
    .eq('status', 'active')
    .eq('subscription_plans.feature_id', 'investment')

  if (subsErr) {
    console.error('[profit-snapshot cron] subs query failed:', subsErr.message)
    return NextResponse.json({ error: subsErr.message }, { status: 500 })
  }

  const kst = new Date(now.getTime() + 9 * 3600_000)
  const year = kst.getUTCFullYear()
  const month = kst.getUTCMonth() + 1

  let count = 0
  for (const s of (subs ?? []) as Array<{ clinic_id: string }>) {
    const { realized, unrealized } = await calculateMonthlyProfit(s.clinic_id, year, month)
    const { error: upErr } = await admin.from('investment_profit_snapshots').upsert({
      clinic_id: s.clinic_id,
      year,
      month,
      realized_profit: realized,
      unrealized_profit: unrealized,
      snapshot_at: new Date().toISOString(),
    }, { onConflict: 'clinic_id,year,month' })
    if (upErr) {
      console.error('[profit-snapshot cron] upsert failed for clinic', s.clinic_id, upErr.message)
      continue
    }
    count++
  }
  return NextResponse.json({ snapshotted: count })
}
