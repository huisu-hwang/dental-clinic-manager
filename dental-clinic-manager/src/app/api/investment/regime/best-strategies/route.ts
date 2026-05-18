import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface Row {
  entry_id: string
  sample_size: number
  avg_return: number | null
  avg_sharpe: number | null
  avg_mdd: number | null
  avg_winrate: number | null
}

export async function GET(req: Request) {
  const auth = await requireAuth(['owner', 'vice_director', 'manager'])
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }

  const url = new URL(req.url)
  const market = url.searchParams.get('market') ?? 'US'
  const state = url.searchParams.get('state') ?? 'sideways'
  const periodWindow = url.searchParams.get('window') ?? '3Y'
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '15', 10) || 15, 1), 50)
  const minSamples = Math.max(parseInt(url.searchParams.get('min_samples') ?? '5', 10) || 5, 1)

  if (!['KR', 'US'].includes(market)) {
    return NextResponse.json({ error: 'market 은 KR/US 만 허용' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  if (!sb) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  // 머티리얼라이즈드 뷰 활용 — 인덱스 (market, period_window, state, avg_return DESC)
  const { data, error } = await sb
    .from('regime_strategy_stats')
    .select('entry_id, sample_size, avg_return, avg_sharpe, avg_mdd, avg_winrate')
    .eq('market', market)
    .eq('state', state)
    .eq('period_window', periodWindow)
    .gte('sample_size', minSamples)
    .order('avg_return', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Row[]
  const totalSamples = rows.reduce((acc, r) => acc + (r.sample_size ?? 0), 0)

  return NextResponse.json({
    data: rows,
    total_samples: totalSamples,
    market,
    state,
    window: periodWindow,
  })
}
