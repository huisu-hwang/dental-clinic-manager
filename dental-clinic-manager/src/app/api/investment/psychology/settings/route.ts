import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { requireInvestmentSubscription } from '@/lib/userSubscription'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const gate = await requireInvestmentSubscription(auth.user.id)
  if (gate instanceof NextResponse) return gate

  const admin = getSupabaseAdmin()!
  const { data } = await admin
    .from('psychology_settings').select('*')
    .eq('user_id', auth.user.id).maybeSingle()
  return NextResponse.json(data ?? {
    user_id: auth.user.id,
    default_price_change_pct: 2.0,
    default_volume_multiplier: 3.0,
    push_notify_enabled: true,
    cooldown_minutes: 10,
    updated_at: null,
  })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const gate = await requireInvestmentSubscription(auth.user.id)
  if (gate instanceof NextResponse) return gate

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const update: Record<string, unknown> = { user_id: auth.user.id, updated_at: new Date().toISOString() }
  if (typeof body.default_price_change_pct === 'number' && body.default_price_change_pct >= 0) update.default_price_change_pct = body.default_price_change_pct
  if (typeof body.default_volume_multiplier === 'number' && body.default_volume_multiplier >= 0) update.default_volume_multiplier = body.default_volume_multiplier
  if (typeof body.push_notify_enabled === 'boolean') update.push_notify_enabled = body.push_notify_enabled
  if (typeof body.cooldown_minutes === 'number' && body.cooldown_minutes >= 0) update.cooldown_minutes = Math.floor(body.cooldown_minutes)

  const admin = getSupabaseAdmin()!
  const { data, error } = await admin
    .from('psychology_settings')
    .upsert(update, { onConflict: 'user_id' })
    .select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
