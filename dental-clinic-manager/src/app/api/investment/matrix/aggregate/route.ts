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
  const tickersParam = url.searchParams.get('tickers')
  const entryIdsParam = url.searchParams.get('entry_ids')
  const tickers = tickersParam ? tickersParam.split(',').map(s => s.trim()).filter(Boolean) : []
  const entryIds = entryIdsParam ? entryIdsParam.split(',').map(s => s.trim()).filter(Boolean) : []

  if (!ALLOWED_WINDOWS.has(periodWindow)) {
    return NextResponse.json({ error: `period_window must be one of ${[...ALLOWED_WINDOWS].join(', ')}` }, { status: 400 })
  }

  // tickers 필터가 있으면 머티리얼라이즈드 뷰는 사용 불가 (뷰는 ticker 단위로 group by 하지 않음).
  // raw strategy_matrix_runs 에서 동적 집계.
  if (tickers.length > 0) {
    let rq = supabase
      .from('strategy_matrix_runs')
      .select('entry_type, entry_id, market, total_return, annualized_return, max_drawdown, sharpe_ratio, win_rate, profit_factor')
      .eq('period_window', periodWindow)
      .in('ticker', tickers)
      .limit(50000)
    if (market !== 'ALL') rq = rq.eq('market', market)
    if (entryType) rq = rq.eq('entry_type', entryType)
    if (entryIds.length > 0) rq = rq.in('entry_id', entryIds)

    const { data: raw, error: rawErr } = await rq
    if (rawErr) {
      return NextResponse.json({ error: rawErr.message }, { status: 500 })
    }
    const aggregated = aggregateRaw(raw ?? [], periodWindow, groupBy)
    return NextResponse.json({ data: aggregated })
  }

  let q = supabase
    .from('strategy_matrix_market_stats')
    .select('*')
    .eq('period_window', periodWindow)
    .order('avg_return', { ascending: false })

  if (market !== 'ALL') q = q.eq('market', market)
  if (entryType) q = q.eq('entry_type', entryType)
  if (entryIds.length > 0) q = q.in('entry_id', entryIds)

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

interface MatrixRawRow {
  entry_type: string
  entry_id: string
  market: 'KR' | 'US'
  total_return: number | null
  annualized_return: number | null
  max_drawdown: number | null
  sharpe_ratio: number | null
  win_rate: number | null
  profit_factor: number | null
}

interface RawAcc {
  entry_type: string
  entry_id: string
  market: string
  period_window: string
  n_return: number
  sum_return: number
  n_annualized: number
  sum_annualized: number
  n_sharpe: number
  sum_sharpe: number
  n_mdd: number
  sum_mdd: number
  n_winrate: number
  sum_winrate: number
  n_pf: number
  sum_pf: number
  best_return: number
  worst_return: number
  positive_count: number
  sample_size: number
}

/** tickers 필터 적용 시 raw runs 테이블을 entry × market 단위로 그룹·집계.
 *  groupBy='none' 이면 시장 통합(=market 'ALL') 한 행만 반환. */
function aggregateRaw(rows: MatrixRawRow[], periodWindow: string, groupBy: string) {
  const splitByMarket = groupBy !== 'none'
  const map = new Map<string, RawAcc>()
  for (const r of rows) {
    const key = splitByMarket
      ? `${r.entry_type}|${r.entry_id}|${r.market}`
      : `${r.entry_type}|${r.entry_id}|ALL`
    let acc = map.get(key)
    if (!acc) {
      acc = {
        entry_type: r.entry_type,
        entry_id: r.entry_id,
        market: splitByMarket ? r.market : 'ALL',
        period_window: periodWindow,
        n_return: 0, sum_return: 0,
        n_annualized: 0, sum_annualized: 0,
        n_sharpe: 0, sum_sharpe: 0,
        n_mdd: 0, sum_mdd: 0,
        n_winrate: 0, sum_winrate: 0,
        n_pf: 0, sum_pf: 0,
        best_return: -Infinity,
        worst_return: Infinity,
        positive_count: 0,
        sample_size: 0,
      }
      map.set(key, acc)
    }
    acc.sample_size += 1
    if (r.total_return != null) {
      acc.n_return++
      acc.sum_return += r.total_return
      if (r.total_return > acc.best_return) acc.best_return = r.total_return
      if (r.total_return < acc.worst_return) acc.worst_return = r.total_return
      if (r.total_return > 0) acc.positive_count++
    }
    if (r.annualized_return != null) { acc.n_annualized++; acc.sum_annualized += r.annualized_return }
    if (r.sharpe_ratio != null) { acc.n_sharpe++; acc.sum_sharpe += r.sharpe_ratio }
    if (r.max_drawdown != null) { acc.n_mdd++; acc.sum_mdd += r.max_drawdown }
    if (r.win_rate != null) { acc.n_winrate++; acc.sum_winrate += r.win_rate }
    if (r.profit_factor != null && isFinite(r.profit_factor)) { acc.n_pf++; acc.sum_pf += r.profit_factor }
  }
  return Array.from(map.values()).map(a => ({
    entry_type: a.entry_type,
    entry_id: a.entry_id,
    market: a.market,
    period_window: a.period_window,
    sample_size: a.sample_size,
    avg_return: a.n_return > 0 ? a.sum_return / a.n_return : null,
    avg_annualized: a.n_annualized > 0 ? a.sum_annualized / a.n_annualized : null,
    avg_sharpe: a.n_sharpe > 0 ? a.sum_sharpe / a.n_sharpe : null,
    avg_mdd: a.n_mdd > 0 ? a.sum_mdd / a.n_mdd : null,
    avg_winrate: a.n_winrate > 0 ? a.sum_winrate / a.n_winrate : null,
    avg_profit_factor: a.n_pf > 0 ? a.sum_pf / a.n_pf : null,
    best_return: a.best_return === -Infinity ? null : a.best_return,
    worst_return: a.worst_return === Infinity ? null : a.worst_return,
    positive_count: a.positive_count,
  })).sort((x, y) => (y.avg_return ?? -Infinity) - (x.avg_return ?? -Infinity))
}
