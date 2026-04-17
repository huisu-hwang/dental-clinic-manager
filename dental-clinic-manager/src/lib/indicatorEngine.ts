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
