import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface RunRow {
  scope_id: string
  current_state: string
  current_confidence: number
  state_probabilities: Record<string, number> | null
  transition_probabilities: Record<string, Record<string, number>> | null
  data_as_of: string
  as_of_date: string
}

export async function GET(req: Request) {
  const auth = await requireAuth(['owner', 'vice_director', 'manager'])
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }

  const url = new URL(req.url)
  const region = url.searchParams.get('region')  // 'KR' | 'US' | null(all)

  const sb = getSupabaseAdmin()
  if (!sb) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  // 각 sector scope_id 별 최신 run 만 조회 (DISTINCT ON 대용으로 클라이언트 그룹화)
  const { data, error } = await sb
    .from('regime_runs')
    .select('scope_id, current_state, current_confidence, state_probabilities, transition_probabilities, data_as_of, as_of_date')
    .eq('scope_type', 'sector')
    .order('as_of_date', { ascending: false })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const latestByScope = new Map<string, RunRow>()
  for (const r of (data ?? []) as RunRow[]) {
    if (!latestByScope.has(r.scope_id)) {
      // region 필터 (scope_id prefix 로 KR/US 판별)
      if (region && !r.scope_id.startsWith(`${region}_`)) continue
      latestByScope.set(r.scope_id, r)
    }
  }

  return NextResponse.json({ data: Array.from(latestByScope.values()) })
}
