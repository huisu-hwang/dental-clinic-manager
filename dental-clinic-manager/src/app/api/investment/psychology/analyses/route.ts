import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { requireInvestmentSubscription } from '@/lib/userSubscription'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  await requireInvestmentSubscription(auth.user.id)

  const url = new URL(req.url)
  const ticker = url.searchParams.get('ticker')
  const market = url.searchParams.get('market')
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 10)))

  const admin = getSupabaseAdmin()!
  let query = admin
    .from('psychology_analyses')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (ticker) query = query.eq('ticker', ticker.toUpperCase())
  if (market) query = query.eq('market', market)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data ?? [])
}
