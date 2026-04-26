/**
 * 전략 부합 종목 스크리너 API
 *
 * POST /api/investment/screener
 * Body: {
 *   strategyId | preset { indicators, buyConditions },
 *   asOfDate: 'YYYY-MM-DD' (기본 오늘),
 *   universe: 'KR_TOP' | 'US_TOP' | 'ALL'
 * }
 *
 * 각 종목의 가격을 조회하여 asOfDate 기준 봉의 buyConditions를 평가,
 * 매칭된 종목 리스트를 반환.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { fetchPrices } from '@/lib/stockDataService'
import { calculateIndicators } from '@/lib/indicatorEngine'
import { evaluateConditionTreeWithMatches } from '@/lib/signalEngine'
import { getUniverse, type UniverseId } from '@/lib/screenerUniverses'
import type { ConditionGroup, IndicatorConfig, Market } from '@/types/investment'

interface ScreenerMatch {
  ticker: string
  market: Market
  name: string
  asOfDate: string
  price: number
  matchedConditions: string[]
  indicators: Record<string, number | Record<string, number>>
}

const CONCURRENCY = 8 // yahoo-finance2 rate limit 고려

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

  const { strategyId, preset, asOfDate, universe = 'KR_TOP' } = body

  // 1. 전략 정보 (저장된 전략 또는 즉석 프리셋)
  let indicators: IndicatorConfig[]
  let buyConditions: ConditionGroup
  let strategyName = '전략'

  if (strategyId && typeof strategyId === 'string') {
    const supabase = getSupabaseAdmin()
    if (!supabase) return NextResponse.json({ error: 'Server error' }, { status: 500 })
    const { data: strategy } = await supabase
      .from('investment_strategies')
      .select('*')
      .eq('id', strategyId)
      .eq('user_id', userId)
      .single()
    if (!strategy) return NextResponse.json({ error: '전략을 찾을 수 없습니다' }, { status: 404 })
    indicators = strategy.indicators as IndicatorConfig[]
    buyConditions = strategy.buy_conditions as ConditionGroup
    strategyName = strategy.name
  } else if (preset && typeof preset === 'object') {
    const p = preset as { indicators?: IndicatorConfig[]; buyConditions?: ConditionGroup; name?: string }
    if (!p.indicators || !p.buyConditions) {
      return NextResponse.json({ error: 'preset.indicators와 buyConditions가 필요합니다' }, { status: 400 })
    }
    indicators = p.indicators
    buyConditions = p.buyConditions
    if (p.name) strategyName = p.name
  } else {
    return NextResponse.json({ error: 'strategyId 또는 preset 중 하나가 필요합니다' }, { status: 400 })
  }

  // 2. 기준일
  const today = new Date().toISOString().slice(0, 10)
  const targetDate = (typeof asOfDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) ? asOfDate : today

  // 3. universe
  const uni = getUniverse(universe as UniverseId)
  if (uni.entries.length === 0) {
    return NextResponse.json({ error: '유효한 종목 풀이 없습니다' }, { status: 400 })
  }

  // 4. 가격 데이터 조회 기간 (지표 워밍업 위해 14개월 전부터)
  const startDate = (() => {
    const d = new Date(targetDate)
    d.setMonth(d.getMonth() - 14)
    return d.toISOString().slice(0, 10)
  })()

  // 5. 동시성 제한 병렬 처리
  const matches: ScreenerMatch[] = []
  const failed: { ticker: string; market: Market; reason: string }[] = []
  let completed = 0

  const evaluateOne = async (entry: typeof uni.entries[number]) => {
    try {
      const prices = await fetchPrices(entry.ticker, entry.market, startDate, targetDate)
      if (prices.length < 30) {
        failed.push({ ticker: entry.ticker, market: entry.market, reason: `데이터 부족 (${prices.length}일)` })
        return
      }

      // 마지막 봉이 targetDate 이전이면 그대로 사용 (휴장일/주말 대응)
      const lastBarIdx = prices.length - 1
      const lastBar = prices[lastBarIdx]

      const indicatorResults = calculateIndicators(prices, indicators)
      const result = evaluateConditionTreeWithMatches(buyConditions, {
        indicators: indicatorResults,
        barIndex: lastBarIdx,
      })

      if (result.matched) {
        // 지표 스냅샷 빌드
        const snapshot: Record<string, number | Record<string, number>> = {}
        for (const ind of indicators) {
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

        matches.push({
          ticker: entry.ticker,
          market: entry.market,
          name: entry.name,
          asOfDate: lastBar.date,
          price: lastBar.close,
          matchedConditions: result.matchedLeaves,
          indicators: snapshot,
        })
      }
    } catch (err) {
      failed.push({
        ticker: entry.ticker,
        market: entry.market,
        reason: err instanceof Error ? err.message : '평가 실패',
      })
    } finally {
      completed++
    }
  }

  // 작은 워커 풀로 병렬 실행
  const queue = [...uni.entries]
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const entry = queue.shift()
      if (!entry) break
      await evaluateOne(entry)
    }
  })

  // 60초 안전 타임아웃
  const timeoutPromise = new Promise<void>(resolve => setTimeout(resolve, 60_000))
  await Promise.race([Promise.all(workers), timeoutPromise])

  // 결과 정렬 (시장 → 티커)
  matches.sort((a, b) => {
    if (a.market !== b.market) return a.market.localeCompare(b.market)
    return a.ticker.localeCompare(b.ticker)
  })

  return NextResponse.json({
    data: {
      strategyName,
      asOfDate: targetDate,
      universe: uni.id,
      universeLabel: uni.label,
      evaluated: completed,
      total: uni.entries.length,
      matches,
      failed: failed.slice(0, 20),
    },
  })
}

function round4(n: number): number {
  if (!isFinite(n)) return 0
  return Math.round(n * 10000) / 10000
}
