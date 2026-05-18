import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  // 시장 국면 분석은 매크로 정보 — owner/vice_director/manager 에게 허용
  const auth = await requireAuth(['owner', 'vice_director', 'manager'])
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }

  const url = new URL(req.url)
  const scope = url.searchParams.get('scope') ?? 'market'
  const id = url.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id 파라미터 필요' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  if (!sb) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  const { data, error } = await sb
    .from('regime_runs')
    .select('*')
    .eq('scope_type', scope)
    .eq('scope_id', id)
    .order('as_of_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ data })
}
