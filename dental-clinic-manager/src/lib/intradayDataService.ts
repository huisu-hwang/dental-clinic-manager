/**
 * 분봉(Intraday) 주가 데이터 서비스
 *
 * - intraday_price_cache 테이블 캐싱
 * - yahoo-finance2 분봉 데이터 조회 (1m / 5m / 15m)
 * - 우선순위: DB 캐시 → yahoo-finance2 → 재시도 → 빈 배열
 *
 * Yahoo 정책 제약:
 * - 1m: 최근 7일까지만 제공
 * - 5m / 15m: 최근 60일
 * - 한국 종목 분봉은 미지원일 수 있음 (yahoo가 반환하면 사용, 아니면 빈 배열)
 */

import type { OHLCV, Market } from '@/types/investment'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

// ============================================
// 공개 타입
// ============================================

/** 분봉 timeframe */
export type IntradayTimeframe = '1m' | '5m' | '15m'

export interface FetchIntradayParams {
  ticker: string
  market: Market
  timeframe: IntradayTimeframe
  /** 시작 날짜 (YYYY-MM-DD). 미지정 시 timeframe별 최대 보존 기간 */
  startDate?: string
  /** 종료 날짜 (YYYY-MM-DD). 미지정 시 오늘 */
  endDate?: string
}

// ============================================
// 공개 API
// ============================================

/**
 * 분봉 OHLCV 가져오기
 *
 * - DB 캐시 → yahoo-finance2 → 재시도(2회) → 캐시 저장
 * - date 필드는 ISO datetime ('YYYY-MM-DDTHH:mm:ss' 포맷)
 * - 한국 종목이 yahoo에서 미지원이면 빈 배열 반환
 */
export async function fetchIntradayPrices(params: FetchIntradayParams): Promise<OHLCV[]> {
  const { ticker, market, timeframe } = params
  const endDate = params.endDate ?? toDateString(new Date())
  const startDate = params.startDate ?? defaultStartDate(timeframe)

  // 1. DB 캐시 조회
  const cached = await getCachedIntraday(ticker, market, timeframe, startDate, endDate)
  if (cached.length > 0) {
    // 분봉 데이터 자체는 외부에서 가져오는 게 비싸므로 캐시가 어느 정도 있으면 사용
    // 하루 단위로 신선도가 다르므로 보수적으로 (요청 일수 * 일봉 60% 수준 이상이면 캐시 사용)
    const requestDays = daysBetween(startDate, endDate)
    const minBarsPerDay = barsPerDay(timeframe)
    const minExpectedBars = Math.floor(requestDays * minBarsPerDay * 0.4)
    if (cached.length >= Math.max(1, minExpectedBars)) {
      return cached
    }
  }

  // 2. yahoo-finance2에서 가져오기 (최대 2회 재시도)
  let bars: OHLCV[] = []
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      bars = await fetchFromYahooIntraday(ticker, market, timeframe, startDate, endDate)
      if (bars.length > 0) break
    } catch (error) {
      lastError = error
      console.warn(`yahoo-finance2 분봉 시도 ${attempt + 1} 실패 (${ticker} ${timeframe}):`, error)
      if (attempt < 1) await new Promise(r => setTimeout(r, 1000))
    }
  }

  if (bars.length === 0) {
    // yahoo 실패 시 캐시라도 반환
    if (cached.length > 0) return cached
    if (lastError) {
      const msg = lastError instanceof Error ? lastError.message : '알 수 없는 오류'
      console.warn(`[intraday] ${ticker} ${timeframe} 데이터 없음: ${msg}`)
    }
    return []
  }

  // 3. DB 캐시에 저장
  await saveIntradayToCache(ticker, market, timeframe, bars)

  return bars
}

// ============================================
// yahoo-finance2 분봉 조회
// ============================================

interface YahooIntradayQuote {
  date: Date
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

async function fetchFromYahooIntraday(
  ticker: string,
  market: Market,
  timeframe: IntradayTimeframe,
  startDate: string,
  endDate: string,
): Promise<OHLCV[]> {
  // yahoo-finance2는 동적 import (서버 사이드 전용)
  const YahooFinance = (await import('yahoo-finance2')).default
  const yahooFinance = new YahooFinance()

  // 한국 종목은 .KS / .KQ 접미사 필요
  const symbol = market === 'KR' ? `${ticker}.KS` : ticker

  const period1 = startDate
  const period2 = endDate

  const tryFetch = async (sym: string): Promise<OHLCV[]> => {
    const result = await yahooFinance.chart(sym, {
      period1,
      period2,
      interval: timeframe,
    })
    if (!result?.quotes || result.quotes.length === 0) return []
    return (result.quotes as YahooIntradayQuote[])
      .filter(q => q.open != null && q.close != null && q.date != null)
      .map(quoteToIntradayOHLCV)
  }

  let bars = await tryFetch(symbol)

  // 한국 종목인데 KOSPI에서 안 나오면 KOSDAQ 시도
  if (bars.length === 0 && market === 'KR') {
    bars = await tryFetch(`${ticker}.KQ`)
  }

  return bars
}

function quoteToIntradayOHLCV(q: YahooIntradayQuote): OHLCV {
  const d = q.date instanceof Date ? q.date : new Date(q.date)
  // ISO datetime ('YYYY-MM-DDTHH:mm:ss') - 초 단위 보존, 밀리초/Z 제거
  const iso = d.toISOString().split('.')[0]
  return {
    date: iso,
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

async function getCachedIntraday(
  ticker: string,
  market: Market,
  timeframe: IntradayTimeframe,
  startDate: string,
  endDate: string,
): Promise<OHLCV[]> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return []

  // datetime 비교를 위해 ISO 변환 (날짜 경계 포함)
  const startDt = `${startDate}T00:00:00.000Z`
  const endDt = `${endDate}T23:59:59.999Z`

  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (k: string, v: string) => {
          eq: (k: string, v: string) => {
            eq: (k: string, v: string) => {
              gte: (k: string, v: string) => {
                lte: (k: string, v: string) => {
                  order: (k: string, opts: { ascending: boolean }) => Promise<{
                    data: Array<{ datetime: string; open: number; high: number; low: number; close: number; volume: number }> | null
                    error: { message: string } | null
                  }>
                }
              }
            }
          }
        }
      }
    }
  })
    .from('intraday_price_cache')
    .select('datetime, open, high, low, close, volume')
    .eq('ticker', ticker)
    .eq('market', market)
    .eq('timeframe', timeframe)
    .gte('datetime', startDt)
    .lte('datetime', endDt)
    .order('datetime', { ascending: true })

  if (error) {
    console.warn('intraday_price_cache 조회 실패:', error.message)
    return []
  }

  return (data || []).map(row => ({
    date: typeof row.datetime === 'string'
      ? row.datetime.split('.')[0].replace('Z', '')
      : new Date(row.datetime).toISOString().split('.')[0],
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  }))
}

async function saveIntradayToCache(
  ticker: string,
  market: Market,
  timeframe: IntradayTimeframe,
  bars: OHLCV[],
): Promise<void> {
  const supabase = getSupabaseAdmin()
  if (!supabase) return

  // datetime은 TIMESTAMPTZ — ISO 문자열로 저장
  const rows = bars.map(b => ({
    ticker,
    market,
    timeframe,
    datetime: ensureIso(b.date),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }))

  const BATCH_SIZE = 500
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await (supabase as unknown as {
      from: (t: string) => {
        upsert: (
          rows: Array<Record<string, unknown>>,
          opts: { onConflict: string; ignoreDuplicates: boolean },
        ) => Promise<{ error: { message: string } | null }>
      }
    })
      .from('intraday_price_cache')
      .upsert(batch, {
        onConflict: 'ticker,market,timeframe,datetime',
        ignoreDuplicates: false,
      })

    if (error) {
      console.warn(`intraday_price_cache 저장 실패 (batch ${i}):`, error.message)
    }
  }
}

// ============================================
// 유틸
// ============================================

function defaultStartDate(timeframe: IntradayTimeframe): string {
  // Yahoo 정책: 1m=7일, 5m=60일, 15m=60일 (경계는 보수적으로 1일씩 빼서 안전 마진 확보)
  const now = new Date()
  const days = timeframe === '1m' ? 6 : timeframe === '5m' ? 30 : 59
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
  return toDateString(start)
}

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0]
}

function daysBetween(start: string, end: string): number {
  const d1 = new Date(start)
  const d2 = new Date(end)
  return Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)))
}

function barsPerDay(timeframe: IntradayTimeframe): number {
  // 정규장 6.5시간 기준 (US: 9:30~16:00, KR: 9:00~15:30)
  switch (timeframe) {
    case '1m': return 390
    case '5m': return 78
    case '15m': return 26
  }
}

function ensureIso(date: string): string {
  // 'YYYY-MM-DDTHH:mm:ss' 또는 ISO 문자열을 모두 허용 → ISO로 정규화
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(date)) {
    return `${date}.000Z`
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z?$/.test(date)) {
    return new Date(date).toISOString()
  }
  return new Date(date).toISOString()
}
