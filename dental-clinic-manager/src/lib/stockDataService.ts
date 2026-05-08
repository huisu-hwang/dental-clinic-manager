/**
 * 주가 데이터 서비스
 *
 * - stock_price_cache 테이블 캐싱
 * - KIS API 일봉 데이터 (국내 단기)
 * - yahoo-finance2 (국내 장기 / 미국)
 *
 * 우선순위: DB 캐시 → KIS API → yahoo-finance2 (fallback)
 */

import type { OHLCV, Market } from '@/types/investment'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

// ============================================
// 공개 API
// ============================================

/**
 * 주가 데이터 조회 (캐시 우선)
 *
 * @param ticker 종목 코드 (국내: '005930', 미국: 'AAPL')
 * @param market 시장 ('KR' | 'US')
 * @param startDate 시작일 'YYYY-MM-DD'
 * @param endDate 종료일 'YYYY-MM-DD'
 * @returns OHLCV 배열 (오래된 순 정렬)
 */
export async function fetchPrices(
  ticker: string,
  market: Market,
  startDate: string,
  endDate: string,
): Promise<OHLCV[]> {
  // 1. DB 캐시에서 조회
  const cached = await getCachedPrices(ticker, market, startDate, endDate)
  if (cached.length > 0) {
    const requestDays = daysBetween(startDate, endDate)
    const minExpectedDays = Math.floor(requestDays * 0.5) // 주말/휴일 감안 50%
    if (cached.length >= minExpectedDays) {
      return cached
    }
  }

  // 2. 외부 API에서 가져오기 (최대 2회 재시도)
  let prices: OHLCV[] = []
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      prices = await fetchFromYahooFinance(ticker, market, startDate, endDate)
      if (prices.length > 0) break
    } catch (error) {
      lastError = error
      console.warn(`yahoo-finance2 시도 ${attempt + 1} 실패 (${ticker}):`, error)
      if (attempt < 1) await new Promise(r => setTimeout(r, 1000)) // 1초 대기 후 재시도
    }
  }

  if (prices.length === 0) {
    // yahoo 실패 시 캐시라도 반환
    if (cached.length > 0) return cached
    const errMsg = lastError instanceof Error ? lastError.message : '알 수 없는 오류'
    throw new Error(`${ticker} 주가 데이터를 가져올 수 없습니다: ${errMsg}`)
  }

  // 3. DB 캐시에 저장
  if (prices.length > 0) {
    await savePricesToCache(ticker, market, prices)
  }

  return prices
}

// ============================================
// yahoo-finance2 조회
// ============================================

async function fetchFromYahooFinance(
  ticker: string,
  market: Market,
  startDate: string,
  endDate: string,
): Promise<OHLCV[]> {
  // yahoo-finance2는 동적 import (서버 사이드 전용)
  const YahooFinance = (await import('yahoo-finance2')).default
  const yahooFinance = new YahooFinance()

  // 한국 종목은 .KS (KOSPI) 또는 .KQ (KOSDAQ) 접미사 필요
  const symbol = market === 'KR' ? `${ticker}.KS` : ticker

  const result = await yahooFinance.chart(symbol, {
    period1: startDate,
    period2: endDate,
    interval: '1d',
  })

  if (!result?.quotes || result.quotes.length === 0) {
    // KOSPI에서 못 찾으면 KOSDAQ 시도
    if (market === 'KR') {
      const kosdaqResult = await yahooFinance.chart(`${ticker}.KQ`, {
        period1: startDate,
        period2: endDate,
        interval: '1d',
      })
      if (kosdaqResult?.quotes && kosdaqResult.quotes.length > 0) {
        return kosdaqResult.quotes
          .filter((q: { open: number | null; close: number | null }) => q.open != null && q.close != null)
          .map(quoteToOHLCV)
      }
    }
    return []
  }

  return result.quotes
    .filter((q: { open: number | null; close: number | null }) => q.open != null && q.close != null)
    .map(quoteToOHLCV)
}

interface YahooQuote {
  date: Date
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

function quoteToOHLCV(q: YahooQuote): OHLCV {
  const d = q.date instanceof Date ? q.date : new Date(q.date)
  return {
    date: d.toISOString().split('T')[0],
    open: q.open ?? 0,
    high: q.high ?? 0,
    low: q.low ?? 0,
    close: q.close ?? 0,
    volume: q.volume ?? 0,
  }
}

// ============================================
// DB 캐시 조회/저장
// ============================================

async function getCachedPrices(
  ticker: string,
  market: Market,
  startDate: string,
  endDate: string,
): Promise<OHLCV[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('stock_price_cache')
    .select('date, open, high, low, close, volume')
    .eq('ticker', ticker)
    .eq('market', market)
    .eq('timeframe', '1d')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })

  if (error) {
    console.warn('stock_price_cache 조회 실패:', error.message)
    return []
  }

  return (data || []).map(row => ({
    date: typeof row.date === 'string' ? row.date : new Date(row.date).toISOString().split('T')[0],
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  }))
}

async function savePricesToCache(
  ticker: string,
  market: Market,
  prices: OHLCV[],
): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return

  // upsert로 중복 방지
  const rows = prices.map(p => ({
    ticker,
    market,
    timeframe: '1d' as const,
    date: p.date,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
  }))

  // 500개씩 배치 처리
  const BATCH_SIZE = 500
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('stock_price_cache')
      .upsert(batch, {
        onConflict: 'ticker,market,timeframe,date',
        ignoreDuplicates: false,
      })

    if (error) {
      console.warn(`stock_price_cache 저장 실패 (batch ${i}):`, error.message)
    }
  }
}

// ============================================
// 유틸
// ============================================

function daysBetween(start: string, end: string): number {
  const d1 = new Date(start)
  const d2 = new Date(end)
  return Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

// ============================================
// 장중 현재가 조회 (yahoo-finance2 quote)
// ============================================

export interface CurrentQuote {
  ticker: string
  market: Market
  price: number
  open?: number
  high?: number
  low?: number
  previousClose?: number
  marketTime?: string  // ISO
}

interface YahooQuoteResult {
  regularMarketPrice?: number | null
  regularMarketOpen?: number | null
  regularMarketDayHigh?: number | null
  regularMarketDayLow?: number | null
  regularMarketPreviousClose?: number | null
  regularMarketTime?: Date | number | string | null
}

/**
 * 장중 현재가 조회 — yahoo-finance2 quote 사용
 * KR은 자동으로 .KS/.KQ suffix 처리 (기존 fetchPrices와 동일 규칙)
 */
export async function fetchCurrentQuote(ticker: string, market: Market): Promise<CurrentQuote> {
  const YahooFinance = (await import('yahoo-finance2')).default
  const yahooFinance = new YahooFinance()

  const trySymbols = market === 'KR' ? [`${ticker}.KS`, `${ticker}.KQ`] : [ticker]

  let q: YahooQuoteResult | null = null
  let lastError: unknown = null
  for (const symbol of trySymbols) {
    try {
      const result = (await yahooFinance.quote(symbol)) as unknown as YahooQuoteResult
      if (result && typeof result.regularMarketPrice === 'number') {
        q = result
        break
      }
    } catch (error) {
      lastError = error
      continue
    }
  }

  if (!q || typeof q.regularMarketPrice !== 'number') {
    const errMsg = lastError instanceof Error ? lastError.message : '데이터 없음'
    throw new Error(`현재가 조회 실패: ${ticker} (${errMsg})`)
  }

  let marketTimeIso: string | undefined
  const rawTime = q.regularMarketTime
  if (rawTime != null) {
    const d = rawTime instanceof Date ? rawTime : new Date(rawTime)
    if (!isNaN(d.getTime())) marketTimeIso = d.toISOString()
  }

  return {
    ticker,
    market,
    price: q.regularMarketPrice,
    open: typeof q.regularMarketOpen === 'number' ? q.regularMarketOpen : undefined,
    high: typeof q.regularMarketDayHigh === 'number' ? q.regularMarketDayHigh : undefined,
    low: typeof q.regularMarketDayLow === 'number' ? q.regularMarketDayLow : undefined,
    previousClose: typeof q.regularMarketPreviousClose === 'number' ? q.regularMarketPreviousClose : undefined,
    marketTime: marketTimeIso,
  }
}
