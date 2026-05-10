/**
 * 백테스트 결과 조회 — strategyId + since(ISO timestamp) 이후의 완료된 run 들.
 *
 * GET /api/investment/backtest/results?strategyId=...&tickers=AAPL,MSFT&since=2026-05-11T...&market=US
 *
 * 사용처: 사용자가 백테스트 시작 후 페이지 새로고침/탭 종료 → 다시 진입 시
 * sessionStorage 의 잡 메타로 이 endpoint 를 polling 해 결과 복원.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(req.url)
  const strategyId = searchParams.get('strategyId')
  const since = searchParams.get('since')
  const tickersParam = searchParams.get('tickers')
  const market = searchParams.get('market')
  if (!strategyId || !since) {
    return NextResponse.json({ error: 'strategyId, since 필수' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 })
  }

  let q = supabase
    .from('backtest_runs')
    .select('ticker, market, executed_at, total_return, win_rate, max_drawdown, sharpe_ratio, profit_factor, total_trades, equity_curve, trades, full_metrics, status')
    .eq('strategy_id', strategyId)
    .eq('user_id', auth.user.id)
    .eq('status', 'completed')
    .gte('executed_at', since)
    .order('executed_at', { ascending: false })

  if (market === 'KR' || market === 'US') {
    q = q.eq('market', market)
  }
  if (tickersParam) {
    const tickers = tickersParam.split(',').map(t => t.trim()).filter(Boolean)
    if (tickers.length > 0) q = q.in('ticker', tickers)
  }

  const { data, error } = await q.limit(50)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // (ticker, market) 별로 가장 최근 1건만
  const latestByTicker = new Map<string, typeof data[number]>()
  for (const row of data ?? []) {
    const key = `${row.market}:${row.ticker}`
    if (!latestByTicker.has(key)) latestByTicker.set(key, row)
  }

  return NextResponse.json({
    data: Array.from(latestByTicker.values()).map(r => ({
      ticker: r.ticker,
      market: r.market,
      executedAt: r.executed_at,
      metrics: r.full_metrics,
      trades: r.trades || [],
      equityCurve: r.equity_curve || [],
    })),
  })
}
