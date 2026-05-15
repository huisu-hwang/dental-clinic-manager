/**
 * Strategy Matrix 집계 API (Leaderboard)
 *
 * GET /api/investment/matrix/aggregate
 *   ?period_window=5Y                (default 5Y)
 *   &market=KR|US|ALL                (default ALL)
 *   &group_by=market|none            (default market — 시장별 분할비교 뷰)
 *   &entry_type=preset|shared        (optional)
 *
 * strategy_matrix_market_stats 머티리얼라이즈드 뷰 조회로 ~20ms 응답.
 *
 * 응답: { data: Array<{ entry_type, entry_id, market, period_window, sample_size, avg_return, ... }> }
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const ALLOWED_WINDOWS = new Set(['1Y', '3Y', '5Y', '10Y'])

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const url = new URL(req.url)
  const periodWindow = url.searchParams.get('period_window') ?? '5Y'
  const market = (url.searchParams.get('market') ?? 'ALL').toUpperCase()
  const groupBy = url.searchParams.get('group_by') ?? 'market'
  const entryType = url.searchParams.get('entry_type')

  if (!ALLOWED_WINDOWS.has(periodWindow)) {
    return NextResponse.json({ error: `period_window must be one of ${[...ALLOWED_WINDOWS].join(', ')}` }, { status: 400 })
  }

  let q = supabase
    .from('strategy_matrix_market_stats')
    .select('*')
    .eq('period_window', periodWindow)
    .order('avg_return', { ascending: false })

  if (market !== 'ALL') q = q.eq('market', market)
  if (entryType) q = q.eq('entry_type', entryType)

  const { data, error } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // group_by=none 이면 시장 통합 평균 재집계
  if (groupBy === 'none' && data) {
    const map = new Map<string, ReturnType<typeof emptyAgg>>()
    for (const row of data as MatrixStatsRow[]) {
      const key = `${row.entry_type}|${row.entry_id}|${row.period_window}`
      const acc = map.get(key) ?? emptyAgg(row)
      mergeAgg(acc, row)
      map.set(key, acc)
    }
    const merged = Array.from(map.values())
      .map(finalizeAgg)
      .sort((a, b) => (b.avg_return ?? 0) - (a.avg_return ?? 0))
    return NextResponse.json({ data: merged })
  }

  return NextResponse.json({ data: data ?? [] })
}

interface MatrixStatsRow {
  entry_type: string
  entry_id: string
  market: string
  period_window: string
  sample_size: number
  avg_return: number | null
  std_return: number | null
  avg_annualized: number | null
  avg_sharpe: number | null
  avg_mdd: number | null
  avg_winrate: number | null
  avg_profit_factor: number | null
  best_return: number | null
  worst_return: number | null
  median_return: number | null
  positive_count: number
  last_computed_window_end: string | null
}

function emptyAgg(row: MatrixStatsRow) {
  return {
    entry_type: row.entry_type,
    entry_id: row.entry_id,
    market: 'ALL',
    period_window: row.period_window,
    sample_size: 0,
    sum_return: 0,
    sum_sharpe: 0,
    sum_mdd: 0,
    sum_winrate: 0,
    best_return: -Infinity,
    worst_return: Infinity,
    positive_count: 0,
  }
}

function mergeAgg(acc: ReturnType<typeof emptyAgg>, row: MatrixStatsRow) {
  const n = row.sample_size ?? 0
  acc.sample_size += n
  acc.sum_return += (row.avg_return ?? 0) * n
  acc.sum_sharpe += (row.avg_sharpe ?? 0) * n
  acc.sum_mdd += (row.avg_mdd ?? 0) * n
  acc.sum_winrate += (row.avg_winrate ?? 0) * n
  acc.best_return = Math.max(acc.best_return, row.best_return ?? -Infinity)
  acc.worst_return = Math.min(acc.worst_return, row.worst_return ?? Infinity)
  acc.positive_count += row.positive_count ?? 0
}

function finalizeAgg(acc: ReturnType<typeof emptyAgg>) {
  const n = acc.sample_size || 1
  return {
    entry_type: acc.entry_type,
    entry_id: acc.entry_id,
    market: 'ALL',
    period_window: acc.period_window,
    sample_size: acc.sample_size,
    avg_return: acc.sum_return / n,
    avg_sharpe: acc.sum_sharpe / n,
    avg_mdd: acc.sum_mdd / n,
    avg_winrate: acc.sum_winrate / n,
    best_return: acc.best_return === -Infinity ? null : acc.best_return,
    worst_return: acc.worst_return === Infinity ? null : acc.worst_return,
    positive_count: acc.positive_count,
  }
}
