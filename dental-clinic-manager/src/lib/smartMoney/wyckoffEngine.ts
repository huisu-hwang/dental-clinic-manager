/**
 * Wyckoff 시그널 엔진 — Spring / Upthrust / Absorption
 *
 * 분봉 데이터에 최적화된 임계값 + 마지막 N봉 슬라이딩 검사.
 *
 * - Spring   : 직전 LOOKBACK 봉의 저점을 (SPRING_RANGE_MIN ~ SPRING_RANGE_MAX) 비율로
 *              깨고 같은/다음 봉에서 close가 직전저점 위로 회복 + 거래량 평균 대비 N배↑
 * - Upthrust : 직전 LOOKBACK 봉의 고점을 같은 비율로 돌파 후 즉시 회복 실패
 *              (close < 직전고점) + 거래량 평균 대비 N배↑
 * - Absorption: 거래량 z-score ≥ ABSORPTION_VOL_Z 이지만 가격 변화율 절댓값 < ABSORPTION_PRICE_THRESHOLD
 *
 * 분봉(1분/5분) 기준 변화율은 일봉보다 한참 작으므로 임계치를 분봉 스케일로 낮추고,
 * 마지막 1봉만 보면 거의 안 잡히므로 최근 SCAN_WINDOW 봉 중 어느 하나라도 패턴 발생 시 detected 처리.
 */

import type { WyckoffResult } from '@/types/smartMoney'

export interface WyckoffBar {
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const DEFAULT_LOOKBACK = 60        // 직전 비교 윈도우 (분봉 60개 = 1시간)
const DEFAULT_SCAN_WINDOW = 30     // 최근 N봉 중 패턴 검출
const VOLUME_SPIKE_MULT = 2.0      // 거래량 평균 대비 배수 (분봉 노이즈 고려해 1.5→2.0)
const SPRING_RANGE_MIN = 0.001     // 0.1%
const SPRING_RANGE_MAX = 0.01      // 1%
const ABSORPTION_PRICE_THRESHOLD = 0.0015  // 0.15% (1분봉 평균 변동에 가까운 값)
const ABSORPTION_VOL_Z = 3                 // z-score 임계 (2→3, 너무 자주 잡히던 것 보정)
const ABSORPTION_Z_FOR_FULL = 8            // z=8일 때 점수 100 (cap 너무 빠른 것 보정)

interface DetectOptions {
  /** 직전 비교 윈도우 크기 (기본 60) */
  lookback?: number
  /** 최근 N봉 슬라이드 검사 (기본 30) */
  scanWindow?: number
}

export function detectWyckoff(
  bars: WyckoffBar[],
  lookbackOrOptions: number | DetectOptions = {}
): WyckoffResult {
  // 하위호환: 두 번째 인자가 number면 lookback으로 해석
  const opts: DetectOptions = typeof lookbackOrOptions === 'number'
    ? { lookback: lookbackOrOptions }
    : lookbackOrOptions
  const lookback = opts.lookback ?? DEFAULT_LOOKBACK
  const scanWindow = opts.scanWindow ?? DEFAULT_SCAN_WINDOW

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

  // 최근 scanWindow 봉을 순회하며 각 봉을 "기준봉"으로 삼아 lookback 직전봉과 비교
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

    const isVolSpike = avgVol > 0 && target.volume >= avgVol * VOLUME_SPIKE_MULT

    // Spring
    if (!springDetected && prevLow > 0 && isVolSpike) {
      const breakRatio = (prevLow - target.low) / prevLow
      if (
        breakRatio >= SPRING_RANGE_MIN &&
        breakRatio <= SPRING_RANGE_MAX &&
        target.close > prevLow
      ) {
        springDetected = true
      }
    }

    // Upthrust
    if (!upthrustDetected && prevHigh > 0 && isVolSpike) {
      const breakoutRatio = (target.high - prevHigh) / prevHigh
      if (
        breakoutRatio >= SPRING_RANGE_MIN &&
        breakoutRatio <= SPRING_RANGE_MAX &&
        target.close < prevHigh
      ) {
        upthrustDetected = true
      }
    }

    // Absorption — 윈도우 내 best 점수
    if (stdVol > 0 && target.open > 0) {
      const volZ = (target.volume - avgVol) / stdVol
      const priceChange = Math.abs((target.close - target.open) / target.open)
      if (volZ >= ABSORPTION_VOL_Z && priceChange < ABSORPTION_PRICE_THRESHOLD) {
        absorptionHits++
        // z=3 → 0, z=ABSORPTION_Z_FOR_FULL → 100, 그 이상 cap
        const score = Math.max(
          0,
          Math.min(100, ((volZ - ABSORPTION_VOL_Z) / (ABSORPTION_Z_FOR_FULL - ABSORPTION_VOL_Z)) * 100)
        )
        if (score > bestAbsorptionScore) bestAbsorptionScore = score
      }
    }
  }

  const descParts: string[] = []
  if (springDetected) descParts.push('Spring 감지 (저점 거짓 이탈 후 회복)')
  if (upthrustDetected) descParts.push('Upthrust 감지 (고점 거짓 돌파 후 실패)')
  if (bestAbsorptionScore > 0) {
    descParts.push(`Absorption 강도 ${bestAbsorptionScore.toFixed(0)} (최근 ${scanned}봉 중 ${absorptionHits}회 흡수 흔적)`)
  }
  if (descParts.length === 0) descParts.push('Wyckoff 시그널 없음')

  return {
    springDetected,
    upthrustDetected,
    absorptionScore: Math.round(bestAbsorptionScore),
    description: descParts.join(' · '),
  }
}
