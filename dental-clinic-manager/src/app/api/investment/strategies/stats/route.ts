/**
 * 전략별 백테스트 통계 집계
 *
 * GET /api/investment/strategies/stats
 * 사용자의 모든 전략에 대해 backtest_runs 집계 — 전략 카드에 통계 표시용.
 *
 * Response: {
 *   data: [{
 *     strategyId, runs, tickerCount,
 *     avgReturn, bestReturn, worstReturn,
 *     avgWinRate, avgMDD, avgSharpe,
 *     totalTrades, lastRunAt
 *   }]
 * }
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface StrategyStats {
  strategyId: string
  runs: number
  tickerCount: number
  avgReturn: number
  bestReturn: number
  worstReturn: number
  avgWinRate: number
  avgMDD: number
  avgSharpe: number
  totalTrades: number
  lastRunAt: string | null
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  // 모든 사용자 backtest run의 핵심 지표만 조회 — 클라이언트보다 더 큰 limit 허용
  const { data: runs, error } = await supabase
    .from('backtest_runs')
    .select('strategy_id, ticker, total_return, win_rate, max_drawdown, sharpe_ratio, total_trades, executed_at')
    .eq('user_id', auth.user.id)
    .eq('status', 'completed')
    .limit(2000)

  if (error) {
    console.error('[strategies/stats] 조회 실패:', error)
    return NextResponse.json({ error: '통계 조회 실패' }, { status: 500 })
  }

  // strategy_id별 집계
  type RunRow = {
    strategy_id: string
    ticker: string
    total_return: number | null
    win_rate: number | null
    max_drawdown: number | null
    sharpe_ratio: number | null
    total_trades: number | null
    executed_at: string | null
  }

  const grouped = new Map<string, RunRow[]>()
  for (const r of (runs ?? []) as RunRow[]) {
    if (!r.strategy_id) continue
    const arr = grouped.get(r.strategy_id) ?? []
    arr.push(r)
    grouped.set(r.strategy_id, arr)
  }

  const stats: StrategyStats[] = []
  for (const [sid, group] of grouped) {
    const returns = group.map((g) => Number(g.total_return ?? 0))
    const winRates = group.map((g) => Number(g.win_rate ?? 0))
    const mdds = group.map((g) => Number(g.max_drawdown ?? 0))
    const sharpes = group.map((g) => Number(g.sharpe_ratio ?? 0))
    const trades = group.reduce((s, g) => s + Number(g.total_trades ?? 0), 0)
    const tickers = new Set(group.map((g) => g.ticker))
    const lastRunAt = group
      .map((g) => g.executed_at)
      .filter((x): x is string => Boolean(x))
      .sort()
      .pop() ?? null

    stats.push({
      strategyId: sid,
      runs: group.length,
      tickerCount: tickers.size,
      avgReturn: returns.reduce((s, v) => s + v, 0) / Math.max(returns.length, 1),
      bestReturn: returns.length > 0 ? Math.max(...returns) : 0,
      worstReturn: returns.length > 0 ? Math.min(...returns) : 0,
      avgWinRate: winRates.reduce((s, v) => s + v, 0) / Math.max(winRates.length, 1),
      avgMDD: mdds.reduce((s, v) => s + v, 0) / Math.max(mdds.length, 1),
      avgSharpe: sharpes.reduce((s, v) => s + v, 0) / Math.max(sharpes.length, 1),
      totalTrades: trades,
      lastRunAt,
    })
  }

  return NextResponse.json({ data: stats })
}
