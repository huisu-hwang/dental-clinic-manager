/**
 * 백테스트 엔진
 *
 * 전략(지표 + 조건 트리 + 리스크 설정)을 과거 데이터로 시뮬레이션합니다.
 *
 * 핵심 규칙:
 * - T일 종가에서 신호 감지 → T+1일 시가에 체결 (Look-ahead Bias 방지)
 * - 수수료 반영: 매매 0.015% + 매도 세금 0.23% (국내), 매매 0% + SEC fee (미국)
 * - 손절/익절/최대보유기간 리스크 관리
 * - 60초 타임아웃 (AbortController)
 */

import type {
  OHLCV, IndicatorConfig, ConditionGroup,
  RiskSettings, Market,
  BacktestTrade, BacktestMetrics, EquityCurvePoint,
} from '@/types/investment'
import { calculateIndicators } from './indicatorEngine'
import { evaluateConditionTree, type EvaluationContext } from './signalEngine'

// ============================================
// 수수료 상수
// ============================================

const COMMISSION_RATES = {
  KR: {
    buyCommission: 0.00015,    // 매수 수수료 0.015%
    sellCommission: 0.00015,   // 매도 수수료 0.015%
    sellTax: 0.0023,           // 매도 세금 0.23% (증권거래세)
  },
  US: {
    buyCommission: 0,          // 미국 주요 브로커 무수수료
    sellCommission: 0,
    sellTax: 0.0000278,        // SEC fee (~$27.8 per million)
  },
}

// ============================================
// 타입
// ============================================

export interface BacktestParams {
  prices: OHLCV[]
  indicators: IndicatorConfig[]
  buyConditions: ConditionGroup
  sellConditions: ConditionGroup
  riskSettings: RiskSettings
  initialCapital: number
  market: Market
  ticker: string
}

export interface BuyHoldResult {
  totalReturn: number
  annualizedReturn: number
  equityCurve: EquityCurvePoint[]
}

export interface BacktestResult {
  metrics: BacktestMetrics
  trades: BacktestTrade[]
  equityCurve: EquityCurvePoint[]
  buyHold: BuyHoldResult
}

interface SimPosition {
  entryDate: string
  entryPrice: number
  quantity: number
  holdingDays: number
}

// ============================================
// 백테스트 실행
// ============================================

/**
 * 백테스트 실행
 *
 * @param params 백테스트 파라미터
 * @param signal AbortSignal (타임아웃용, 선택)
 * @returns 백테스트 결과 (메트릭 + 거래내역 + 자산곡선)
 */
export function runBacktest(params: BacktestParams, signal?: AbortSignal): BacktestResult {
  const {
    prices, indicators, buyConditions, sellConditions,
    riskSettings, initialCapital, market, ticker,
  } = params

  if (prices.length < 2) {
    return emptyResult()
  }

  // 1. 지표 계산
  const indicatorResults = calculateIndicators(prices, indicators)

  // 2. 시뮬레이션 변수
  let cash = initialCapital
  let position: SimPosition | null = null
  const trades: BacktestTrade[] = []
  const equityCurve: EquityCurvePoint[] = []
  const commissionRate = COMMISSION_RATES[market]

  // 3. 일별 시뮬레이션 (T=0은 지표 웜업용, T=1부터 신호 체결)
  for (let i = 0; i < prices.length; i++) {
    // 타임아웃 체크
    if (signal?.aborted) {
      throw new Error('백테스트가 시간 제한을 초과했습니다')
    }

    const bar = prices[i]

    // === 신호는 전일(i-1) 종가 기반, 체결은 당일(i) 시가 ===

    if (i > 0) {
      const prevCtx: EvaluationContext = {
        indicators: indicatorResults,
        barIndex: i - 1,
      }

      if (position) {
        position.holdingDays++

        // --- 매도 신호 체크 (전일 종가 기준) ---
        const sellSignal = evaluateConditionTree(sellConditions, prevCtx)

        // 손절 / 익절 / 최대 보유기간 체크
        const currentPnlPercent = ((bar.open - position.entryPrice) / position.entryPrice) * 100
        const stopLoss = riskSettings.stopLossPercent > 0 && currentPnlPercent <= -riskSettings.stopLossPercent
        const takeProfit = riskSettings.takeProfitPercent > 0 && currentPnlPercent >= riskSettings.takeProfitPercent
        const maxHolding = riskSettings.maxHoldingDays > 0 && position.holdingDays >= riskSettings.maxHoldingDays

        if (sellSignal || stopLoss || takeProfit || maxHolding) {
          // 당일 시가에 매도 체결
          const exitPrice = bar.open
          const sellAmount = exitPrice * position.quantity
          const sellFee = sellAmount * (commissionRate.sellCommission + commissionRate.sellTax)
          const pnl = (exitPrice - position.entryPrice) * position.quantity - sellFee
            - (position.entryPrice * position.quantity * commissionRate.buyCommission) // 매수 수수료 차감

          cash += sellAmount - sellFee

          trades.push({
            entryDate: position.entryDate,
            exitDate: bar.date,
            ticker,
            direction: 'buy',
            entryPrice: position.entryPrice,
            exitPrice,
            quantity: position.quantity,
            pnl,
            pnlPercent: ((exitPrice - position.entryPrice) / position.entryPrice) * 100,
            holdingDays: position.holdingDays,
          })

          position = null
        }
      } else {
        // --- 매수 신호 체크 (전일 종가 기준) ---
        const buySignal = evaluateConditionTree(buyConditions, prevCtx)

        if (buySignal) {
          // 당일 시가에 매수 체결
          const entryPrice = bar.open
          // 리스크 설정: 종목당 최대 비중
          const maxInvestment = cash * (riskSettings.maxPositionSizePercent / 100)
          const investAmount = Math.min(cash, maxInvestment)
          const buyFee = investAmount * commissionRate.buyCommission
          const affordableAmount = investAmount - buyFee
          const quantity = Math.floor(affordableAmount / entryPrice)

          if (quantity > 0) {
            const totalCost = entryPrice * quantity + (entryPrice * quantity * commissionRate.buyCommission)
            cash -= totalCost

            position = {
              entryDate: bar.date,
              entryPrice,
              quantity,
              holdingDays: 0,
            }
          }
        }
      }
    }

    // 자산 곡선 기록
    const positionValue = position ? position.quantity * bar.close : 0
    const totalEquity = cash + positionValue
    equityCurve.push({
      date: bar.date,
      value: Math.round(totalEquity),
    })
  }

  // 4. 마지막 봉에서 미청산 포지션 강제 청산
  if (position && prices.length > 0) {
    const lastBar = prices[prices.length - 1]
    const exitPrice = lastBar.close
    const sellAmount = exitPrice * position.quantity
    const sellFee = sellAmount * (commissionRate.sellCommission + commissionRate.sellTax)
    const pnl = (exitPrice - position.entryPrice) * position.quantity - sellFee
      - (position.entryPrice * position.quantity * commissionRate.buyCommission)

    cash += sellAmount - sellFee

    trades.push({
      entryDate: position.entryDate,
      exitDate: lastBar.date,
      ticker,
      direction: 'buy',
      entryPrice: position.entryPrice,
      exitPrice,
      quantity: position.quantity,
      pnl,
      pnlPercent: ((exitPrice - position.entryPrice) / position.entryPrice) * 100,
      holdingDays: position.holdingDays,
    })
  }

  // 5. 메트릭 계산
  const metrics = calculateMetrics(trades, equityCurve, initialCapital)

  // 6. Buy & Hold 비교 계산
  const buyHold = calculateBuyHold(prices, initialCapital, commissionRate)

  return { metrics, trades, equityCurve, buyHold }
}

// ============================================
// 메트릭 계산
// ============================================

function calculateMetrics(
  trades: BacktestTrade[],
  equityCurve: EquityCurvePoint[],
  initialCapital: number
): BacktestMetrics {
  if (trades.length === 0) {
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      winRate: 0,
      totalTrades: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
      avgHoldingDays: 0,
    }
  }

  const finalEquity = equityCurve[equityCurve.length - 1]?.value ?? initialCapital
  const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100

  // 연환산 수익률 (CAGR)
  const tradingDays = equityCurve.length
  const years = tradingDays / 252
  const annualizedReturn = years > 0
    ? (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100
    : 0

  // MDD (Maximum Drawdown)
  const maxDrawdown = calculateMaxDrawdown(equityCurve)

  // 승/패 분류
  const wins = trades.filter(t => t.pnl > 0)
  const losses = trades.filter(t => t.pnl <= 0)
  const winRate = (wins.length / trades.length) * 100

  // Profit Factor
  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0)
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0))
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0

  // 평균 수익/손실
  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0

  // 연속 승/패
  let maxConsecutiveWins = 0
  let maxConsecutiveLosses = 0
  let currentWins = 0
  let currentLosses = 0
  for (const trade of trades) {
    if (trade.pnl > 0) {
      currentWins++
      currentLosses = 0
      maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWins)
    } else {
      currentLosses++
      currentWins = 0
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses)
    }
  }

  // 평균 보유 기간
  const avgHoldingDays = trades.reduce((sum, t) => sum + t.holdingDays, 0) / trades.length

  // Sharpe Ratio (일별 수익률 기반)
  const sharpeRatio = calculateSharpeRatio(equityCurve)

  return {
    totalReturn: round4(totalReturn),
    annualizedReturn: round4(annualizedReturn),
    maxDrawdown: round4(maxDrawdown),
    sharpeRatio: round4(sharpeRatio),
    winRate: round4(winRate),
    totalTrades: trades.length,
    profitFactor: round4(profitFactor),
    avgWin: Math.round(avgWin),
    avgLoss: Math.round(avgLoss),
    maxConsecutiveWins,
    maxConsecutiveLosses,
    avgHoldingDays: round4(avgHoldingDays),
  }
}

function calculateMaxDrawdown(equityCurve: EquityCurvePoint[]): number {
  if (equityCurve.length === 0) return 0

  let peak = equityCurve[0].value
  let maxDD = 0

  for (const point of equityCurve) {
    if (point.value > peak) peak = point.value
    const dd = ((peak - point.value) / peak) * 100
    if (dd > maxDD) maxDD = dd
  }

  return maxDD
}

function calculateSharpeRatio(equityCurve: EquityCurvePoint[]): number {
  if (equityCurve.length < 2) return 0

  // 일별 수익률 계산
  const dailyReturns: number[] = []
  for (let i = 1; i < equityCurve.length; i++) {
    const ret = (equityCurve[i].value - equityCurve[i - 1].value) / equityCurve[i - 1].value
    dailyReturns.push(ret)
  }

  if (dailyReturns.length === 0) return 0

  const avgReturn = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
  const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length
  const stdDev = Math.sqrt(variance)

  if (stdDev === 0) return 0

  // 연환산 Sharpe (무위험 수익률 = 3.5% / 252일)
  const dailyRiskFreeRate = 0.035 / 252
  return ((avgReturn - dailyRiskFreeRate) / stdDev) * Math.sqrt(252)
}

// ============================================
// 유틸
// ============================================

function round4(n: number): number {
  if (!isFinite(n)) return 0
  return Math.round(n * 10000) / 10000
}

/**
 * Buy & Hold 수익률 계산
 * 첫날 시가에 전액 매수 → 마지막날 종가에 매도
 */
function calculateBuyHold(
  prices: OHLCV[],
  initialCapital: number,
  commissionRate: { buyCommission: number; sellCommission: number; sellTax: number }
): BuyHoldResult {
  if (prices.length < 2) {
    return { totalReturn: 0, annualizedReturn: 0, equityCurve: [] }
  }

  const entryPrice = prices[0].open
  const buyFee = initialCapital * commissionRate.buyCommission
  const quantity = Math.floor((initialCapital - buyFee) / entryPrice)

  if (quantity <= 0) {
    return { totalReturn: 0, annualizedReturn: 0, equityCurve: [] }
  }

  const investedAmount = quantity * entryPrice
  const remainingCash = initialCapital - investedAmount - (investedAmount * commissionRate.buyCommission)

  // 일별 자산곡선
  const equityCurve: EquityCurvePoint[] = prices.map(bar => ({
    date: bar.date,
    value: Math.round(remainingCash + quantity * bar.close),
  }))

  // 최종 매도
  const lastPrice = prices[prices.length - 1].close
  const sellAmount = quantity * lastPrice
  const sellFee = sellAmount * (commissionRate.sellCommission + commissionRate.sellTax)
  const finalEquity = remainingCash + sellAmount - sellFee

  const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100
  const years = prices.length / 252
  const annualizedReturn = years > 0
    ? (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100
    : 0

  return {
    totalReturn: round4(totalReturn),
    annualizedReturn: round4(annualizedReturn),
    equityCurve,
  }
}

function emptyResult(): BacktestResult {
  return {
    metrics: {
      totalReturn: 0,
      annualizedReturn: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      winRate: 0,
      totalTrades: 0,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
      avgHoldingDays: 0,
    },
    trades: [],
    equityCurve: [],
    buyHold: { totalReturn: 0, annualizedReturn: 0, equityCurve: [] },
  }
}
