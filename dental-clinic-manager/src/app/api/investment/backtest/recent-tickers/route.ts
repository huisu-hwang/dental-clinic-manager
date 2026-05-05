/**
 * 최근 백테스트 종목 조회
 *
 * GET /api/investment/backtest/recent-tickers?limit=12
 * 사용자가 직전에 백테스트했던 종목 distinct 목록을 최신순으로 반환.
 * BacktestPanel "이전 백테스트 종목" 섹션의 빠른 추가용.
 *
 * Response: { data: [{ ticker, market, tickerName, lastRunAt }] }
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface RecentTicker {
  ticker: string
  market: 'KR' | 'US'
  tickerName: string
  lastRunAt: string
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const url = new URL(request.url)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '12', 10) || 12, 1), 50)

  // 1) 최근 백테스트에서 ticker+market 추출 (충분히 받아서 distinct 처리)
  const { data: runs, error } = await supabase
    .from('backtest_runs')
    .select('ticker, market, created_at, completed_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[recent-tickers] backtest_runs 조회 실패:', error)
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }

  // distinct (ticker, market) — 가장 최근 실행만 유지
  const distinct = new Map<string, RecentTicker>()
  for (const r of runs ?? []) {
    const ticker = (r as { ticker: string }).ticker
    const market = (r as { market: string }).market
    if (!ticker || (market !== 'KR' && market !== 'US')) continue
    const key = `${market}:${ticker}`
    if (distinct.has(key)) continue
    const lastRunAt = (r as { completed_at: string | null; created_at: string }).completed_at
      ?? (r as { created_at: string }).created_at
    distinct.set(key, {
      ticker,
      market: market as 'KR' | 'US',
      tickerName: ticker,
      lastRunAt,
    })
    if (distinct.size >= limit) break
  }

  // 2) strategy_watchlist를 사용자의 strategy 기반으로 조회하여 ticker_name 매핑
  const tickers = Array.from(distinct.values())
  if (tickers.length > 0) {
    const tickerKeys = Array.from(new Set(tickers.map((t) => t.ticker)))
    const { data: strategies } = await supabase
      .from('investment_strategies')
      .select('id')
      .eq('user_id', auth.user.id)

    const strategyIds = (strategies ?? []).map((s) => (s as { id: string }).id)
    if (strategyIds.length > 0) {
      const { data: watchItems } = await supabase
        .from('strategy_watchlist')
        .select('ticker, market, ticker_name')
        .in('strategy_id', strategyIds)
        .in('ticker', tickerKeys)

      if (watchItems) {
        const nameMap = new Map<string, string>()
        for (const w of watchItems as Array<{ ticker: string; market: string; ticker_name: string | null }>) {
          if (!w.ticker_name) continue
          nameMap.set(`${w.market}:${w.ticker}`, w.ticker_name)
        }
        for (const t of tickers) {
          const name = nameMap.get(`${t.market}:${t.ticker}`)
          if (name) t.tickerName = name
        }
      }
    }
  }

  return NextResponse.json({ data: tickers })
}
