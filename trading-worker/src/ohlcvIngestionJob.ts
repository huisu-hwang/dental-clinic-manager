import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from './logger'

// Dow 30 (2026 기준 일반적 종목; 인덱스 변경 가능 — 학습 데이터와 일치 우선이면 정책에 따라 조정)
export const DEFAULT_UNIVERSE = [
  'AAPL','MSFT','UNH','JNJ','V','WMT','PG','JPM','HD','CVX',
  'MA','KO','PFE','DIS','CSCO','VZ','ADBE','NKE','CRM','INTC',
  'MRK','WBA','BA','CAT','GS','IBM','MMM','AXP','TRV','DOW',
]

export interface OhlcvRow {
  ticker: string
  market: 'US'
  timeframe: '1d'
  datetime: string  // ISO with timezone
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface IngestionDeps {
  fetchYahoo: (ticker: string, days: number) => Promise<OhlcvRow[]>
  upsert: (rows: OhlcvRow[]) => Promise<{ inserted: number; error: string | null }>
}

export interface IngestionResult {
  tickers: number
  inserted: number
  failed: { ticker: string; error: string }[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface IngestionOptions {
  throttleMs?: number  // 종목 사이 sleep
  retries?: number     // 429/5xx 재시도
}

export async function runOhlcvIngestion(
  universe: string[],
  daysBack: number,
  deps: IngestionDeps,
  options: IngestionOptions = {},
): Promise<IngestionResult> {
  const throttleMs = options.throttleMs ?? 1500
  const retries = options.retries ?? 3
  const result: IngestionResult = { tickers: 0, inserted: 0, failed: [] }

  for (let i = 0; i < universe.length; i++) {
    const ticker = universe[i]
    result.tickers++
    let lastErr = ''
    let rows: OhlcvRow[] | null = null

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        rows = await deps.fetchYahoo(ticker, daysBack)
        lastErr = ''
        break
      } catch (err) {
        lastErr = (err as Error).message
        // 429 또는 5xx로 보이면 exponential backoff (1s, 2s, 4s, ...)
        if (attempt < retries) {
          const wait = throttleMs * Math.pow(2, attempt)
          logger.warn({ ticker, attempt, wait, err: lastErr }, 'ohlcvIngestion: retry after backoff')
          await sleep(wait)
        }
      }
    }

    if (lastErr || !rows) {
      result.failed.push({ ticker, error: lastErr || 'fetch returned null' })
    } else if (rows.length > 0) {
      const r = await deps.upsert(rows)
      if (r.error) result.failed.push({ ticker, error: r.error })
      else result.inserted += r.inserted
    }

    // 다음 종목 전 throttle (마지막 종목은 sleep 생략)
    if (i < universe.length - 1) await sleep(throttleMs)
  }
  return result
}

// Yahoo Finance Chart API helper
export async function fetchYahooChart(ticker: string, daysBack: number): Promise<OhlcvRow[]> {
  const range = daysBack <= 5 ? '5d' : daysBack <= 30 ? '1mo' : daysBack <= 90 ? '3mo' : '1y'
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${range}`
  const resp = await fetch(url, {
    headers: {
      // Yahoo blocks default UA; use a browser-like UA.
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'accept': 'application/json',
    },
  })
  if (!resp.ok) throw new Error(`yahoo ${ticker} ${resp.status}`)
  const json = (await resp.json()) as any
  const r = json?.chart?.result?.[0]
  if (!r) return []
  const ts = r.timestamp as number[] | undefined
  const q = r.indicators?.quote?.[0]
  if (!ts || !q) return []
  const out: OhlcvRow[] = []
  for (let i = 0; i < ts.length; i++) {
    const open = q.open?.[i], high = q.high?.[i], low = q.low?.[i], close = q.close?.[i], volume = q.volume?.[i]
    if (open == null || high == null || low == null || close == null) continue
    const datetime = new Date(ts[i] * 1000).toISOString()
    out.push({
      ticker, market: 'US', timeframe: '1d', datetime,
      open: Number(open), high: Number(high), low: Number(low), close: Number(close),
      volume: Number(volume ?? 0),
    })
  }
  return out
}

export async function buildIngestionDeps(
  supabase: SupabaseClient,
): Promise<IngestionDeps> {
  return {
    fetchYahoo: fetchYahooChart,
    upsert: async (rows) => {
      if (rows.length === 0) return { inserted: 0, error: null }
      const { error } = await supabase
        .from('intraday_price_cache')
        .upsert(rows, { onConflict: 'ticker,market,timeframe,datetime' })
      if (error) return { inserted: 0, error: error.message }
      return { inserted: rows.length, error: null }
    },
  }
}
