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

  const { strategyId, preset, presetId, presetName, ticker, market, startDate, endDate, initialCapital, useFullCapital } = body

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
  // 모든 백테스트는 backtest_runs에 저장 (사용자 전략·프리셋 모두) — 프리셋은 strategy_id NULL + preset_id 채움

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
        // RL 응답을 일반 백테스트와 동일 shape (metrics/equityCurve/trades/buyHold) 으로 정규화 — 비교/분석 UI 호환
        // RL 서버는 비율(0.25=25%)로 반환하므로 DB·UI 규약(퍼센트)으로 환산
        const totalReturnPct = rl.total_return * 100
        const maxDrawdownPct = rl.max_drawdown * 100
        const startMs = new Date(startDate as string).getTime()
        const endMs = new Date(endDate as string).getTime()
        const years = Math.max(1 / 365, (endMs - startMs) / (1000 * 60 * 60 * 24 * 365))
        const annualizedReturnPct = (Math.pow(1 + rl.total_return, 1 / years) - 1) * 100
        const winRatePct = rl.win_rate * 100
        // 거래별 손익 합계로 profit factor 계산
        const grossProfit = rl.trades.reduce((s, t) => s + (t.pnl > 0 ? t.pnl : 0), 0)
        const grossLoss = rl.trades.reduce((s, t) => s + (t.pnl < 0 ? -t.pnl : 0), 0)
        const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0)
        const normalizedMetrics = {
          totalReturn: totalReturnPct,
          annualizedReturn: annualizedReturnPct,
          maxDrawdown: maxDrawdownPct,
          sharpeRatio: rl.sharpe_ratio,
          winRate: winRatePct,
          totalTrades: rl.trades.length,  // 실제 종목별 진입/청산 개수
          profitFactor,
        }
        const normalizedEquityCurve = rl.equity_curve.map((p) => ({
          date: p.date,
          value: p.equity,
        }))
        // 일반 백테스트의 BacktestTrade shape으로 정규화
        const normalizedTrades = rl.trades.map((t) => ({
          entryDate: t.entry_date,
          exitDate: t.exit_date,
          ticker: t.ticker,
          direction: t.direction,
          entryPrice: t.entry_price,
          exitPrice: t.exit_price,
          quantity: t.quantity,
          pnl: t.pnl,
          pnlPercent: t.pnl_percent,
          holdingDays: t.holding_days,
        }))
        // Buy & Hold 비교 (일반 백테스트의 buyHold shape에 맞춤)
        const normalizedBuyHold = {
          totalReturn: rl.buy_hold_return * 100,
          equityCurve: rl.buy_hold_curve.map((p) => ({ date: p.date, value: p.equity })),
        }
        const { data: run, error: insertError } = await supabase
          .from('backtest_runs')
          .insert({
            strategy_id: strategyId,
            user_id: userId,
            ticker: 'PORTFOLIO',
            market: market as string,
            start_date: startDate as string,
            end_date: endDate as string,
            initial_capital: capital,
            status: 'completed',
            total_return: totalReturnPct,
            annualized_return: annualizedReturnPct,
            max_drawdown: maxDrawdownPct,
            sharpe_ratio: rl.sharpe_ratio,
            win_rate: winRatePct,
            total_trades: rl.trades.length,
            profit_factor: profitFactor,
            equity_curve: normalizedEquityCurve as unknown as object,
            trades: normalizedTrades as unknown as object,
            full_metrics: {
              ...normalizedMetrics,
              kind: 'rl_portfolio',
              n_rebalances: rl.n_rebalances,
              rl_metadata: rl.rl_metadata,
              buy_hold_return: normalizedBuyHold.totalReturn,
              buy_hold_curve: normalizedBuyHold.equityCurve,
            } as unknown as object,
            completed_at: new Date().toISOString(),
          })
          .select()
          .single()
        const responsePayload = {
          metrics: normalizedMetrics,
          equityCurve: normalizedEquityCurve,
          trades: normalizedTrades,
          buyHold: normalizedBuyHold,
          rl_metadata: rl.rl_metadata,
        }
        if (insertError) {
          console.error('RL 백테스트 결과 저장 실패:', insertError)
          return NextResponse.json({ data: { ...responsePayload, saved: false } })
        }
        return NextResponse.json({ data: { ...run, ...responsePayload } })
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
  } else {
    return NextResponse.json({ error: 'strategyId 또는 preset 중 하나가 필요합니다' }, { status: 400 })
  }

  // 동시 백테스트 제한 (사용자별 전체)
  {
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

    // 초고가 종목(BRK.A ~$700k 등) 사전 검증 — 1주 매수도 불가능하면 backtest 가 빈 결과로 끝나 사용자가 원인을 알기 어려움.
    const firstPrice = prices[0].open
    if (firstPrice > 0 && firstPrice > capital) {
      return NextResponse.json({
        error: `${ticker} 1주 가격(${firstPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}) 이 초기 자본(${capital.toLocaleString()}) 보다 큽니다. 자본을 ${Math.ceil(firstPrice * 1.2).toLocaleString()} 이상으로 설정하거나 다른 종목을 선택해 주세요.`
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

    // 사용자 전략 + 프리셋 모두 backtest_runs에 저장 — 프리셋은 strategy_id NULL + preset_id 채움
    const nowIso = new Date().toISOString()
    const isPresetMode = !strategyId
    const finalPresetId = isPresetMode
      ? (typeof presetId === 'string' && presetId ? presetId : 'custom')
      : null
    const finalPresetName = isPresetMode
      ? (typeof presetName === 'string' && presetName ? presetName : '프리셋 백테스트')
      : null
    const { data: run, error } = await supabase
      .from('backtest_runs')
      .insert({
        strategy_id: isPresetMode ? null : (strategyId as string),
        preset_id: finalPresetId,
        preset_name: finalPresetName,
        user_id: userId,
        ticker: ticker as string,
        market: market as string,
        executed_at: nowIso,
        start_date: startDate as string,
        end_date: endDate as string,
        initial_capital: capital,
        status: 'completed',
        // 재현성 보장 — 백테스트 실행 시 자본 사용 옵션을 함께 저장
        use_full_capital: useFullCapital === true,
        max_position_size_percent: (riskSettings ?? DEFAULT_RISK).maxPositionSizePercent ?? 20,
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
        completed_at: nowIso,
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
  const strategyId = searchParams.get('strategyId') ?? searchParams.get('strategy_id')
  const ticker = searchParams.get('ticker')?.trim() || null
  const since = searchParams.get('since')
  const until = searchParams.get('until')
  const idsCsv = searchParams.get('ids')
  const limitRaw = searchParams.get('limit')

  // 1) 단일 결과 — 기존 호환
  if (id) {
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

  // 2) 다중 IDs (비교 view 로드용)
  if (idsCsv) {
    const ids = idsCsv.split(',').map(s => s.trim()).filter(Boolean)
    if (ids.length > 50) {
      return NextResponse.json({ error: 'ids는 최대 50개까지 가능합니다' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('backtest_runs')
      .select('*')
      .eq('user_id', userId)
      .in('id', ids)
    if (error) {
      return NextResponse.json({ error: '조회 실패' }, { status: 500 })
    }
    return NextResponse.json({ data: data ?? [] })
  }

  // 3) 필터 + 최신순 (히스토리 탭)
  // 큰 jsonb 컬럼(equity_curve / trades / full_metrics)은 리스트 뷰에서는 불필요.
  // light=1 옵션으로 페이로드를 가볍게 — 사용자 다수 세션 시 500건 × 무거운 jsonb 가
  // 응답 시간을 늘려 "조회 실패" 로 이어지던 문제 해결.
  const lightMode = searchParams.get('light') === '1'
  const lightColumns =
    'id, strategy_id, preset_id, preset_name, ticker, market, start_date, end_date, ' +
    'initial_capital, status, total_return, sharpe_ratio, max_drawdown, total_trades, ' +
    'win_rate, executed_at, investment_strategies(name, automation_level, is_active)'
  const fullColumns = '*, investment_strategies(name, automation_level, is_active)'

  // investment_strategies LEFT JOIN — 삭제된 전략의 백테스트도 strategy=null로 함께 반환
  let query = supabase
    .from('backtest_runs')
    .select(lightMode ? lightColumns : fullColumns)
    .eq('user_id', userId)
    .eq('status', 'completed')

  if (strategyId) {
    query = query.eq('strategy_id', strategyId)
  }
  if (ticker) {
    query = query.eq('ticker', ticker.toUpperCase())
  }
  if (since) {
    query = query.gte('executed_at', since)
  }
  if (until) {
    query = query.lte('executed_at', until)
  }
  const limit = Math.min(Number(limitRaw) || 50, 500)
  // executed_at desc, NULL은 뒤로 — 기존 NULL row는 백필됨
  query = query.order('executed_at', { ascending: false, nullsFirst: false }).limit(limit)

  const { data, error } = await query
  if (error) {
    // 디버깅: Supabase가 어떤 이유로 실패했는지 서버 로그 + 응답에 포함
    console.error('[backtest GET] supabase error', error)
    return NextResponse.json(
      { error: `조회 실패: ${error.message || error.code || 'unknown'}` },
      { status: 500 },
    )
  }
  return NextResponse.json({ data: data ?? [] })
}
