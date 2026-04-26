/**
 * 단타(Day Trading) 백테스트 엔진 — 분봉 전용
 *
 * 일봉 backtestEngine.ts와의 차별점:
 * 1. 입력은 분봉 OHLCV (date 필드는 'YYYY-MM-DDTHH:mm:ss' ISO 형식)
 * 2. T봉 마감 신호 → T+1봉 시가 체결 (look-ahead 방지, 동일 패턴)
 * 3. 거래일 구분(date.slice(0,10)) — 거래일 경계에서 다음 봉 진입 금지
 * 4. forceCloseAtSessionEnd=true (기본): 그날 마지막 봉에 강제 매도 (단타 본질)
 * 5. 슬리피지 강화: 단타는 호가 영향이 크므로 extraSlippageBps 추가
 *    - KR 기본 5bp(0.05%), US 기본 2bp(0.02%)
 * 6. 매수/매도는 오직 전략의 조건 트리에 의해 결정 — 손절/익절/최대보유봉수는 비활성화
 *    (장 마감 강제 청산만 단타 룰로 유지)
 * 7. avgHoldingDays 필드는 호환성 위해 유지하되 의미는 '평균 보유 봉수'
 * 8. equityCurve는 일별 종가 시점으로 집계 (BacktestMetrics 호환)
 * 9. Sharpe Ratio: 분봉 수익률 → 연 환산 (√(252 × 봉수/거래일))
 */

import type {
  OHLCV, IndicatorConfig, ConditionGroup,
  RiskSettings, Market,
  BacktestTrade, BacktestMetrics, EquityCurvePoint,
} from '@/types/investment'
import { calculateIndicators } from './indicatorEngine'
import { evaluateConditionTree, type EvaluationContext } from './signalEngine'

// ============================================
// 수수료 + 슬리피지 상수
// ============================================

const COMMISSION_RATES = {
  KR: {
    buyCommission: 0.00015,    // 매수 수수료 0.015%
    sellCommission: 0.00015,   // 매도 수수료 0.015%
    sellTax: 0.0023,           // 매도 세금 0.23% (증권거래세)
  },
  US: {
    buyCommission: 0,
    sellCommission: 0,
    sellTax: 0.0000278,        // SEC fee
  },
}

const DEFAULT_EXTRA_SLIPPAGE_BPS = {
  KR: 5,  // 0.05%
  US: 2,  // 0.02%
}

// ============================================
// 타입
// ============================================

export interface DayTradingBacktestParams {
  /** 분봉 OHLCV (date는 ISO datetime 권장) */
  prices: OHLCV[]
  indicators: IndicatorConfig[]
  buyConditions: ConditionGroup
  sellConditions: ConditionGroup
  riskSettings: RiskSettings
  initialCapital: number
  market: Market
  ticker: string
  /** 분봉 단위 (분). 기본 5 — Sharpe 연환산 계수에만 사용 */
  barMinutes?: number
  /** 장 마감 강제 청산 여부. 기본 true */
  forceCloseAtSessionEnd?: boolean
  /** 추가 슬리피지 (bps, 1bp=0.01%). 기본 KR 5bp, US 2bp */
  extraSlippageBps?: number
}

export interface BuyHoldResult {
  totalReturn: number
  finalValue: number
}

export interface DayTradingBacktestResult {
  metrics: BacktestMetrics
  trades: BacktestTrade[]
  equityCurve: EquityCurvePoint[]
  buyHold: BuyHoldResult
}

interface SimPosition {
  entryDate: string
  entryPrice: number
  quantity: number
  holdingBars: number  // 분봉 수
}

// ============================================
// 메인 백테스트 함수
// ============================================

export function runDayTradingBacktest(
  params: DayTradingBacktestParams,
  signal?: AbortSignal
): DayTradingBacktestResult {
  const {
    prices, indicators, buyConditions, sellConditions,
    riskSettings, initialCapital, market, ticker,
    barMinutes = 5,
    forceCloseAtSessionEnd = true,
  } = params
  const extraSlippageBps = params.extraSlippageBps ?? DEFAULT_EXTRA_SLIPPAGE_BPS[market]
  const slippage = extraSlippageBps / 10000  // 5bp → 0.0005

  if (prices.length < 2) {
    return emptyResult()
  }

  // 1. 지표 계산
  const indicatorResults = calculateIndicators(prices, indicators)

  // 2. 거래일 인덱스 사전 계산 (각 봉의 거래일, 그날 마지막 봉인지 여부)
  const days: string[] = prices.map(p => p.date.slice(0, 10))
  const isLastBarOfDay: boolean[] = new Array(prices.length).fill(false)
  for (let i = 0; i < prices.length; i++) {
    if (i === prices.length - 1 || days[i + 1] !== days[i]) {
      isLastBarOfDay[i] = true
    }
  }

  // 3. 시뮬레이션 변수
  let cash = initialCapital
  let position: SimPosition | null = null
  const trades: BacktestTrade[] = []
  const equityCurve: EquityCurvePoint[] = []
  const commissionRate = COMMISSION_RATES[market]

  // 일별 종가(equity 집계용): 같은 거래일의 마지막 봉 시점에만 push
  for (let i = 0; i < prices.length; i++) {
    if (signal?.aborted) {
      throw new Error('단타 백테스트가 시간 제한을 초과했습니다')
    }

    const bar = prices[i]

    // === 신호는 직전 봉(i-1) 마감 기반, 체결은 현재 봉(i) 시가 ===
    if (i > 0) {
      const prevCtx: EvaluationContext = {
        indicators: indicatorResults,
        barIndex: i - 1,
      }

      // 직전 봉이 그 거래일의 마지막 봉이었으면 다음 거래일 진입 금지
      // (장 마감 신호 → 다음 날 시가 진입은 단타 룰 위반)
      const prevWasSessionEnd = isLastBarOfDay[i - 1]

      if (position) {
        position.holdingBars++

        // 백테스트는 전략의 매도 조건으로만 청산 — 손절/익절/최대보유는 비활성화
        // (단, 장 마감 강제 청산은 단타의 본질이므로 유지)
        const sellSignal = evaluateConditionTree(sellConditions, prevCtx)

        if (sellSignal) {
          // 슬리피지 적용 (매도이므로 불리한 방향: 시가에서 더 낮은 가격)
          const exitPrice = bar.open * (1 - slippage)
          closeTrade(position, exitPrice, bar.date, ticker, commissionRate, trades)
          cash += sellAmount(exitPrice, position.quantity, commissionRate)
          position = null
        } else if (prevWasSessionEnd && forceCloseAtSessionEnd) {
          // 안전장치: 직전 봉이 마감 봉인데 거기서 청산되지 않은 케이스
          // (마감 봉 처리 로직이 정상 작동하면 도달하지 않음)
          const exitPrice = bar.open * (1 - slippage)
          closeTrade(position, exitPrice, bar.date, ticker, commissionRate, trades)
          cash += sellAmount(exitPrice, position.quantity, commissionRate)
          position = null
        }
      } else {
        // --- 매수 신호 체크 ---
        // 직전 봉이 마감 봉이면 다음 봉 = 다음 거래일 시가 → 진입 금지
        if (prevWasSessionEnd) {
          // skip
        } else {
          const buySignal = evaluateConditionTree(buyConditions, prevCtx)
          if (buySignal) {
            // 슬리피지 적용 (매수: 시가보다 더 비싸게)
            const entryPrice = bar.open * (1 + slippage)
            const maxInvestment = cash * (riskSettings.maxPositionSizePercent / 100)
            const investAmount = Math.min(cash, maxInvestment)
            const buyFee = investAmount * commissionRate.buyCommission
            const affordableAmount = investAmount - buyFee
            const quantity = Math.floor(affordableAmount / entryPrice)

            if (quantity > 0) {
              const totalCost = entryPrice * quantity + entryPrice * quantity * commissionRate.buyCommission
              cash -= totalCost
              position = {
                entryDate: bar.date,
                entryPrice,
                quantity,
                holdingBars: 0,
              }
            }
          }
        }
      }
    }

    // === 그날 마지막 봉이고 포지션 보유 중이면 그 봉 종가에 강제 청산 ===
    if (position && isLastBarOfDay[i] && forceCloseAtSessionEnd) {
      const exitPrice = bar.close * (1 - slippage)
      closeTrade(position, exitPrice, bar.date, ticker, commissionRate, trades)
      cash += sellAmount(exitPrice, position.quantity, commissionRate)
      position = null
    }

    // === 일별 자산곡선 (그날 마지막 봉에서만 기록) ===
    if (isLastBarOfDay[i]) {
      const positionValue = position ? position.quantity * bar.close : 0
      const totalEquity = cash + positionValue
      equityCurve.push({
        date: days[i],  // 일자 단위
        value: Math.round(totalEquity),
      })
    }
  }

  // 4. 마지막에 미청산 포지션이 남아있으면 강제 청산 (forceCloseAtSessionEnd=false인 경우)
  if (position && prices.length > 0) {
    const lastBar = prices[prices.length - 1]
    const exitPrice = lastBar.close * (1 - slippage)
    closeTrade(position, exitPrice, lastBar.date, ticker, commissionRate, trades)
    cash += sellAmount(exitPrice, position.quantity, commissionRate)
    position = null
  }

  // 5. 메트릭 계산
  const metrics = calculateMetrics(trades, equityCurve, initialCapital, prices, barMinutes)

  // 6. Buy & Hold 비교 (첫 봉 시가 → 마지막 봉 종가)
  const buyHold = calculateBuyHold(prices, initialCapital, commissionRate)

  return { metrics, trades, equityCurve, buyHold }
}

// ============================================
// 헬퍼: 트레이드 정산
// ============================================

function sellAmount(
  exitPrice: number,
  quantity: number,
  commissionRate: { sellCommission: number; sellTax: number }
): number {
  const gross = exitPrice * quantity
  const fee = gross * (commissionRate.sellCommission + commissionRate.sellTax)
  return gross - fee
}

function closeTrade(
  position: SimPosition,
  exitPrice: number,
  exitDate: string,
  ticker: string,
  commissionRate: { buyCommission: number; sellCommission: number; sellTax: number },
  trades: BacktestTrade[]
) {
  const grossSell = exitPrice * position.quantity
  const sellFee = grossSell * (commissionRate.sellCommission + commissionRate.sellTax)
  const buyFee = position.entryPrice * position.quantity * commissionRate.buyCommission
  const pnl = (exitPrice - position.entryPrice) * position.quantity - sellFee - buyFee

  trades.push({
    entryDate: position.entryDate,
    exitDate,
    ticker,
    direction: 'buy',
    entryPrice: position.entryPrice,
    exitPrice,
    quantity: position.quantity,
    pnl,
    pnlPercent: ((exitPrice - position.entryPrice) / position.entryPrice) * 100,
    holdingDays: position.holdingBars,  // 분봉 수 (필드명은 호환성 유지)
  })
}

// ============================================
// 메트릭 계산
// ============================================

function calculateMetrics(
  trades: BacktestTrade[],
  equityCurve: EquityCurvePoint[],
  initialCapital: number,
  prices: OHLCV[],
  barMinutes: number
): BacktestMetrics {
  if (trades.length === 0) {
    return zeroMetrics()
  }

  const finalEquity = equityCurve[equityCurve.length - 1]?.value ?? initialCapital
  const totalReturn = ((finalEquity - initialCapital) / initialCapital) * 100

  // 거래일 수 = equityCurve 포인트 수
  const tradingDays = equityCurve.length
  const years = tradingDays / 252
  const annualizedReturn = years > 0
    ? (Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100
    : 0

  const maxDrawdown = calculateMaxDrawdown(equityCurve)

  const wins = trades.filter(t => t.pnl > 0)
  const losses = trades.filter(t => t.pnl <= 0)
  const winRate = (wins.length / trades.length) * 100

  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0)
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0))
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0

  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0

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

  // avgHoldingDays 필드는 분봉 단타에서는 '평균 보유 봉수'로 해석
  const avgHoldingDays = trades.reduce((sum, t) => sum + t.holdingDays, 0) / trades.length

  // Sharpe: 일별 자산곡선 기반 (equityCurve가 일별이므로 그대로 사용)
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

  const dailyReturns: number[] = []
  for (let i = 1; i < equityCurve.length; i++) {
    if (equityCurve[i - 1].value <= 0) continue
    const ret = (equityCurve[i].value - equityCurve[i - 1].value) / equityCurve[i - 1].value
    dailyReturns.push(ret)
  }
  if (dailyReturns.length === 0) return 0

  const avgReturn = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
  const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length
  const stdDev = Math.sqrt(variance)
  if (stdDev === 0) return 0

  const dailyRiskFreeRate = 0.035 / 252
  return ((avgReturn - dailyRiskFreeRate) / stdDev) * Math.sqrt(252)
}

// ============================================
// Buy & Hold 비교
// ============================================

function calculateBuyHold(
  prices: OHLCV[],
  initialCapital: number,
  commissionRate: { buyCommission: number; sellCommission: number; sellTax: number }
): BuyHoldResult {
  if (prices.length < 2) return { totalReturn: 0, finalValue: initialCapital }

  const entryPrice = prices[0].open
  const buyFee = initialCapital * commissionRate.buyCommission
  const quantity = Math.floor((initialCapital - buyFee) / entryPrice)
  if (quantity <= 0) return { totalReturn: 0, finalValue: initialCapital }

  const investedAmount = quantity * entryPrice
  const remainingCash = initialCapital - investedAmount - investedAmount * commissionRate.buyCommission

  const lastPrice = prices[prices.length - 1].close
  const sellGross = quantity * lastPrice
  const sellFee = sellGross * (commissionRate.sellCommission + commissionRate.sellTax)
  const finalValue = remainingCash + sellGross - sellFee
  const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100

  return {
    totalReturn: round4(totalReturn),
    finalValue: Math.round(finalValue),
  }
}

// ============================================
// 유틸
// ============================================

function round4(n: number): number {
  if (!isFinite(n)) return 0
  return Math.round(n * 10000) / 10000
}

function zeroMetrics(): BacktestMetrics {
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

function emptyResult(): DayTradingBacktestResult {
  return {
    metrics: zeroMetrics(),
    trades: [],
    equityCurve: [],
    buyHold: { totalReturn: 0, finalValue: 0 },
  }
}
