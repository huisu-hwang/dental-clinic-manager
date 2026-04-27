/**
 * Wyckoff 시그널 엔진 — Spring / Upthrust / Absorption
 *
 * - Spring   : 직전 N개 봉의 저점을 (-0.5%~-2%) 깨고 같은/다음 봉에서 close가
 *              직전저점 위로 회복 + 거래량 평균 대비 1.5배↑
 * - Upthrust : 직전 N개 봉의 고점을 (+0.5%~+2%) 돌파 후 즉시 회복 실패
 *              (close < 직전고점) + 거래량 평균 대비 1.5배↑
 * - Absorption: 거래량 z-score ≥ 2 이지만 가격 변화율 절댓값 < 0.3%
 */

import type { WyckoffResult } from '@/types/smartMoney'

export interface WyckoffBar {
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const DEFAULT_LOOKBACK = 20
const VOLUME_SPIKE_MULT = 1.5
const SPRING_RANGE_MIN = 0.005   // 0.5%
const SPRING_RANGE_MAX = 0.02    // 2%
const ABSORPTION_PRICE_THRESHOLD = 0.003  // 0.3%
const ABSORPTION_VOL_Z = 2

export function detectWyckoff(
  bars: WyckoffBar[],
  lookback: number = DEFAULT_LOOKBACK
): WyckoffResult {
  if (!bars || bars.length < lookback + 2) {
    return {
      springDetected: false,
      upthrustDetected: false,
      absorptionScore: 0,
      description: '데이터 부족',
    }
  }

  const lastIdx = bars.length - 1
  const last = bars[lastIdx]
  const prevWindow = bars.slice(lastIdx - lookback, lastIdx)

  // 직전 N개 봉의 고점/저점/평균거래량
  let prevLow = Number.POSITIVE_INFINITY
  let prevHigh = Number.NEGATIVE_INFINITY
  let volSum = 0
  for (const b of prevWindow) {
    if (b.low < prevLow) prevLow = b.low
    if (b.high > prevHigh) prevHigh = b.high
    volSum += b.volume
  }
  const avgVol = prevWindow.length > 0 ? volSum / prevWindow.length : 0

  // 거래량 표준편차 (z-score용)
  let varSum = 0
  for (const b of prevWindow) {
    varSum += (b.volume - avgVol) ** 2
  }
  const stdVol = prevWindow.length > 0 ? Math.sqrt(varSum / prevWindow.length) : 0

  // Spring: 직전 저점을 -0.5%~-2% 범위로 깨고 close가 회복
  let springDetected = false
  if (prevLow > 0) {
    const breakRatio = (prevLow - last.low) / prevLow  // 양수면 저점 하회
    const isInRange = breakRatio >= SPRING_RANGE_MIN && breakRatio <= SPRING_RANGE_MAX
    const isRecovered = last.close > prevLow
    const isVolSpike = avgVol > 0 && last.volume >= avgVol * VOLUME_SPIKE_MULT
    if (isInRange && isRecovered && isVolSpike) {
      springDetected = true
    }
  }

  // Upthrust: 직전 고점을 +0.5%~+2% 돌파 후 회복 실패 (close < prevHigh)
  let upthrustDetected = false
  if (prevHigh > 0) {
    const breakoutRatio = (last.high - prevHigh) / prevHigh
    const isInRange = breakoutRatio >= SPRING_RANGE_MIN && breakoutRatio <= SPRING_RANGE_MAX
    const failedToHold = last.close < prevHigh
    const isVolSpike = avgVol > 0 && last.volume >= avgVol * VOLUME_SPIKE_MULT
    if (isInRange && failedToHold && isVolSpike) {
      upthrustDetected = true
    }
  }

  // Absorption: 거래량 z-score ≥ 2 이지만 |price change| < 0.3%
  let absorptionScore = 0
  if (stdVol > 0 && last.open > 0) {
    const volZ = (last.volume - avgVol) / stdVol
    const priceChange = Math.abs((last.close - last.open) / last.open)
    if (volZ >= ABSORPTION_VOL_Z && priceChange < ABSORPTION_PRICE_THRESHOLD) {
      // 점수: volZ를 0~100으로 매핑 (z=2 → 50, z=4 → 100)
      absorptionScore = Math.max(0, Math.min(100, ((volZ - 2) / 2) * 50 + 50))
    }
  }

  const descParts: string[] = []
  if (springDetected) descParts.push('Spring 감지 (저점 거짓 이탈 후 회복)')
  if (upthrustDetected) descParts.push('Upthrust 감지 (고점 거짓 돌파 후 실패)')
  if (absorptionScore > 0) descParts.push(`Absorption 강도 ${absorptionScore.toFixed(0)}`)
  if (descParts.length === 0) descParts.push('Wyckoff 시그널 없음')

  return {
    springDetected,
    upthrustDetected,
    absorptionScore,
    description: descParts.join(' · '),
  }
}
