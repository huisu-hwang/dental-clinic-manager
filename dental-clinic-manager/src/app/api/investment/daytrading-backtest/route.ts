/**
 * 단타(Day Trading) 백테스트 API
 *
 * POST /api/investment/daytrading-backtest
 *
 * Body 옵션 1 (저장된 전략 사용):
 *   { strategyId, ticker, market, timeframe, startDate?, endDate?, initialCapital? }
 *
 * Body 옵션 2 (즉석 전략 - 프리셋 직접 전달):
 *   { preset: { indicators, buyConditions, sellConditions, riskSettings },
 *     ticker, market, timeframe, startDate?, endDate?, initialCapital? }
 *
 * 단타는 자주 다양한 프리셋을 즉석에서 시험하므로 옵션 2가 권장됨.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { runDayTradingBacktest } from '@/lib/dayTradingBacktestEngine'
import { fetchIntradayPrices, type IntradayTimeframe } from '@/lib/intradayDataService'
import type { Market, ConditionGroup, IndicatorConfig, RiskSettings } from '@/types/investment'

const VALID_TIMEFRAMES: IntradayTimeframe[] = ['1m', '5m', '15m']
const BAR_MINUTES: Record<IntradayTimeframe, number> = { '1m': 1, '5m': 5, '15m': 15 }

const DEFAULT_RISK: RiskSettings = {
  maxDailyLossPercent: 5,
  maxPositions: 1,
  maxPositionSizePercent: 100,
  stopLossPercent: 1.5,
  takeProfitPercent: 3,
  maxHoldingDays: 12,
}

interface PresetBody {
  indicators?: IndicatorConfig[]
  buyConditions?: ConditionGroup
  sellConditions?: ConditionGroup
  riskSettings?: Partial<RiskSettings>
}

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

  const { strategyId, preset, ticker, market, timeframe, startDate, endDate, initialCapital } = body

  if (!ticker || typeof ticker !== 'string') {
    return NextResponse.json({ error: '종목 코드가 필요합니다' }, { status: 400 })
  }
  if (market !== 'KR' && market !== 'US') {
    return NextResponse.json({ error: '올바른 시장을 선택해주세요' }, { status: 400 })
  }
  if (typeof timeframe !== 'string' || !VALID_TIMEFRAMES.includes(timeframe as IntradayTimeframe)) {
    return NextResponse.json({ error: 'timeframe은 1m, 5m, 15m 중 하나여야 합니다' }, { status: 400 })
  }
  const tf = timeframe as IntradayTimeframe
  const capital = typeof initialCapital === 'number' && initialCapital > 0 ? initialCapital : 10_000_000

  // 전략 정보 결정 (저장된 전략 또는 프리셋)
  let indicators: IndicatorConfig[]
  let buyConditions: ConditionGroup
  let sellConditions: ConditionGroup
  let riskSettings: RiskSettings

  if (strategyId && typeof strategyId === 'string') {
    const supabase = getSupabaseAdmin()
    if (!supabase) return NextResponse.json({ error: 'Server error' }, { status: 500 })

    const { data: strategy } = await supabase
      .from('investment_strategies')
      .select('*')
      .eq('id', strategyId)
      .eq('user_id', userId)
      .single()

    if (!strategy) {
      return NextResponse.json({ error: '전략을 찾을 수 없습니다' }, { status: 404 })
    }

    indicators = strategy.indicators as IndicatorConfig[]
    buyConditions = strategy.buy_conditions as ConditionGroup
    sellConditions = strategy.sell_conditions as ConditionGroup
    riskSettings = strategy.risk_settings as RiskSettings
  } else if (preset && typeof preset === 'object') {
    const p = preset as PresetBody
    if (!p.indicators || !p.buyConditions || !p.sellConditions) {
      return NextResponse.json({
        error: 'preset에는 indicators, buyConditions, sellConditions가 필요합니다',
      }, { status: 400 })
    }
    indicators = p.indicators
    buyConditions = p.buyConditions
    sellConditions = p.sellConditions
    riskSettings = { ...DEFAULT_RISK, ...(p.riskSettings || {}) }
  } else {
    return NextResponse.json({ error: 'strategyId 또는 preset 중 하나가 필요합니다' }, { status: 400 })
  }

  try {
    const prices = await fetchIntradayPrices({
      ticker: ticker as string,
      market: market as Market,
      timeframe: tf,
      startDate: typeof startDate === 'string' ? startDate : undefined,
      endDate: typeof endDate === 'string' ? endDate : undefined,
    })

    if (prices.length < 20) {
      return NextResponse.json({
        error: `${ticker} ${tf} 분봉 데이터가 부족합니다 (${prices.length}봉, 최소 20봉 필요).`,
      }, { status: 400 })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000)

    const result = runDayTradingBacktest({
      prices,
      indicators,
      buyConditions,
      sellConditions,
      riskSettings,
      initialCapital: capital,
      market: market as Market,
      ticker: ticker as string,
      barMinutes: BAR_MINUTES[tf],
      forceCloseAtSessionEnd: true,
    }, controller.signal)

    clearTimeout(timeout)

    return NextResponse.json({
      data: {
        ...result,
        meta: {
          timeframe: tf,
          totalBars: prices.length,
          firstBar: prices[0]?.date,
          lastBar: prices[prices.length - 1]?.date,
        },
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '단타 백테스트 실행 실패'
    console.error('[daytrading-backtest] 오류:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
