/**
 * 백테스트 API
 *
 * POST /api/investment/backtest - 백테스트 실행
 * GET  /api/investment/backtest?id=xxx - 결과 조회
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { runBacktest } from '@/lib/backtestEngine'
import { fetchPrices } from '@/lib/stockDataService'
import { runRLBacktest } from '@/lib/rlBacktestService'
import type { Market, ConditionGroup, IndicatorConfig, RiskSettings } from '@/types/investment'
import type { RLModel } from '@/types/rlTrading'

// ============================================
// POST - 백테스트 실행
// ============================================

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const userId = auth.user!.id

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다' }, { status: 400 })
  }

  const { strategyId, preset, ticker, market, startDate, endDate, initialCapital, useFullCapital } = body

  if (!ticker || typeof ticker !== 'string') {
    return NextResponse.json({ error: '종목 코드가 필요합니다' }, { status: 400 })
  }
  if (market !== 'KR' && market !== 'US') {
    return NextResponse.json({ error: '올바른 시장을 선택해주세요' }, { status: 400 })
  }
  if (!startDate || !endDate || typeof startDate !== 'string' || typeof endDate !== 'string') {
    return NextResponse.json({ error: '시작일과 종료일이 필요합니다' }, { status: 400 })
  }
  const capital = typeof initialCapital === 'number' && initialCapital > 0
    ? initialCapital
    : 10_000_000 // 기본 1천만원

  // 전략 정보: 저장된 전략 또는 즉석 프리셋
  let indicators: IndicatorConfig[]
  let buyConditions: ConditionGroup
  let sellConditions: ConditionGroup
  let riskSettings: RiskSettings
  let saveResult = true  // strategyId 모드에선 결과 저장, preset 모드에선 미저장

  const DEFAULT_RISK: RiskSettings = {
    maxDailyLossPercent: 2,
    maxPositions: 5,
    maxPositionSizePercent: 20,
    stopLossPercent: 7,
    takeProfitPercent: 15,
    maxHoldingDays: 30,
  }

  if (strategyId && typeof strategyId === 'string') {
    const { data: strategy } = await supabase
      .from('investment_strategies')
      .select('*')
      .eq('id', strategyId)
      .eq('user_id', userId)
      .single()

    if (!strategy) {
      return NextResponse.json({ error: '전략을 찾을 수 없습니다' }, { status: 404 })
    }

    // RL 전략은 portfolio 단위 백테스트 → rl-inference-server로 위임
    if (strategy.strategy_type === 'rl_portfolio' || strategy.strategy_type === 'rl_single') {
      if (strategy.strategy_type === 'rl_single') {
        return NextResponse.json({
          error: 'rl_single 전략의 백테스트는 Phase 1에서 지원되지 않습니다',
        }, { status: 400 })
      }
      if (!strategy.rl_model_id) {
        return NextResponse.json({ error: 'RL 전략에 모델이 연결되지 않았습니다' }, { status: 400 })
      }
      const { data: model } = await supabase
        .from('rl_models')
        .select('*')
        .eq('id', strategy.rl_model_id)
        .single()
      if (!model) {
        return NextResponse.json({ error: 'RL 모델을 찾을 수 없습니다' }, { status: 404 })
      }
      try {
        const rl = await runRLBacktest({
          model: model as RLModel,
          startDate: startDate as string,
          endDate: endDate as string,
          initialCapital: capital,
        })
        const { data: run, error: insertError } = await supabase
          .from('backtest_runs')
          .insert({
            strategy_id: strategyId,
            user_id: userId,
            ticker: 'PORTFOLIO',  // RL portfolio는 단일 종목 아님
            market: market as string,
            start_date: startDate as string,
            end_date: endDate as string,
            initial_capital: capital,
            status: 'completed',
            total_return: rl.total_return,
            annualized_return: 0,  // 별도 계산 X
            max_drawdown: rl.max_drawdown,
            sharpe_ratio: rl.sharpe_ratio,
            win_rate: 0,
            total_trades: rl.n_rebalances,  // rebalance 횟수를 trade로 표기
            profit_factor: 0,
            equity_curve: rl.equity_curve as unknown as object,
            trades: [] as unknown as object,  // RL portfolio엔 개별 trade 개념 없음
            full_metrics: {
              kind: 'rl_portfolio',
              n_rebalances: rl.n_rebalances,
              rl_metadata: rl.rl_metadata,
            } as unknown as object,
            completed_at: new Date().toISOString(),
          })
          .select()
          .single()
        if (insertError) {
          console.error('RL 백테스트 결과 저장 실패:', insertError)
          return NextResponse.json({ data: { ...rl, saved: false } })
        }
        return NextResponse.json({ data: { ...run, ...rl } })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'RL 백테스트 실행 실패'
        console.error('RL 백테스트 오류:', msg)
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    }

    indicators = strategy.indicators as IndicatorConfig[]
    buyConditions = strategy.buy_conditions as ConditionGroup
    sellConditions = strategy.sell_conditions as ConditionGroup
    riskSettings = strategy.risk_settings as RiskSettings
  } else if (preset && typeof preset === 'object') {
    const p = preset as {
      indicators?: IndicatorConfig[]
      buyConditions?: ConditionGroup
      sellConditions?: ConditionGroup
      riskSettings?: Partial<RiskSettings>
    }
    if (!p.indicators || !p.buyConditions || !p.sellConditions) {
      return NextResponse.json({
        error: 'preset에는 indicators, buyConditions, sellConditions가 필요합니다',
      }, { status: 400 })
    }
    indicators = p.indicators
    buyConditions = p.buyConditions
    sellConditions = p.sellConditions
    riskSettings = { ...DEFAULT_RISK, ...(p.riskSettings || {}) }
    saveResult = false
  } else {
    return NextResponse.json({ error: 'strategyId 또는 preset 중 하나가 필요합니다' }, { status: 400 })
  }

  // 동시 백테스트 제한 (저장된 전략에만 적용)
  if (saveResult) {
    const { count } = await supabase
      .from('backtest_runs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['pending', 'running'])

    if ((count ?? 0) >= 10) {
      return NextResponse.json({ error: '동시 백테스트는 최대 10개까지 가능합니다' }, { status: 429 })
    }
  }

  try {
    const prices = await fetchPrices(
      ticker as string,
      market as Market,
      startDate as string,
      endDate as string,
    )

    if (prices.length < 20) {
      return NextResponse.json({
        error: `${ticker} 데이터가 부족합니다 (${prices.length}거래일, 최소 20거래일 필요). 종목 코드와 기간을 확인해주세요.`
      }, { status: 400 })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000)

    const result = runBacktest({
      prices,
      indicators,
      buyConditions,
      sellConditions,
      riskSettings,
      initialCapital: capital,
      market: market as Market,
      ticker: ticker as string,
      useFullCapital: useFullCapital === true,
    }, controller.signal)

    clearTimeout(timeout)

    // preset 모드는 결과 저장 안 함 (즉석 비교용)
    if (!saveResult) {
      return NextResponse.json({ data: { ...result, saved: false } })
    }

    // 저장된 전략 모드: backtest_runs에 결과 저장
    const { data: run, error } = await supabase
      .from('backtest_runs')
      .insert({
        strategy_id: strategyId,
        user_id: userId,
        ticker: ticker as string,
        market: market as string,
        start_date: startDate as string,
        end_date: endDate as string,
        initial_capital: capital,
        status: 'completed',
        total_return: result.metrics.totalReturn,
        annualized_return: result.metrics.annualizedReturn,
        max_drawdown: result.metrics.maxDrawdown,
        sharpe_ratio: result.metrics.sharpeRatio,
        win_rate: result.metrics.winRate,
        total_trades: result.metrics.totalTrades,
        profit_factor: result.metrics.profitFactor,
        equity_curve: result.equityCurve as unknown as object,
        trades: result.trades as unknown as object,
        full_metrics: result.metrics as unknown as object,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('백테스트 결과 저장 실패:', error)
      return NextResponse.json({ data: { ...result, saved: false } })
    }

    return NextResponse.json({ data: { ...run, ...result } })
  } catch (err) {
    const message = err instanceof Error ? err.message : '백테스트 실행 실패'
    console.error('백테스트 실행 오류:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ============================================
// GET - 백테스트 결과 조회
// ============================================

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const userId = auth.user!.id

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const strategyId = searchParams.get('strategyId')

  if (id) {
    // 단일 결과 조회
    const { data, error } = await supabase
      .from('backtest_runs')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: '결과를 찾을 수 없습니다' }, { status: 404 })
    }

    return NextResponse.json({ data })
  }

  if (strategyId) {
    // 전략별 결과 목록
    const { data, error } = await supabase
      .from('backtest_runs')
      .select('*')
      .eq('strategy_id', strategyId)
      .eq('user_id', userId)
      .order('executed_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: '조회 실패' }, { status: 500 })
    }

    return NextResponse.json({ data })
  }

  return NextResponse.json({ error: 'id 또는 strategyId 파라미터가 필요합니다' }, { status: 400 })
}
