/**
 * 종목 검색 API
 *
 * GET /api/investment/ticker-search?q=삼성&market=KR
 *
 * yahoo-finance2의 search 기능을 활용하여 종목명/코드 자동완성 제공
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim()
  const market = searchParams.get('market') || 'KR'

  if (!query || query.length < 1) {
    return NextResponse.json({ results: [] })
  }

  try {
    const YahooFinance = (await import('yahoo-finance2')).default
    const yahooFinance = new YahooFinance()

    // yahoo-finance2 search API
    const searchResult = await yahooFinance.search(query, {
      newsCount: 0,
      quotesCount: 15,
    })

    const quotes = (searchResult.quotes || [])
      .filter((q: Record<string, unknown>) => {
        // 주식/ETF만 필터링
        const quoteType = q.quoteType as string
        if (!['EQUITY', 'ETF'].includes(quoteType)) return false

        // 시장별 필터링
        const exchange = (q.exchange as string || '').toUpperCase()
        if (market === 'KR') {
          return ['KSC', 'KOE', 'KSE'].includes(exchange) ||
                 (q.symbol as string || '').endsWith('.KS') ||
                 (q.symbol as string || '').endsWith('.KQ')
        }
        // US
        return ['NMS', 'NYQ', 'NGM', 'ASE', 'PCX', 'BTS'].includes(exchange)
      })
      .map((q: Record<string, unknown>) => {
        let ticker = q.symbol as string || ''
        // 국내 종목: .KS, .KQ 접미사 제거
        if (market === 'KR') {
          ticker = ticker.replace(/\.(KS|KQ)$/, '')
        }

        return {
          ticker,
          name: (q.shortname || q.longname || '') as string,
          exchange: q.exchange as string,
          type: q.quoteType as string,
          market,
        }
      })
      .slice(0, 10)

    return NextResponse.json({ results: quotes })
  } catch (err) {
    console.error('종목 검색 실패:', err)
    return NextResponse.json({ results: [] })
  }
}
