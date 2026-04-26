/**
 * 종목 분석 → 전략 추천 API
 *
 * POST /api/investment/recommend-strategy
 * Body: { ticker, market, mode: 'rule' | 'hybrid' | 'backtest' }
 *
 * - rule: 시장 단계 분류 + 룰 매칭만 (~1초)
 * - hybrid: 룰로 상위 5개 후보 → 미니 백테스트로 최종 검증 (~10~20초)
 * - backtest: 모든 프리셋(단타 제외) 미니 백테스트 (~30초+)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { fetchPrices } from '@/lib/stockDataService'
import { runBacktest } from '@/lib/backtestEngine'
import { analyzeMarket, scoreStrategyForRegime } from '@/lib/marketRegime'
import { PRESET_STRATEGIES } from '@/components/Investment/StrategyBuilder/presets'
import { PRESET_METADATA } from '@/components/Investment/StrategyBuilder/presets-metadata'
import type {
  Market, RecommendationMode, RecommendationResult, StrategyRecommendation,
  RiskSettings,
} from '@/types/investment'

// 단타 프리셋 ID — 일봉 추천에서 제외
const DAYTRADING_PRESET_IDS = new Set(['day-vwap-bounce', 'day-orb-breakout', 'day-closing-pressure'])

const DEFAULT_RISK: RiskSettings = {
  maxDailyLossPercent: 2,
  maxPositions: 5,
  maxPositionSizePercent: 100,  // 추천 검증은 100%로 정확 비교
  stopLossPercent: 7,
  takeProfitPercent: 15,
  maxHoldingDays: 30,
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다' }, { status: 400 })
  }

  const { ticker, market, mode = 'rule' } = body
  if (!ticker || typeof ticker !== 'string') {
    return NextResponse.json({ error: '종목 코드가 필요합니다' }, { status: 400 })
  }
  if (market !== 'KR' && market !== 'US') {
    return NextResponse.json({ error: '올바른 시장(KR/US)을 선택해주세요' }, { status: 400 })
  }
  if (mode !== 'rule' && mode !== 'hybrid' && mode !== 'backtest') {
    return NextResponse.json({ error: 'mode는 rule/hybrid/backtest 중 하나여야 합니다' }, { status: 400 })
  }

  // 분석/백테스트용 데이터 — 14개월 (252봉 SMA + 분석 여유)
  const endDate = new Date().toISOString().slice(0, 10)
  const startDate = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 14)
    return d.toISOString().slice(0, 10)
  })()

  let prices
  try {
    prices = await fetchPrices(ticker, market as Market, startDate, endDate)
  } catch (err) {
    const msg = err instanceof Error ? err.message : '가격 데이터 조회 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  if (prices.length < 50) {
    return NextResponse.json({
      error: `${ticker} 데이터 부족 (${prices.length}거래일, 최소 50거래일 필요)`,
    }, { status: 400 })
  }

  // 1. 시장 분석
  let analysis
  try {
    analysis = analyzeMarket(prices, ticker, market as Market)
  } catch (err) {
    const msg = err instanceof Error ? err.message : '시장 분석 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // 2. 단타 제외한 후보 프리셋
  const candidates = PRESET_STRATEGIES.filter(p => !DAYTRADING_PRESET_IDS.has(p.id))

  // 3. 룰 기반 점수
  const ruleScored = candidates.map(p => {
    const meta = PRESET_METADATA[p.id]
    const { score, reasons } = scoreStrategyForRegime(meta?.marketConditions, analysis)
    return {
      preset: p,
      ruleScore: score,
      reasons,
    }
  })

  // 정렬 (룰 점수 내림차순)
  ruleScored.sort((a, b) => b.ruleScore - a.ruleScore)

  // 4. 모드별 처리
  const mode2 = mode as RecommendationMode

  if (mode2 === 'rule') {
    // 룰 점수 그대로 상위 3개
    const recommendations: StrategyRecommendation[] = ruleScored.slice(0, 3).map(s => ({
      presetId: s.preset.id,
      presetName: s.preset.name,
      score: s.ruleScore,
      ruleScore: s.ruleScore,
      reasons: s.reasons,
    }))
    return NextResponse.json({
      data: { analysis, mode: mode2, recommendations } satisfies RecommendationResult,
    })
  }

  // hybrid: 상위 5개만 백테스트, backtest: 전부 백테스트
  const toBacktest = mode2 === 'hybrid' ? ruleScored.slice(0, 5) : ruleScored

  // 백테스트 시작일은 6개월 전
  const btStart = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 6)
    return d.toISOString().slice(0, 10)
  })()
  const btPrices = prices.filter(p => p.date >= btStart)

  if (btPrices.length < 20) {
    // 데이터 부족으로 백테스트 불가 — 룰 결과 반환
    const recommendations = ruleScored.slice(0, 3).map(s => ({
      presetId: s.preset.id,
      presetName: s.preset.name,
      score: s.ruleScore,
      ruleScore: s.ruleScore,
      reasons: [...s.reasons, '백테스트 데이터 부족으로 룰 점수만 적용'],
    }))
    return NextResponse.json({
      data: { analysis, mode: 'rule', recommendations } satisfies RecommendationResult,
    })
  }

  const backtestResults: StrategyRecommendation[] = []
  for (const s of toBacktest) {
    try {
      const result = runBacktest({
        prices: btPrices,
        indicators: s.preset.indicators,
        buyConditions: s.preset.buyConditions,
        sellConditions: s.preset.sellConditions,
        riskSettings: { ...DEFAULT_RISK, ...(s.preset.riskSettings || {}) },
        initialCapital: 10_000_000,
        market: market as Market,
        ticker,
        useFullCapital: true,
      })
      const m = result.metrics
      // 통합 점수: 룰 60% + 수익률 40%
      // 수익률을 0~100 스케일로 — totalReturn 0% = 50점, 30%이상 = 100점, -30%이하 = 0점
      const returnScore = Math.max(0, Math.min(100, 50 + (m.totalReturn / 30) * 50))
      const combined = Math.round(s.ruleScore * 0.6 + returnScore * 0.4)
      const reasons = [...s.reasons]
      if (m.totalTrades > 0) {
        reasons.push(`6개월 백테스트: ${m.totalReturn > 0 ? '+' : ''}${m.totalReturn.toFixed(2)}%, 거래 ${m.totalTrades}건, 승률 ${m.winRate.toFixed(0)}%`)
      } else {
        reasons.push('6개월 백테스트: 매매 신호 없음')
      }
      backtestResults.push({
        presetId: s.preset.id,
        presetName: s.preset.name,
        score: combined,
        ruleScore: s.ruleScore,
        backtest: {
          totalReturn: m.totalReturn,
          winRate: m.winRate,
          sharpeRatio: m.sharpeRatio,
          totalTrades: m.totalTrades,
        },
        reasons,
      })
    } catch (err) {
      // 한 전략 실패해도 다른 전략은 계속
      console.warn(`백테스트 실패: ${s.preset.id}`, err)
      backtestResults.push({
        presetId: s.preset.id,
        presetName: s.preset.name,
        score: s.ruleScore,
        ruleScore: s.ruleScore,
        reasons: [...s.reasons, '백테스트 실행 실패 — 룰 점수만 적용'],
      })
    }
  }

  // 통합 점수 내림차순
  backtestResults.sort((a, b) => b.score - a.score)
  const recommendations = backtestResults.slice(0, 3)

  return NextResponse.json({
    data: { analysis, mode: mode2, recommendations } satisfies RecommendationResult,
  })
}
