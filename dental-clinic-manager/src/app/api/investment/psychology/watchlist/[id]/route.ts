import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { requireInvestmentSubscription } from '@/lib/userSubscription'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  await requireInvestmentSubscription(auth.user.id)

  const { id } = await ctx.params
  const body = await req.json().catch(() => null) as {
    monitoring_enabled?: boolean
    trigger_price_change_pct?: number | null
    trigger_volume_multiplier?: number | null
  } | null
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.monitoring_enabled === 'boolean') update.monitoring_enabled = body.monitoring_enabled
  if (body.trigger_price_change_pct !== undefined) update.trigger_price_change_pct = body.trigger_price_change_pct
  if (body.trigger_volume_multiplier !== undefined) update.trigger_volume_multiplier = body.trigger_volume_multiplier

  const admin = getSupabaseAdmin()!
  const { data, error } = await admin
    .from('psychology_watchlist')
    .update(update)
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
