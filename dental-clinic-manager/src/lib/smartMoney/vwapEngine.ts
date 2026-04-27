/**
 * VWAP (Volume Weighted Average Price) 엔진
 *
 * - VWAP = Σ((H+L+C)/3 × V) / Σ(V)
 * - 표준편차 1σ 기준으로 above / below / near zone 분류
 */

import type { VWAPResult } from '@/types/smartMoney'

export interface VWAPInputBar {
  high: number
  low: number
  close: number
  volume: number
}

/**
 * VWAP 계산
 *
 * @param bars 시간순 정렬된 분봉 (오래된 것 → 최신)
 * @param currentPrice 현재가 (없으면 마지막 봉의 close 사용)
 */
export function calculateVWAP(
  bars: VWAPInputBar[],
  currentPrice?: number
): VWAPResult {
  if (!bars || bars.length === 0) {
    return {
      vwap: 0,
      distance: 0,
      zone: 'near',
      standardDeviation: 0,
    }
  }

  // 1차: VWAP 계산
  let cumPV = 0
  let cumV = 0
  for (const bar of bars) {
    const tp = (bar.high + bar.low + bar.close) / 3
    const v = bar.volume || 0
    cumPV += tp * v
    cumV += v
  }
  const vwap = cumV > 0 ? cumPV / cumV : bars[bars.length - 1].close

  // 2차: 거래량 가중 표준편차 (typical price 기준)
  let weightedVar = 0
  for (const bar of bars) {
    const tp = (bar.high + bar.low + bar.close) / 3
    const v = bar.volume || 0
    weightedVar += v * (tp - vwap) ** 2
  }
  const standardDeviation = cumV > 0 ? Math.sqrt(weightedVar / cumV) : 0

  // 현재가 결정
  const price = typeof currentPrice === 'number' && currentPrice > 0
    ? currentPrice
    : bars[bars.length - 1].close

  const distance = vwap > 0 ? ((price - vwap) / vwap) * 100 : 0

  // zone 결정 — 1σ 이내면 near
  let zone: 'above' | 'below' | 'near' = 'near'
  if (standardDeviation > 0) {
    if (price > vwap + standardDeviation) zone = 'above'
    else if (price < vwap - standardDeviation) zone = 'below'
    else zone = 'near'
  } else {
    if (price > vwap * 1.005) zone = 'above'
    else if (price < vwap * 0.995) zone = 'below'
    else zone = 'near'
  }

  return {
    vwap,
    distance,
    zone,
    standardDeviation,
  }
}
