/**
 * 종목 검색 API
 *
 * GET /api/investment/ticker-search?q=삼성&market=ALL
 *
 * - ALL (기본): KR + US 통합 검색 (한글이면 KR만)
 * - KR: 국내만
 * - US: 미국만
 *
 * 국내: 로컬 한글 딕셔너리 (Yahoo Finance 한글 미지원 대응) + yahoo-finance2 fallback
 * 미국: yahoo-finance2 search + 한글 별칭 딕셔너리
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { searchKRTicker } from '@/lib/krTickerDict'
import { searchUSTicker } from '@/lib/usTickerDict'
import { searchUSCatalog } from '@/lib/usTickerCatalog'

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
  const market = (searchParams.get('market') || 'ALL').toUpperCase()

  if (!query || query.length < 1) {
    return NextResponse.json({ results: [] })
  }

  // 자모만 있고 완성형 한글/영문/숫자가 없으면 빈 결과
  if (HANGUL_JAMO.test(query) && !HANGUL_COMPLETE.test(query) && !/[a-zA-Z0-9]/.test(query)) {
    return NextResponse.json({ results: [] })
  }

  const isKorean = HANGUL_COMPLETE.test(query)

  // ALL 통합 검색: 로컬 딕셔너리 KR+US + 미국 정적 카탈로그 + (영문 쿼리면) yahoo 보강
  if (market === 'ALL') {
    const krEntries = searchKRTicker(query, 10)
    const usEntries = searchUSTicker(query, 10)
    const usCatalogEntries = isKorean ? [] : searchUSCatalog(query, 30)

    const localResults = [
      ...krEntries.map(e => ({
        ticker: e.ticker,
        name: e.name,
        exchange: 'KSC',
        type: 'EQUITY',
        market: 'KR',
      })),
      ...usEntries.map(e => ({
        ticker: e.ticker,
        name: e.name,
        exchange: e.exchange || 'NMS',
        type: 'EQUITY',
        market: 'US',
      })),
    ]

    // 한글 쿼리면 로컬만 (Yahoo + 카탈로그 한글 미지원)
    if (isKorean) {
      return NextResponse.json({ results: localResults.slice(0, 20) })
    }

    // 카탈로그 — 로컬에 없는 미국 종목 보강
    const localTickerKeys = new Set(localResults.map(r => `${r.market}:${r.ticker}`))
    const catalogResults = usCatalogEntries
      .filter((e) => !localTickerKeys.has(`US:${e.ticker}`))
      .map((e) => ({
        ticker: e.ticker,
        name: e.name,
        exchange: e.exchange,
        type: e.isETF ? 'ETF' : 'EQUITY',
        market: 'US',
      }))

    // 영문/숫자 쿼리는 yahoo로 KR/US 모두 보강
    try {
      const yahooFinance = (await import('yahoo-finance2')).default
      const searchResult = await yahooFinance.search(query, { newsCount: 0, quotesCount: 50 })

      const yahooQuotes = (searchResult.quotes || [])
        .filter((q: Record<string, unknown>) => {
          const quoteType = q.quoteType as string
          if (!['EQUITY', 'ETF'].includes(quoteType)) return false
          const exchange = (q.exchange as string || '').toUpperCase()
          const symbol = q.symbol as string || ''
          return ['NMS', 'NYQ', 'NGM', 'NCM', 'ASE', 'PCX', 'BTS', 'NYS'].includes(exchange) ||
                 ['KSC', 'KOE', 'KSE'].includes(exchange) ||
                 symbol.endsWith('.KS') || symbol.endsWith('.KQ')
        })
        .map((q: Record<string, unknown>) => {
          let ticker = q.symbol as string || ''
          const exchange = (q.exchange as string || '').toUpperCase()
          let mkt: 'KR' | 'US' = 'US'
          if (['KSC', 'KOE', 'KSE'].includes(exchange) || ticker.endsWith('.KS') || ticker.endsWith('.KQ')) {
            mkt = 'KR'
            ticker = ticker.replace(/\.(KS|KQ)$/, '')
          }
          return {
            ticker,
            name: (q.shortname || q.longname || '') as string,
            exchange: q.exchange as string,
            type: q.quoteType as string,
            market: mkt,
          }
        })

      // 카탈로그 + 로컬 결과 키 합집합으로 yahoo 중복 제거
      const knownKeys = new Set([
        ...localResults.map(r => `${r.market}:${r.ticker}`),
        ...catalogResults.map(r => `${r.market}:${r.ticker}`),
      ])
      const yahooFiltered = yahooQuotes.filter(q => !knownKeys.has(`${q.market}:${q.ticker}`))
      return NextResponse.json({ results: [...localResults, ...catalogResults, ...yahooFiltered].slice(0, 40) })
    } catch (err) {
      console.warn('[ticker-search] yahoo failed (ALL):', err instanceof Error ? err.message : err)
      // yahoo 실패 시에도 카탈로그는 활용
      return NextResponse.json({ results: [...localResults, ...catalogResults].slice(0, 40) })
    }
  }

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
      // 한글 쿼리는 로컬만 (yahoo + 카탈로그는 한글 미지원)
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
    // 영문/숫자 쿼리: 로컬 별칭 + 카탈로그 + yahoo 보강 (아래)
    // (이전 early return 제거 — 카탈로그/yahoo 결과를 함께 노출하기 위해)
  }

  // yahoo-finance2 fallback (영문 쿼리 또는 미국 시장)
  try {
    const yahooFinance = (await import('yahoo-finance2')).default

    const searchResult = await yahooFinance.search(query, {
      newsCount: 0,
      quotesCount: 50,
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
        return ['NMS', 'NYQ', 'NGM', 'NCM', 'ASE', 'PCX', 'BTS', 'NYS'].includes(exchange)
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
      .slice(0, 30)

    // 미국 시장: 로컬 별칭 + 카탈로그 + yahoo 결과 병합 (중복 제거)
    if (market === 'US') {
      const localEntries = searchUSTicker(query, 5)
      const localResults = localEntries.map(e => ({
        ticker: e.ticker,
        name: e.name,
        exchange: e.exchange || 'NMS',
        type: 'EQUITY',
        market: 'US',
      }))
      const catalogEntries = searchUSCatalog(query, 30)
      const knownTickers = new Set([
        ...localResults.map(r => r.ticker),
        ...catalogEntries.map(e => e.ticker),
      ])
      const catalogResults = catalogEntries
        .filter((e) => !localResults.some((r) => r.ticker === e.ticker))
        .map((e) => ({
          ticker: e.ticker,
          name: e.name,
          exchange: e.exchange,
          type: e.isETF ? 'ETF' : 'EQUITY',
          market: 'US',
        }))
      const yahooFiltered = quotes.filter(q => !knownTickers.has(q.ticker))
      return NextResponse.json({
        results: [...localResults, ...catalogResults, ...yahooFiltered].slice(0, 40),
      })
    }

    return NextResponse.json({ results: quotes.slice(0, 30) })
  } catch (err) {
    // 한글 쿼리 등으로 yahoo-finance2 에러 → 조용히 빈 결과
    console.warn('[ticker-search] yahoo failed:', err instanceof Error ? err.message : err)
    // 미국 시장이면 로컬 + 카탈로그라도 반환
    if (market === 'US') {
      const entries = searchUSTicker(query, 10)
      const localResults = entries.map(e => ({
        ticker: e.ticker,
        name: e.name,
        exchange: e.exchange || 'NMS',
        type: 'EQUITY',
        market: 'US',
      }))
      const catalogEntries = searchUSCatalog(query, 30)
      const catalogResults = catalogEntries
        .filter((e) => !localResults.some((r) => r.ticker === e.ticker))
        .map((e) => ({
          ticker: e.ticker,
          name: e.name,
          exchange: e.exchange,
          type: e.isETF ? 'ETF' : 'EQUITY',
          market: 'US',
        }))
      return NextResponse.json({ results: [...localResults, ...catalogResults].slice(0, 40) })
    }
    return NextResponse.json({ results: [] })
  }
}
