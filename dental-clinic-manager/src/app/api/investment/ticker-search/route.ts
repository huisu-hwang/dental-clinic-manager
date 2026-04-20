/**
 * 종목 검색 API
 *
 * GET /api/investment/ticker-search?q=삼성&market=KR
 *
 * 국내: 로컬 한글 딕셔너리 (Yahoo Finance 한글 미지원 대응) + yahoo-finance2 fallback
 * 미국: yahoo-finance2 search
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { searchKRTicker } from '@/lib/krTickerDict'

// 한글 자모 감지 (자모만 있는 쿼리는 빈 결과 반환)
const HANGUL_JAMO = /[\u3131-\u318E]/
const HANGUL_COMPLETE = /[\uAC00-\uD7A3]/

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

  // 자모만 있고 완성형 한글/영문/숫자가 없으면 빈 결과
  if (HANGUL_JAMO.test(query) && !HANGUL_COMPLETE.test(query) && !/[a-zA-Z0-9]/.test(query)) {
    return NextResponse.json({ results: [] })
  }

  const isKorean = HANGUL_COMPLETE.test(query)

  // 국내 시장 + 한글 검색 → 로컬 딕셔너리 우선
  if (market === 'KR' && isKorean) {
    const entries = searchKRTicker(query, 10)
    return NextResponse.json({
      results: entries.map(e => ({
        ticker: e.ticker,
        name: e.name,
        exchange: 'KSC',
        type: 'EQUITY',
        market: 'KR',
      })),
    })
  }

  // 국내 + 영문/숫자 → 로컬 먼저 시도 후 yahoo 보강
  if (market === 'KR') {
    const localEntries = searchKRTicker(query, 10)
    if (localEntries.length > 0) {
      return NextResponse.json({
        results: localEntries.map(e => ({
          ticker: e.ticker,
          name: e.name,
          exchange: 'KSC',
          type: 'EQUITY',
          market: 'KR',
        })),
      })
    }
  }

  // yahoo-finance2 fallback (영문 쿼리 또는 미국 시장)
  try {
    const YahooFinance = (await import('yahoo-finance2')).default
    const yahooFinance = new YahooFinance()

    const searchResult = await yahooFinance.search(query, {
      newsCount: 0,
      quotesCount: 15,
    })

    const quotes = (searchResult.quotes || [])
      .filter((q: Record<string, unknown>) => {
        const quoteType = q.quoteType as string
        if (!['EQUITY', 'ETF'].includes(quoteType)) return false

        const exchange = (q.exchange as string || '').toUpperCase()
        if (market === 'KR') {
          return ['KSC', 'KOE', 'KSE'].includes(exchange) ||
                 (q.symbol as string || '').endsWith('.KS') ||
                 (q.symbol as string || '').endsWith('.KQ')
        }
        return ['NMS', 'NYQ', 'NGM', 'ASE', 'PCX', 'BTS'].includes(exchange)
      })
      .map((q: Record<string, unknown>) => {
        let ticker = q.symbol as string || ''
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
    // 한글 쿼리 등으로 yahoo-finance2 에러 → 조용히 빈 결과
    console.warn('[ticker-search] yahoo failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ results: [] })
  }
}
