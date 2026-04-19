import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { calculateMonthlyProfit } from '@/lib/investmentProfit'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('clinic_id, role').eq('id', user.id).single()
  if (!me?.clinic_id || !['owner', 'master_admin'].includes(me.role)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const kst = new Date(Date.now() + 9 * 3600_000)
  const year = kst.getUTCFullYear()
  const month = kst.getUTCMonth() + 1
  const { realized, unrealized } = await calculateMonthlyProfit(me.clinic_id, year, month)

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'ADMIN_UNAVAILABLE' }, { status: 500 })

  const { error } = await admin.from('investment_profit_snapshots').upsert({
    clinic_id: me.clinic_id,
    year,
    month,
    realized_profit: realized,
    unrealized_profit: unrealized,
    snapshot_at: new Date().toISOString(),
  }, { onConflict: 'clinic_id,year,month' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, year, month, realized, unrealized })
}
