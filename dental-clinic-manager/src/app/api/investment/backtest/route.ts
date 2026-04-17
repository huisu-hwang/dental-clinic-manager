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
import type { Market, ConditionGroup, IndicatorConfig, RiskSettings } from '@/types/investment'

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

  const { strategyId, ticker, market, startDate, endDate, initialCapital } = body

  // 입력 검증
  if (!strategyId || typeof strategyId !== 'string') {
    return NextResponse.json({ error: '전략 ID가 필요합니다' }, { status: 400 })
  }
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

  // 전략 조회 (소유권 확인)
  const { data: strategy } = await supabase
    .from('investment_strategies')
    .select('*')
    .eq('id', strategyId)
    .eq('user_id', userId)
    .single()

  if (!strategy) {
    return NextResponse.json({ error: '전략을 찾을 수 없습니다' }, { status: 404 })
  }

  // 동시 백테스트 제한 (사용자당 최대 10개)
  const { count } = await supabase
    .from('backtest_runs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['pending', 'running'])

  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: '동시 백테스트는 최대 10개까지 가능합니다' }, { status: 429 })
  }

  // 기간 확인 (3년 이하만 동기 처리)
  const daysDiff = Math.ceil(
    (new Date(endDate as string).getTime() - new Date(startDate as string).getTime()) / (1000 * 60 * 60 * 24)
  )

  if (daysDiff > 365 * 3) {
    // 3년 초과: 비동기 처리 (워커에 위임)
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
        status: 'pending',
      })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: '백테스트 생성 실패' }, { status: 500 })
    }

    return NextResponse.json({
      data: { id: run.id, status: 'pending', message: '장기 백테스트는 워커에서 처리됩니다' },
    }, { status: 202 })
  }

  // 3년 이하: 동기 처리 (60초 이내)
  try {
    // 1. 주가 데이터 조회
    const prices = await fetchPrices(
      ticker as string,
      market as Market,
      startDate as string,
      endDate as string,
    )

    if (prices.length < 20) {
      return NextResponse.json({ error: '데이터가 부족합니다 (최소 20거래일)' }, { status: 400 })
    }

    // 2. 백테스트 실행 (60초 타임아웃)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000) // Vercel 60초 제한 대비 55초

    const result = runBacktest({
      prices,
      indicators: strategy.indicators as IndicatorConfig[],
      buyConditions: strategy.buy_conditions as ConditionGroup,
      sellConditions: strategy.sell_conditions as ConditionGroup,
      riskSettings: strategy.risk_settings as RiskSettings,
      initialCapital: capital,
      market: market as Market,
      ticker: ticker as string,
    }, controller.signal)

    clearTimeout(timeout)

    // 3. 결과 저장
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
      // 저장 실패해도 결과는 반환
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
