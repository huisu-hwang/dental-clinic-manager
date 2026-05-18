import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const auth = await requireAuth(['owner', 'vice_director', 'manager'])
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }

  const url = new URL(req.url)
  const scope = url.searchParams.get('scope') ?? 'market'
  const id = url.searchParams.get('id')
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') ?? '180', 10) || 180, 30), 730)
  if (!id) {
    return NextResponse.json({ error: 'id 파라미터 필요' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  if (!sb) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().slice(0, 10)

  const { data, error } = await sb
    .from('regime_history')
    .select('date, state, confidence')
    .eq('scope_type', scope)
    .eq('scope_id', id)
    .gte('date', sinceStr)
    .order('date', { ascending: true })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data: data ?? [] })
}
