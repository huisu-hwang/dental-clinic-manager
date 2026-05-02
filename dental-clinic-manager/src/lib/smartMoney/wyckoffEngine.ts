/**
 * Wyckoff 시그널 엔진 — Spring / Upthrust / Absorption
 *
 * 일봉(원전 표준)과 분봉(단기 트레이더용) 두 가지 시간프레임을 지원.
 * - timeframe='day'    : Wyckoff 원전 임계 (일봉/주봉 기반)
 * - timeframe='minute' : 분봉 노이즈에 맞춘 보정 임계
 *
 * 패턴:
 * - Spring   : 직전 LOOKBACK 봉의 저점을 (RANGE_MIN ~ RANGE_MAX) 비율로 깨고
 *              같은/다음 봉에서 close가 직전저점 위로 회복 + 거래량 평균 대비 N배↑
 * - Upthrust : 직전 LOOKBACK 봉의 고점을 같은 비율로 돌파 후 즉시 회복 실패
 *              (close < 직전고점) + 거래량 평균 대비 N배↑
 * - Absorption: 거래량 z-score ≥ VOL_Z, 가격 변화율 절댓값 < PRICE_THRESHOLD
 *
 * 검사 방식: 최근 SCAN_WINDOW 봉을 슬라이딩하며 Spring/Upthrust는 OR, Absorption은 best score.
 */

import type { WyckoffResult } from '@/types/smartMoney'

export interface WyckoffBar {
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type WyckoffTimeframe = 'day' | 'minute'

interface Thresholds {
  lookback: number
  scanWindow: number
  volumeSpikeMult: number
  springRangeMin: number
  springRangeMax: number
  absorptionPriceThreshold: number
  absorptionVolZ: number
  absorptionZForFull: number
}

const DAY_THRESHOLDS: Thresholds = {
  lookback: 20,
  scanWindow: 5,
  volumeSpikeMult: 1.5,
  springRangeMin: 0.005,        // 0.5%
  springRangeMax: 0.02,         // 2%
  absorptionPriceThreshold: 0.003, // 0.3%
  absorptionVolZ: 2,
  absorptionZForFull: 4,
}

const MINUTE_THRESHOLDS: Thresholds = {
  lookback: 60,                 // 1시간
  scanWindow: 30,               // 30분 슬라이딩
  volumeSpikeMult: 2.0,
  springRangeMin: 0.001,        // 0.1%
  springRangeMax: 0.01,         // 1%
  absorptionPriceThreshold: 0.0015, // 0.15%
  absorptionVolZ: 3,
  absorptionZForFull: 8,
}

interface DetectOptions {
  /** 시간프레임 (기본 'day' — Wyckoff 원전 표준) */
  timeframe?: WyckoffTimeframe
  /** 직전 비교 윈도우 크기. 미지정 시 timeframe 기본값 */
  lookback?: number
  /** 최근 N봉 슬라이드 검사. 미지정 시 timeframe 기본값 */
  scanWindow?: number
}

export function detectWyckoff(
  bars: WyckoffBar[],
  lookbackOrOptions: number | DetectOptions = {}
): WyckoffResult {
  // 하위호환: 두 번째 인자가 number면 lookback 단독 (기존 호출자)
  const opts: DetectOptions = typeof lookbackOrOptions === 'number'
    ? { lookback: lookbackOrOptions }
    : lookbackOrOptions
  const tf: WyckoffTimeframe = opts.timeframe ?? 'day'
  const base = tf === 'day' ? DAY_THRESHOLDS : MINUTE_THRESHOLDS
  const lookback = opts.lookback ?? base.lookback
  const scanWindow = opts.scanWindow ?? base.scanWindow

  if (!bars || bars.length < lookback + scanWindow) {
    return {
      springDetected: false,
      upthrustDetected: false,
      absorptionScore: 0,
      description: '데이터 부족',
    }
  }

  let springDetected = false
  let upthrustDetected = false
  let bestAbsorptionScore = 0
  let absorptionHits = 0
  let scanned = 0

  for (let i = bars.length - scanWindow; i < bars.length; i++) {
    if (i - lookback < 0) continue
    scanned++
    const target = bars[i]
    const window = bars.slice(i - lookback, i)

    let prevLow = Number.POSITIVE_INFINITY
    let prevHigh = Number.NEGATIVE_INFINITY
    let volSum = 0
    for (const b of window) {
      if (b.low < prevLow) prevLow = b.low
      if (b.high > prevHigh) prevHigh = b.high
      volSum += b.volume
    }
    const avgVol = window.length > 0 ? volSum / window.length : 0
    let varSum = 0
    for (const b of window) varSum += (b.volume - avgVol) ** 2
    const stdVol = window.length > 0 ? Math.sqrt(varSum / window.length) : 0

    const isVolSpike = avgVol > 0 && target.volume >= avgVol * base.volumeSpikeMult

    if (!springDetected && prevLow > 0 && isVolSpike) {
      const breakRatio = (prevLow - target.low) / prevLow
      if (
        breakRatio >= base.springRangeMin &&
        breakRatio <= base.springRangeMax &&
        target.close > prevLow
      ) {
        springDetected = true
      }
    }

    if (!upthrustDetected && prevHigh > 0 && isVolSpike) {
      const breakoutRatio = (target.high - prevHigh) / prevHigh
      if (
        breakoutRatio >= base.springRangeMin &&
        breakoutRatio <= base.springRangeMax &&
        target.close < prevHigh
      ) {
        upthrustDetected = true
      }
    }

    if (stdVol > 0 && target.open > 0) {
      const volZ = (target.volume - avgVol) / stdVol
      const priceChange = Math.abs((target.close - target.open) / target.open)
      if (volZ >= base.absorptionVolZ && priceChange < base.absorptionPriceThreshold) {
        absorptionHits++
        const score = Math.max(
          0,
          Math.min(100, ((volZ - base.absorptionVolZ) / (base.absorptionZForFull - base.absorptionVolZ)) * 100)
        )
        if (score > bestAbsorptionScore) bestAbsorptionScore = score
      }
    }
  }

  const tfLabel = tf === 'day' ? '일봉' : '분봉'
  const descParts: string[] = []
  if (springDetected) descParts.push('Spring 감지 (저점 거짓 이탈 후 회복)')
  if (upthrustDetected) descParts.push('Upthrust 감지 (고점 거짓 돌파 후 실패)')
  if (bestAbsorptionScore > 0) {
    descParts.push(`Absorption 강도 ${bestAbsorptionScore.toFixed(0)} (최근 ${scanned}${tfLabel} 중 ${absorptionHits}회 흡수 흔적)`)
  }
  if (descParts.length === 0) descParts.push(`${tfLabel} 기준 Wyckoff 시그널 없음`)

  return {
    springDetected,
    upthrustDetected,
    absorptionScore: Math.round(bestAbsorptionScore),
    description: descParts.join(' · '),
  }
}
