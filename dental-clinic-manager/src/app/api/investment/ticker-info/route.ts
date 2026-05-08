/**
 * 종목 펀더멘털 + 가격 차트 + 시총 순위 통합 조회.
 *
 *   GET /api/investment/ticker-info?ticker=AAPL&market=US&range=1mo
 *   GET /api/investment/ticker-info?ticker=005930&market=KR&range=3mo
 *
 * - yahoo-finance2 quoteSummary로 펀더멘털 + 시총 + price
 * - yahoo-finance2 chart로 가격 시계열
 * - 시총 순위: usTickerCatalog / krTickerCatalog 정렬 인덱스
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUSCatalogEntry, topByMarketCap as topUSByMarketCap } from '@/lib/usTickerCatalog'
import { getKRMarketCapRank } from '@/lib/krTickerCatalog'

export const revalidate = 1800 // 30분 캐시

type Range = '1mo' | '3mo' | '1y'

function parseRange(v: string | null): Range {
  if (v === '3mo' || v === '1y') return v
  return '1mo'
}

function rangeToInterval(range: Range): { period: number; interval: '1d' | '1wk' } {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  switch (range) {
    case '1mo': return { period: now - 35 * day, interval: '1d' }
    case '3mo': return { period: now - 100 * day, interval: '1d' }
    case '1y':  return { period: now - 380 * day, interval: '1wk' }
  }
}

async function getYahoo() {
  // yahoo-finance2 v3: default export가 클래스 — 인스턴스화 필수
  const YahooFinance = (await import('yahoo-finance2')).default
  return new YahooFinance()
}

async function resolveSymbol(yahoo: any, ticker: string, market: 'KR' | 'US'): Promise<string | null> {
  const t = ticker.toUpperCase().trim()
  if (!t) return null
  if (market === 'US') return t
  for (const suffix of ['.KS', '.KQ']) {
    try {
      await yahoo.quoteSummary(t + suffix, { modules: ['price'] })
      return t + suffix
    } catch {
      // 다음 suffix
    }
  }
  return null
}

let _us_rank: Map<string, number> | null = null
function getUSMarketCapRank(ticker: string): number | null {
  if (!_us_rank) {
    const list = topUSByMarketCap(10000)
    const m = new Map<string, number>()
    list.forEach((e, i) => m.set(e.ticker, i + 1))
    _us_rank = m
  }
  return _us_rank.get(ticker.toUpperCase()) ?? null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ticker = (searchParams.get('ticker') ?? '').trim()
  const market = searchParams.get('market') as 'KR' | 'US' | null
  const range = parseRange(searchParams.get('range'))

  if (!ticker) return NextResponse.json({ error: '종목 코드가 비어있습니다' }, { status: 400 })
  if (market !== 'KR' && market !== 'US') {
    return NextResponse.json({ error: '올바르지 않은 시장 코드' }, { status: 400 })
  }

  const yahoo = await getYahoo()
  const symbol = await resolveSymbol(yahoo, ticker, market)
  if (!symbol) {
    return NextResponse.json({ error: '종목 정보를 찾을 수 없습니다' }, { status: 404 })
  }

  try {
    const sum = await yahoo.quoteSummary(symbol, {
      modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData'],
    })

    const price = sum?.price ?? {}
    const detail = sum?.summaryDetail ?? {}
    const stats = sum?.defaultKeyStatistics ?? {}
    const fin = sum?.financialData ?? {}

    // KR 종목은 trailingPE/EPS/PBR/operatingIncome이 비어 오는 경우가 많음.
    // quote() 응답에서 추가 필드 시도 (priceEpsCurrentYear, forwardPE 등 KR에서도 종종 채워짐).
    const q: any = await yahoo.quote(symbol).catch(() => null)
    const currentPrice = numOrNull((price as any)?.regularMarketPrice ?? q?.regularMarketPrice)

    // PER fallback: trailing → forward → currentYear EPS 기준
    const per = numOrNull(
      (detail as any)?.trailingPE
        ?? (stats as any)?.trailingPE
        ?? q?.trailingPE
        ?? (stats as any)?.forwardPE
        ?? q?.forwardPE
        ?? q?.priceEpsCurrentYear,
    )

    // EPS fallback: trailing → forward → 계산(price/per)
    let eps = numOrNull(
      (stats as any)?.trailingEps
        ?? (fin as any)?.epsTrailingTwelveMonths
        ?? q?.epsTrailingTwelveMonths
        ?? q?.epsForward
        ?? (stats as any)?.forwardEps,
    )
    if (eps == null && per != null && currentPrice != null && per > 0) {
      eps = currentPrice / per
    }

    // operatingIncome fallback: 직접값 → revenue × operatingMargin 추정
    const totalRevenue = numOrNull((fin as any)?.totalRevenue)
    const operatingMargins = numOrNull((fin as any)?.operatingMargins)
    let operatingIncome = numOrNull((fin as any)?.operatingIncome)
    if (operatingIncome == null && totalRevenue != null && operatingMargins != null) {
      operatingIncome = totalRevenue * operatingMargins
    }

    const rank = market === 'US'
      ? getUSMarketCapRank(ticker)
      : getKRMarketCapRank(ticker)

    const { period, interval } = rangeToInterval(range)
    let chartPoints: Array<{ date: string; close: number }> = []
    try {
      const chart = await yahoo.chart(symbol, {
        period1: new Date(period),
        interval,
      })
      chartPoints = (chart?.quotes ?? [])
        .filter((q: any) => q?.date && typeof q?.close === 'number')
        .map((q: any) => ({
          date: new Date(q.date).toISOString().slice(0, 10),
          close: Number(q.close),
        }))
    } catch {
      // 차트 실패해도 본문은 응답
    }

    const usEntry = market === 'US' ? getUSCatalogEntry(ticker) : null
    const name = usEntry?.name ?? (price as any)?.shortName ?? (price as any)?.longName ?? ticker

    const body = {
      ticker: ticker.toUpperCase(),
      market,
      name,
      price: {
        current: numOrNull((price as any)?.regularMarketPrice),
        change: numOrNull((price as any)?.regularMarketChange),
        changePercent: numOrNull((price as any)?.regularMarketChangePercent),
        volume: numOrNull((price as any)?.regularMarketVolume),
        currency: (price as any)?.currency ?? (market === 'KR' ? 'KRW' : 'USD'),
      },
      range52w: {
        high: numOrNull((detail as any)?.fiftyTwoWeekHigh),
        low: numOrNull((detail as any)?.fiftyTwoWeekLow),
      },
      marketCap: numOrNull((price as any)?.marketCap ?? (detail as any)?.marketCap),
      marketCapRank: rank,
      fundamentals: {
        per,
        pbr: numOrNull((stats as any)?.priceToBook ?? q?.priceToBook),
        roe: numOrNull((fin as any)?.returnOnEquity),
        eps,
        dividendYield: numOrNull((detail as any)?.dividendYield ?? q?.trailingAnnualDividendYield),
        revenue: totalRevenue,
        operatingIncome,
        netIncome: numOrNull((fin as any)?.netIncomeToCommon ?? (stats as any)?.netIncomeToCommon),
        operatingMargin: operatingMargins,
        profitMargin: numOrNull((fin as any)?.profitMargins),
        debtToEquity: numOrNull((fin as any)?.debtToEquity),
      },
      chart: { range, points: chartPoints },
      asOf: new Date().toISOString(),
    }

    return NextResponse.json(body, {
      headers: {
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=600',
      },
    })
  } catch (err: any) {
    console.error('[ticker-info] yahoo error:', err?.message)
    return NextResponse.json({ error: '종목 정보를 가져오지 못했습니다' }, { status: 502 })
  }
}

function numOrNull(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return v
}
