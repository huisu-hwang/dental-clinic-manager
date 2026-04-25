/**
 * 분봉 데이터 조회 API
 *
 * GET /api/investment/intraday-prices?ticker=AAPL&market=US&timeframe=5m
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { fetchIntradayPrices, type IntradayTimeframe } from '@/lib/intradayDataService'
import type { Market } from '@/types/investment'

const VALID_TIMEFRAMES: IntradayTimeframe[] = ['1m', '5m', '15m']

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const ticker = searchParams.get('ticker')
  const market = searchParams.get('market')
  const timeframe = searchParams.get('timeframe') || '5m'
  const startDate = searchParams.get('startDate') || undefined
  const endDate = searchParams.get('endDate') || undefined

  if (!ticker) return NextResponse.json({ error: 'ticker 필수' }, { status: 400 })
  if (market !== 'KR' && market !== 'US') {
    return NextResponse.json({ error: 'market은 KR 또는 US' }, { status: 400 })
  }
  if (!VALID_TIMEFRAMES.includes(timeframe as IntradayTimeframe)) {
    return NextResponse.json({ error: 'timeframe은 1m, 5m, 15m 중 하나' }, { status: 400 })
  }

  try {
    const prices = await fetchIntradayPrices({
      ticker,
      market: market as Market,
      timeframe: timeframe as IntradayTimeframe,
      startDate,
      endDate,
    })

    return NextResponse.json({
      data: prices,
      meta: {
        ticker, market, timeframe,
        count: prices.length,
        first: prices[0]?.date,
        last: prices[prices.length - 1]?.date,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '분봉 조회 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
