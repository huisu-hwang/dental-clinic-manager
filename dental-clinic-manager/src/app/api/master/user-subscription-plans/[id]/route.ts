import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(['master_admin'])
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const { id } = await ctx.params

  const body = await req.json().catch(() => null) as {
    monthly_base_price?: number
    revenue_share_pct?: number
    is_active?: boolean
    description?: string
  } | null
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.monthly_base_price === 'number' && body.monthly_base_price >= 0) {
    update.monthly_base_price = Math.floor(body.monthly_base_price)
  }
  if (typeof body.revenue_share_pct === 'number' && body.revenue_share_pct >= 0 && body.revenue_share_pct <= 50) {
    update.revenue_share_pct = body.revenue_share_pct
  }
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active
  if (typeof body.description === 'string') update.description = body.description

  const admin = getSupabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { data, error } = await admin
    .from('user_subscription_plans')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
