/**
 * 전략 부합 종목 스크리너 API
 *
 * POST /api/investment/screener
 * Body: {
 *   strategies?: Array<{ strategyId?, preset? }>  // 다중 (권장)
 *   strategyId?, preset?                          // 단일 (하위 호환)
 *   asOfDate: 'YYYY-MM-DD' (기본 오늘),
 *   universe: 'KR_TOP' | 'US_TOP' | 'ALL'
 * }
 *
 * 종목당 가격은 한 번만 조회하고 모든 전략에 대해 매수 조건을 평가하여
 * 호출 효율을 극대화. 결과는 전략별 섹션으로 분리되어 반환.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { fetchPrices } from '@/lib/stockDataService'
import { calculateIndicators } from '@/lib/indicatorEngine'
import { evaluateConditionTreeWithMatches } from '@/lib/signalEngine'
import { getUniverse, type UniverseId } from '@/lib/screenerUniverses'
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

const CONCURRENCY = 8

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

  const { asOfDate, universe = 'KR_TOP' } = body

  // 1. 전략 목록 정규화 (단일/다중 모두 수용)
  const inputs: { strategyId?: string; preset?: { name?: string; indicators?: IndicatorConfig[]; buyConditions?: ConditionGroup } }[] = []
  if (Array.isArray(body.strategies)) {
    inputs.push(...(body.strategies as typeof inputs))
  } else if (body.strategyId || body.preset) {
    inputs.push({
      strategyId: typeof body.strategyId === 'string' ? body.strategyId : undefined,
      preset: typeof body.preset === 'object' ? body.preset as { name?: string; indicators?: IndicatorConfig[]; buyConditions?: ConditionGroup } : undefined,
    })
  }
  if (inputs.length === 0) {
    return NextResponse.json({ error: '평가할 전략이 1개 이상 필요합니다' }, { status: 400 })
  }
  if (inputs.length > 10) {
    return NextResponse.json({ error: '한 번에 최대 10개 전략까지 동시 스캔 가능합니다' }, { status: 400 })
  }

  // 2. 전략 정보 조회 (저장된 전략은 DB에서, 프리셋은 그대로)
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
    }
  }

  // 3. 기준일 / universe
  const today = new Date().toISOString().slice(0, 10)
  const targetDate = (typeof asOfDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) ? asOfDate : today
  const uni = getUniverse(universe as UniverseId)
  if (uni.entries.length === 0) {
    return NextResponse.json({ error: '유효한 종목 풀이 없습니다' }, { status: 400 })
  }

  const startDate = (() => {
    const d = new Date(targetDate)
    d.setMonth(d.getMonth() - 14)
    return d.toISOString().slice(0, 10)
  })()

  // 4. 결과 누적기 (전략별)
  const matchesPerStrategy: Record<string, ScreenerMatch[]> = {}
  const failedPerStrategy: Record<string, { ticker: string; market: Market; reason: string }[]> = {}
  for (const s of resolved) {
    matchesPerStrategy[s.key] = []
    failedPerStrategy[s.key] = []
  }
  let completed = 0

  // 5. 종목당 처리: 가격 한 번 → 각 전략 평가
  const evaluateOne = async (entry: typeof uni.entries[number]) => {
    let prices: OHLCV[]
    try {
      prices = await fetchPrices(entry.ticker, entry.market, startDate, targetDate)
    } catch (err) {
      const reason = err instanceof Error ? err.message : '가격 조회 실패'
      for (const s of resolved) failedPerStrategy[s.key].push({ ticker: entry.ticker, market: entry.market, reason })
      completed++
      return
    }
    if (prices.length < 30) {
      for (const s of resolved) failedPerStrategy[s.key].push({
        ticker: entry.ticker, market: entry.market, reason: `데이터 부족 (${prices.length}일)`,
      })
      completed++
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
    completed++
  }

  const queue = [...uni.entries]
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const entry = queue.shift()
      if (!entry) break
      await evaluateOne(entry)
    }
  })

  const timeoutPromise = new Promise<void>(resolve => setTimeout(resolve, 60_000))
  await Promise.race([Promise.all(workers), timeoutPromise])

  // 6. 결과 조립
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
      universe: uni.id,
      universeLabel: uni.label,
      evaluated: completed,
      total: uni.entries.length,
      strategies,
    },
  })
}

function round4(n: number): number {
  if (!isFinite(n)) return 0
  return Math.round(n * 10000) / 10000
}
