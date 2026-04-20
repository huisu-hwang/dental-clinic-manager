/**
 * 기술 지표 계산 엔진
 *
 * technicalindicators 라이브러리 래퍼
 * - OHLCV 데이터에서 기술 지표 계산
 * - IndicatorConfig 기반 동적 지표 선택
 * - crossOver / crossUnder 감지
 */

import {
  RSI, SMA, EMA, MACD, BollingerBands,
  Stochastic, ATR, ADX, CCI, WilliamsR,
} from 'technicalindicators'
import type { OHLCV, IndicatorConfig, IndicatorType } from '@/types/investment'

// ============================================
// 지표 계산 결과 타입
// ============================================

/** 단일 지표의 계산 결과 (날짜별) */
export interface IndicatorResult {
  /** 지표 ID (예: 'RSI_14') */
  id: string
  /** 날짜별 값 배열 (OHLCV와 동일 길이, 앞부분은 NaN) */
  values: (number | Record<string, number>)[]
}

/** 모든 지표 결과를 ID로 매핑 */
export type IndicatorResultMap = Record<string, (number | Record<string, number>)[]>

// ============================================
// 지표별 계산 함수
// ============================================

function calcRSI(prices: OHLCV[], params: Record<string, number>): number[] {
  const period = params.period || 14
  const closes = prices.map(p => p.close)
  const result = RSI.calculate({ values: closes, period })
  // RSI 결과는 period만큼 짧으므로 앞에 NaN 패딩
  return padLeft(result, prices.length)
}

function calcSMA(prices: OHLCV[], params: Record<string, number>): number[] {
  const period = params.period || 20
  const closes = prices.map(p => p.close)
  const result = SMA.calculate({ values: closes, period })
  return padLeft(result, prices.length)
}

function calcEMA(prices: OHLCV[], params: Record<string, number>): number[] {
  const period = params.period || 20
  const closes = prices.map(p => p.close)
  const result = EMA.calculate({ values: closes, period })
  return padLeft(result, prices.length)
}

function calcMACD(prices: OHLCV[], params: Record<string, number>): Record<string, number>[] {
  const fastPeriod = params.fastPeriod || 12
  const slowPeriod = params.slowPeriod || 26
  const signalPeriod = params.signalPeriod || 9
  const closes = prices.map(p => p.close)

  const result = MACD.calculate({
    values: closes,
    fastPeriod,
    slowPeriod,
    signalPeriod,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  })

  const mapped = result.map(r => ({
    macd: r.MACD ?? NaN,
    signal: r.signal ?? NaN,
    histogram: r.histogram ?? NaN,
  }))

  return padLeft(mapped, prices.length, { macd: NaN, signal: NaN, histogram: NaN })
}

function calcBB(prices: OHLCV[], params: Record<string, number>): Record<string, number>[] {
  const period = params.period || 20
  const stdDev = params.stdDev || 2
  const closes = prices.map(p => p.close)

  const result = BollingerBands.calculate({ values: closes, period, stdDev })

  const mapped = result.map(r => ({
    upper: r.upper,
    middle: r.middle,
    lower: r.lower,
  }))

  return padLeft(mapped, prices.length, { upper: NaN, middle: NaN, lower: NaN })
}

function calcStochastic(prices: OHLCV[], params: Record<string, number>): Record<string, number>[] {
  const period = params.period || 14
  const signalPeriod = params.signalPeriod || 3

  const result = Stochastic.calculate({
    high: prices.map(p => p.high),
    low: prices.map(p => p.low),
    close: prices.map(p => p.close),
    period,
    signalPeriod,
  })

  const mapped = result.map(r => ({
    k: r.k,
    d: r.d,
  }))

  return padLeft(mapped, prices.length, { k: NaN, d: NaN })
}

function calcATR(prices: OHLCV[], params: Record<string, number>): number[] {
  const period = params.period || 14
  const result = ATR.calculate({
    high: prices.map(p => p.high),
    low: prices.map(p => p.low),
    close: prices.map(p => p.close),
    period,
  })
  return padLeft(result, prices.length)
}

function calcADX(prices: OHLCV[], params: Record<string, number>): Record<string, number>[] {
  const period = params.period || 14
  const result = ADX.calculate({
    high: prices.map(p => p.high),
    low: prices.map(p => p.low),
    close: prices.map(p => p.close),
    period,
  })

  const mapped = result.map(r => ({
    adx: r.adx,
    pdi: r.pdi,
    mdi: r.mdi,
  }))

  return padLeft(mapped, prices.length, { adx: NaN, pdi: NaN, mdi: NaN })
}

function calcCCI(prices: OHLCV[], params: Record<string, number>): number[] {
  const period = params.period || 20
  const result = CCI.calculate({
    high: prices.map(p => p.high),
    low: prices.map(p => p.low),
    close: prices.map(p => p.close),
    period,
  })
  return padLeft(result, prices.length)
}

function calcWilliamsR(prices: OHLCV[], params: Record<string, number>): number[] {
  const period = params.period || 14
  const result = WilliamsR.calculate({
    high: prices.map(p => p.high),
    low: prices.map(p => p.low),
    close: prices.map(p => p.close),
    period,
  })
  return padLeft(result, prices.length)
}

function calcVolumeSMA(prices: OHLCV[], params: Record<string, number>): number[] {
  const period = params.period || 20
  const volumes = prices.map(p => p.volume)
  const result = SMA.calculate({ values: volumes, period })
  return padLeft(result, prices.length)
}

/**
 * Fear & Greed Index (공포/탐욕 지수) - 실시간 시장 심리 0~100 점수
 *
 * 합성 방식 (가중 평균):
 * - RSI 반전 (30%): 낮은 RSI = 공포 (높은 점수 = 탐욕)
 * - Bollinger %B (25%): 가격의 밴드 내 상대 위치 (0=하단=공포, 1=상단=탐욕)
 * - 거래량 스파이크 (25%): 평균 대비 급증 = 극단 심리
 * - 모멘텀 (20%): 최근 N일 수익률 (하락=공포, 상승=탐욕)
 *
 * 해석:
 * - 0~20: 극단 공포 (역행 매수 기회)
 * - 80~100: 극단 탐욕 (매도/회피)
 *
 * @param params { rsiPeriod, bbPeriod, volPeriod, momentumPeriod }
 */
function calcFearGreed(prices: OHLCV[], params: Record<string, number>): number[] {
  const rsiPeriod = params.rsiPeriod || 14
  const bbPeriod = params.bbPeriod || 20
  const volPeriod = params.volPeriod || 20
  const momentumPeriod = params.momentumPeriod || 10

  const closes = prices.map(p => p.close)
  const volumes = prices.map(p => p.volume)

  // 1. RSI (0~100 그대로 사용, RSI 자체가 탐욕 점수에 가까움)
  const rsiValues = padLeft(RSI.calculate({ values: closes, period: rsiPeriod }), prices.length) as number[]

  // 2. Bollinger %B: (price - lower) / (upper - lower) × 100
  const bbResults = BollingerBands.calculate({ values: closes, period: bbPeriod, stdDev: 2 })
  const bbPercentB = padLeft(
    bbResults.map(b => {
      const range = b.upper - b.lower
      if (range === 0) return 50
      return Math.max(0, Math.min(100, ((closes[0] - b.lower) / range) * 100))
    }),
    prices.length
  ) as number[]
  // 실제 각 날짜의 %B를 재계산
  for (let i = 0; i < prices.length; i++) {
    const bb = bbResults[i - (prices.length - bbResults.length)]
    if (bb) {
      const range = bb.upper - bb.lower
      bbPercentB[i] = range === 0 ? 50 : Math.max(0, Math.min(100, ((closes[i] - bb.lower) / range) * 100))
    }
  }

  // 3. 거래량 스파이크: (현재 거래량 / 평균 거래량) × 50 (1배면 50점, 2배면 100점)
  const volSMA = padLeft(SMA.calculate({ values: volumes, period: volPeriod }), prices.length) as number[]
  const volumeScores = prices.map((p, i) => {
    const avg = volSMA[i]
    if (!avg || isNaN(avg) || avg === 0) return 50
    const ratio = p.volume / avg
    // ratio=1 → 50, ratio>=2 → 100, ratio<=0.5 → 0
    // 가격이 하락 중이면서 거래량 급증 = 공포 (점수 낮게), 상승 + 거래량 급증 = 탐욕 (점수 높게)
    const rawScore = Math.max(0, Math.min(100, ratio * 50))
    // 가격 방향에 따라 부호 적용: 전일 대비 하락이면 공포(반전)
    if (i > 0 && p.close < prices[i - 1].close) {
      return 100 - rawScore // 하락 + 거래량↑ = 공포 (낮은 점수)
    }
    return rawScore // 상승 + 거래량↑ = 탐욕 (높은 점수)
  })

  // 4. 모멘텀: 최근 N일 수익률 → 0~100 (±10% 기준)
  const momentumScores = prices.map((p, i) => {
    if (i < momentumPeriod) return 50
    const prev = prices[i - momentumPeriod].close
    const change = ((p.close - prev) / prev) * 100
    // -10% → 0, 0% → 50, +10% → 100
    return Math.max(0, Math.min(100, 50 + change * 5))
  })

  // 5. 가중 합성
  const result: number[] = []
  for (let i = 0; i < prices.length; i++) {
    const rsi = isNaN(rsiValues[i]) ? 50 : rsiValues[i]
    const bb = isNaN(bbPercentB[i]) ? 50 : bbPercentB[i]
    const vol = volumeScores[i]
    const mom = momentumScores[i]

    const score = rsi * 0.30 + bb * 0.25 + vol * 0.25 + mom * 0.20
    result[i] = Math.round(Math.max(0, Math.min(100, score)) * 100) / 100
  }

  return result
}

// ============================================
// 지표 계산기 매핑
// ============================================

const INDICATOR_CALCULATORS: Record<IndicatorType, (prices: OHLCV[], params: Record<string, number>) => (number | Record<string, number>)[]> = {
  RSI: calcRSI,
  SMA: calcSMA,
  EMA: calcEMA,
  MACD: calcMACD,
  BB: calcBB,
  STOCH: calcStochastic,
  ATR: calcATR,
  ADX: calcADX,
  CCI: calcCCI,
  WILLR: calcWilliamsR,
  VOLUME_SMA: calcVolumeSMA,
  FEAR_GREED: calcFearGreed,
}

// ============================================
// 공개 API
// ============================================

/**
 * 여러 지표를 한 번에 계산
 *
 * @param prices OHLCV 데이터 (오래된 순)
 * @param configs 지표 설정 배열
 * @returns 지표 ID → 날짜별 값 배열 매핑
 */
export function calculateIndicators(
  prices: OHLCV[],
  configs: IndicatorConfig[]
): IndicatorResultMap {
  const results: IndicatorResultMap = {}

  for (const config of configs) {
    const calculator = INDICATOR_CALCULATORS[config.type]
    if (!calculator) {
      console.warn(`알 수 없는 지표 타입: ${config.type}`)
      continue
    }
    results[config.id] = calculator(prices, config.params)
  }

  return results
}

/**
 * 단일 지표 계산
 */
export function calculateIndicator(
  prices: OHLCV[],
  config: IndicatorConfig
): (number | Record<string, number>)[] {
  const calculator = INDICATOR_CALCULATORS[config.type]
  if (!calculator) {
    throw new Error(`알 수 없는 지표 타입: ${config.type}`)
  }
  return calculator(prices, config.params)
}

/**
 * 특정 인덱스에서 지표값 추출 (property 지원)
 *
 * @param values 지표 결과 배열
 * @param index 조회할 인덱스
 * @param property 하위 속성 (예: MACD의 'signal', BB의 'upper')
 * @returns 숫자값 (없으면 NaN)
 */
export function getIndicatorValue(
  values: (number | Record<string, number>)[],
  index: number,
  property?: string
): number {
  if (index < 0 || index >= values.length) return NaN
  const val = values[index]
  if (typeof val === 'number') return val
  if (property && typeof val === 'object' && val !== null) {
    return val[property] ?? NaN
  }
  return NaN
}

/**
 * CrossOver 감지: series1이 series2를 아래에서 위로 돌파
 *
 * @param series1 비교 시리즈 1 (예: SMA_20)
 * @param series2 비교 시리즈 2 (예: SMA_50)
 * @param index 확인할 인덱스 (현재 봉)
 * @returns crossOver 여부
 */
export function isCrossOver(
  series1: number[],
  series2: number[],
  index: number
): boolean {
  if (index < 1) return false
  const prev1 = series1[index - 1]
  const prev2 = series2[index - 1]
  const curr1 = series1[index]
  const curr2 = series2[index]
  if (isNaN(prev1) || isNaN(prev2) || isNaN(curr1) || isNaN(curr2)) return false
  return prev1 <= prev2 && curr1 > curr2
}

/**
 * CrossUnder 감지: series1이 series2를 위에서 아래로 돌파
 */
export function isCrossUnder(
  series1: number[],
  series2: number[],
  index: number
): boolean {
  if (index < 1) return false
  const prev1 = series1[index - 1]
  const prev2 = series2[index - 1]
  const curr1 = series1[index]
  const curr2 = series2[index]
  if (isNaN(prev1) || isNaN(prev2) || isNaN(curr1) || isNaN(curr2)) return false
  return prev1 >= prev2 && curr1 < curr2
}

// ============================================
// 유틸
// ============================================

/** 배열 앞에 NaN 또는 기본값으로 패딩하여 목표 길이에 맞춤 */
function padLeft<T>(arr: T[], targetLength: number, defaultVal?: T): T[] {
  const padSize = targetLength - arr.length
  if (padSize <= 0) return arr
  const pad = Array(padSize).fill(defaultVal ?? NaN)
  return [...pad, ...arr]
}
