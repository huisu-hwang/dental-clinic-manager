/**
 * 전략별 백테스트 통계 집계
 *
 * GET /api/investment/strategies/stats
 * 사용자의 모든 전략(저장 전략 + 프리셋)에 대해 backtest_runs 집계.
 *
 * 집계 키 규칙:
 *   - 사용자 전략에 source_preset_id가 있으면 → preset:<source_preset_id>로 묶음 (프리셋 통계와 합산)
 *   - 사용자 전략에 source_preset_id가 없으면 → user:<strategy_id>로 별도 집계
 *   - 프리셋만 있는 backtest run (strategy_id IS NULL) → preset:<preset_id>로 집계
 *
 * Response: {
 *   data: [{
 *     key,                  // 'user:<uuid>' or 'preset:<id>'
 *     strategyId?,          // user 키일 때
 *     presetId?,            // preset 키일 때
 *     linkedStrategyIds?,   // preset 키에 합쳐진 사용자 저장 전략 ID 목록
 *     runs, tickerCount,
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
  key: string
  strategyId?: string
  presetId?: string
  linkedStrategyIds?: string[]
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

  // 사용자의 저장 전략 → source_preset_id 매핑
  const { data: strategies } = await supabase
    .from('investment_strategies')
    .select('id, source_preset_id')
    .eq('user_id', auth.user.id)

  const strategyToPreset = new Map<string, string | null>()
  for (const s of (strategies ?? []) as Array<{ id: string; source_preset_id: string | null }>) {
    strategyToPreset.set(s.id, s.source_preset_id ?? null)
  }

  // 백테스트 결과 조회
  const { data: runs, error } = await supabase
    .from('backtest_runs')
    .select('strategy_id, preset_id, ticker, total_return, win_rate, max_drawdown, sharpe_ratio, total_trades, executed_at')
    .eq('user_id', auth.user.id)
    .eq('status', 'completed')
    .limit(5000)

  if (error) {
    console.error('[strategies/stats] 조회 실패:', error)
    return NextResponse.json({ error: '통계 조회 실패' }, { status: 500 })
  }

  type RunRow = {
    strategy_id: string | null
    preset_id: string | null
    ticker: string
    total_return: number | null
    win_rate: number | null
    max_drawdown: number | null
    sharpe_ratio: number | null
    total_trades: number | null
    executed_at: string | null
  }

  // key별 그룹핑
  const grouped = new Map<string, { rows: RunRow[]; linkedStrategies: Set<string> }>()
  const upsert = (key: string, row: RunRow, linkedStrategyId?: string) => {
    const entry = grouped.get(key) ?? { rows: [], linkedStrategies: new Set<string>() }
    entry.rows.push(row)
    if (linkedStrategyId) entry.linkedStrategies.add(linkedStrategyId)
    grouped.set(key, entry)
  }

  for (const r of (runs ?? []) as RunRow[]) {
    if (r.strategy_id) {
      // 사용자 전략 run — source_preset_id 있으면 preset 키로 묶음
      const sourcePreset = strategyToPreset.get(r.strategy_id)
      if (sourcePreset) {
        upsert(`preset:${sourcePreset}`, r, r.strategy_id)
      } else {
        upsert(`user:${r.strategy_id}`, r)
      }
    } else if (r.preset_id) {
      upsert(`preset:${r.preset_id}`, r)
    }
    // 둘 다 없는 row는 무시
  }

  const stats: StrategyStats[] = []
  for (const [key, { rows, linkedStrategies }] of grouped) {
    const returns = rows.map((g) => Number(g.total_return ?? 0))
    const winRates = rows.map((g) => Number(g.win_rate ?? 0))
    const mdds = rows.map((g) => Number(g.max_drawdown ?? 0))
    const sharpes = rows.map((g) => Number(g.sharpe_ratio ?? 0))
    const trades = rows.reduce((s, g) => s + Number(g.total_trades ?? 0), 0)
    const tickers = new Set(rows.map((g) => g.ticker))
    const lastRunAt = rows
      .map((g) => g.executed_at)
      .filter((x): x is string => Boolean(x))
      .sort()
      .pop() ?? null

    const isPreset = key.startsWith('preset:')
    const idPart = key.slice(key.indexOf(':') + 1)

    stats.push({
      key,
      strategyId: isPreset ? undefined : idPart,
      presetId: isPreset ? idPart : undefined,
      linkedStrategyIds: isPreset && linkedStrategies.size > 0 ? Array.from(linkedStrategies) : undefined,
      runs: rows.length,
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
