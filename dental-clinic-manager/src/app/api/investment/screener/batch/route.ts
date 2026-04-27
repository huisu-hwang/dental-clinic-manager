/**
 * 전략 부합 종목 스크리너 배치 API (클라이언트 배치 모드)
 *
 * POST /api/investment/screener/batch
 * Body: {
 *   strategies: Array<{ strategyId?, preset? }>     // 1~10개
 *   asOfDate: 'YYYY-MM-DD',
 *   realtime?: boolean,                             // 기본 false (장중 현재가 반영)
 *   tickers: Array<{ ticker, market: 'KR'|'US', name }>  // 1~50개
 * }
 *
 * 클라이언트가 직접 풀을 슬라이싱해서 50개 단위로 배치 호출하는 모드.
 * realtime=true이면 마지막 봉을 yahoo-finance2 quote로 갱신/추가하여
 * 장중 진행 중인 캔들도 반영한다.
 *
 * 기존 screener/route.ts와 90% 동일하나 universe 대신 tickers를 받고
 * realtime/processed 필드가 추가된다.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { fetchPrices, fetchCurrentQuote } from '@/lib/stockDataService'
import { calculateIndicators } from '@/lib/indicatorEngine'
import { evaluateConditionTreeWithMatches } from '@/lib/signalEngine'
import type { ConditionGroup, IndicatorConfig, Market, OHLCV } from '@/types/investment'

interface ResolvedStrategy {
  key: string  // 'user:<id>' 또는 'preset:<name>'
  name: string
  indicators: IndicatorConfig[]
  buyConditions: ConditionGroup
}

interface ScreenerMatch {
  ticker: string
  market: Market
  name: string
  asOfDate: string
  price: number
  matchedConditions: string[]
  indicators: Record<string, number | Record<string, number>>
}

interface StrategyScreenerResult {
  strategyKey: string
  strategyName: string
  matches: ScreenerMatch[]
  failed: { ticker: string; market: Market; reason: string }[]
}

interface BatchTickerInput {
  ticker: string
  market: Market
  name: string
}

const CONCURRENCY = 8
const BATCH_TIMEOUT_MS = 50_000

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const userId = auth.user!.id

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다' }, { status: 400 })
  }

  const { asOfDate, realtime } = body
  const isRealtime = realtime === true

  // 1. tickers 검증
  const tickersRaw = body.tickers
  if (!Array.isArray(tickersRaw) || tickersRaw.length === 0) {
    return NextResponse.json({ error: 'tickers 배열이 필요합니다' }, { status: 400 })
  }
  if (tickersRaw.length > 50) {
    return NextResponse.json({ error: '한 번에 최대 50개 종목까지 처리할 수 있습니다' }, { status: 400 })
  }
  const tickers: BatchTickerInput[] = []
  for (const t of tickersRaw) {
    if (!t || typeof t !== 'object') {
      return NextResponse.json({ error: 'tickers 항목 형식이 올바르지 않습니다' }, { status: 400 })
    }
    const tt = t as Record<string, unknown>
    const tk = typeof tt.ticker === 'string' ? tt.ticker : ''
    const mk = tt.market === 'KR' || tt.market === 'US' ? tt.market : null
    const nm = typeof tt.name === 'string' ? tt.name : ''
    if (!tk || !mk) {
      return NextResponse.json({ error: 'ticker/market 값이 잘못되었습니다' }, { status: 400 })
    }
    tickers.push({ ticker: tk, market: mk, name: nm || tk })
  }

  // 2. 전략 목록 정규화
  const inputs: { strategyId?: string; preset?: { name?: string; indicators?: IndicatorConfig[]; buyConditions?: ConditionGroup } }[] = []
  if (Array.isArray(body.strategies)) {
    inputs.push(...(body.strategies as typeof inputs))
  }
  if (inputs.length === 0) {
    return NextResponse.json({ error: '평가할 전략이 1개 이상 필요합니다' }, { status: 400 })
  }
  if (inputs.length > 10) {
    return NextResponse.json({ error: '한 번에 최대 10개 전략까지 동시 스캔 가능합니다' }, { status: 400 })
  }

  // 3. 전략 정보 조회 (저장된 전략은 DB에서, 프리셋은 그대로)
  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  const resolved: ResolvedStrategy[] = []
  for (let i = 0; i < inputs.length; i++) {
    const inp = inputs[i]
    if (inp.strategyId) {
      const { data: strategy } = await supabase
        .from('investment_strategies')
        .select('*')
        .eq('id', inp.strategyId)
        .eq('user_id', userId)
        .single()
      if (!strategy) {
        return NextResponse.json({ error: `전략을 찾을 수 없습니다 (${inp.strategyId})` }, { status: 404 })
      }
      resolved.push({
        key: `user:${inp.strategyId}`,
        name: strategy.name,
        indicators: strategy.indicators as IndicatorConfig[],
        buyConditions: strategy.buy_conditions as ConditionGroup,
      })
    } else if (inp.preset) {
      const p = inp.preset
      if (!p.indicators || !p.buyConditions) {
        return NextResponse.json({ error: 'preset.indicators와 buyConditions가 필요합니다' }, { status: 400 })
      }
      resolved.push({
        key: `preset:${p.name || 'preset-' + i}`,
        name: p.name || `프리셋 ${i + 1}`,
        indicators: p.indicators,
        buyConditions: p.buyConditions,
      })
    } else {
      return NextResponse.json({ error: `strategies[${i}]에 strategyId 또는 preset이 필요합니다` }, { status: 400 })
    }
  }

  // 4. 기준일
  const today = new Date().toISOString().slice(0, 10)
  const targetDate = (typeof asOfDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) ? asOfDate : today
  const startDate = (() => {
    const d = new Date(targetDate)
    d.setMonth(d.getMonth() - 14)
    return d.toISOString().slice(0, 10)
  })()

  // 5. 결과 누적기
  const matchesPerStrategy: Record<string, ScreenerMatch[]> = {}
  const failedPerStrategy: Record<string, { ticker: string; market: Market; reason: string }[]> = {}
  for (const s of resolved) {
    matchesPerStrategy[s.key] = []
    failedPerStrategy[s.key] = []
  }
  const processed: { ticker: string; market: Market }[] = []

  // 6. 종목당 처리: 가격 한 번 → (옵션) 현재가 갱신 → 각 전략 평가
  const evaluateOne = async (entry: BatchTickerInput) => {
    let prices: OHLCV[]
    try {
      prices = await fetchPrices(entry.ticker, entry.market, startDate, targetDate)
    } catch (err) {
      const reason = err instanceof Error ? err.message : '가격 조회 실패'
      for (const s of resolved) failedPerStrategy[s.key].push({ ticker: entry.ticker, market: entry.market, reason })
      processed.push({ ticker: entry.ticker, market: entry.market })
      return
    }

    // realtime 모드: 마지막 봉을 현재가로 갱신/추가
    if (isRealtime) {
      try {
        const quote = await fetchCurrentQuote(entry.ticker, entry.market)
        const lastBar = prices[prices.length - 1]
        if (lastBar) {
          if (lastBar.date < targetDate) {
            // 마지막 봉이 targetDate 이전 → targetDate 캔들 추가
            prices = [
              ...prices,
              {
                date: targetDate,
                open: typeof quote.open === 'number' ? quote.open : (typeof quote.previousClose === 'number' ? quote.previousClose : quote.price),
                high: typeof quote.high === 'number' ? quote.high : quote.price,
                low: typeof quote.low === 'number' ? quote.low : quote.price,
                close: quote.price,
                volume: 0,
              },
            ]
          } else {
            // 마지막 봉이 targetDate → close를 현재가로 덮어쓰기
            const updated: OHLCV = {
              date: lastBar.date,
              open: typeof quote.open === 'number' ? quote.open : lastBar.open,
              high: typeof quote.high === 'number' ? Math.max(lastBar.high, quote.high) : lastBar.high,
              low: typeof quote.low === 'number' ? Math.min(lastBar.low, quote.low) : lastBar.low,
              close: quote.price,
              volume: lastBar.volume,
            }
            prices = [...prices.slice(0, -1), updated]
          }
        }
      } catch {
        // 현재가 조회 실패해도 일봉으로 평가 진행 (로깅 생략)
      }
    }

    if (prices.length < 30) {
      for (const s of resolved) failedPerStrategy[s.key].push({
        ticker: entry.ticker, market: entry.market, reason: `데이터 부족 (${prices.length}일)`,
      })
      processed.push({ ticker: entry.ticker, market: entry.market })
      return
    }

    const lastBarIdx = prices.length - 1
    const lastBar = prices[lastBarIdx]

    for (const s of resolved) {
      try {
        const indicatorResults = calculateIndicators(prices, s.indicators)
        const result = evaluateConditionTreeWithMatches(s.buyConditions, {
          indicators: indicatorResults,
          barIndex: lastBarIdx,
        })
        if (!result.matched) continue

        const snapshot: Record<string, number | Record<string, number>> = {}
        for (const ind of s.indicators) {
          const values = indicatorResults[ind.id]
          if (!values) continue
          const v = values[lastBarIdx]
          if (v === undefined || v === null) continue
          if (typeof v === 'number') {
            if (!isNaN(v)) snapshot[ind.id] = round4(v)
          } else if (typeof v === 'object') {
            const obj: Record<string, number> = {}
            for (const [k, val] of Object.entries(v)) {
              if (typeof val === 'number' && !isNaN(val)) obj[k] = round4(val)
            }
            if (Object.keys(obj).length > 0) snapshot[ind.id] = obj
          }
        }

        matchesPerStrategy[s.key].push({
          ticker: entry.ticker,
          market: entry.market,
          name: entry.name,
          asOfDate: lastBar.date,
          price: lastBar.close,
          matchedConditions: result.matchedLeaves,
          indicators: snapshot,
        })
      } catch (err) {
        failedPerStrategy[s.key].push({
          ticker: entry.ticker,
          market: entry.market,
          reason: err instanceof Error ? err.message : '평가 실패',
        })
      }
    }
    processed.push({ ticker: entry.ticker, market: entry.market })
  }

  const queue = [...tickers]
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const entry = queue.shift()
      if (!entry) break
      await evaluateOne(entry)
    }
  })

  const timeoutPromise = new Promise<void>(resolve => setTimeout(resolve, BATCH_TIMEOUT_MS))
  await Promise.race([Promise.all(workers), timeoutPromise])

  // 7. 결과 조립 (matches 정렬, failed 최대 20개)
  const strategies: StrategyScreenerResult[] = resolved.map(s => {
    const matches = matchesPerStrategy[s.key]
    matches.sort((a, b) => {
      if (a.market !== b.market) return a.market.localeCompare(b.market)
      return a.ticker.localeCompare(b.ticker)
    })
    return {
      strategyKey: s.key,
      strategyName: s.name,
      matches,
      failed: failedPerStrategy[s.key].slice(0, 20),
    }
  })

  return NextResponse.json({
    data: {
      asOfDate: targetDate,
      realtime: isRealtime,
      processed,
      strategies,
    },
  })
}

function round4(n: number): number {
  if (!isFinite(n)) return 0
  return Math.round(n * 10000) / 10000
}
