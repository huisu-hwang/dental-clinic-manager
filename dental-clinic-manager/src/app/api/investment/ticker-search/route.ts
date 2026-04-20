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
import { searchUSTicker } from '@/lib/usTickerDict'

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

  // 국내 시장 → 로컬 딕셔너리 우선 (한글/영문/코드 모두)
  if (market === 'KR') {
    const entries = searchKRTicker(query, 10)
    if (entries.length > 0 || isKorean) {
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
  }

  // 미국 시장 → 로컬 한글 딕셔너리 우선 (한글 쿼리 or 영문 별칭)
  if (market === 'US') {
    const entries = searchUSTicker(query, 10)
    if (isKorean) {
      // 한글 쿼리는 로컬만 (yahoo는 한글 미지원)
      return NextResponse.json({
        results: entries.map(e => ({
          ticker: e.ticker,
          name: e.name,
          exchange: e.exchange || 'NMS',
          type: 'EQUITY',
          market: 'US',
        })),
      })
    }
    // 영문/숫자 쿼리: 로컬 먼저 반환 + yahoo 보강 (아래에서)
    if (entries.length >= 5) {
      return NextResponse.json({
        results: entries.map(e => ({
          ticker: e.ticker,
          name: e.name,
          exchange: e.exchange || 'NMS',
          type: 'EQUITY',
          market: 'US',
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
      .slice(0, 15)

    // 미국 시장: 로컬 결과를 상위에 두고 yahoo 결과 병합 (중복 제거)
    if (market === 'US') {
      const localEntries = searchUSTicker(query, 5)
      const localTickers = new Set(localEntries.map(e => e.ticker))
      const localResults = localEntries.map(e => ({
        ticker: e.ticker,
        name: e.name,
        exchange: e.exchange || 'NMS',
        type: 'EQUITY',
        market: 'US',
      }))
      const yahooFiltered = quotes.filter(q => !localTickers.has(q.ticker))
      return NextResponse.json({ results: [...localResults, ...yahooFiltered].slice(0, 15) })
    }

    return NextResponse.json({ results: quotes.slice(0, 10) })
  } catch (err) {
    // 한글 쿼리 등으로 yahoo-finance2 에러 → 조용히 빈 결과
    console.warn('[ticker-search] yahoo failed:', err instanceof Error ? err.message : err)
    // 미국 시장이면 로컬 결과라도 반환
    if (market === 'US') {
      const entries = searchUSTicker(query, 10)
      return NextResponse.json({
        results: entries.map(e => ({
          ticker: e.ticker,
          name: e.name,
          exchange: e.exchange || 'NMS',
          type: 'EQUITY',
          market: 'US',
        })),
      })
    }
    return NextResponse.json({ results: [] })
  }
}
