/**
 * 오더블록 / FVG 엔진 — Order Block & Fair Value Gap 탐지
 *
 * SMC(Smart Money Concepts) 핵심 존(zone) 탐지:
 *
 * - Bullish Order Block (강세 OB):
 *     강한 상승 임펄스 직전의 마지막 음봉(close < open).
 *     "직후 1~3봉이 합쳐서 ≥ 1.0% 상승" + "직전 swing high 돌파" 조건을 만족하면 채택.
 *     해당 음봉의 high/low 가 OB 존(zone)이 된다.
 *
 * - Bearish Order Block (약세 OB):
 *     강한 하락 임펄스 직전의 마지막 양봉(close > open).
 *     "직후 1~3봉이 합쳐서 ≥ 1.0% 하락" + "직전 swing low 이탈" 조건을 만족하면 채택.
 *
 * - Mitigated 플래그:
 *     이후 봉이 OB 존에 재진입(Re-entry)했는지 여부.
 *     bullish OB의 경우 (bar.low ≤ ob.high && bar.high ≥ ob.low) → 재진입.
 *
 * - Fair Value Gap (3봉 불균형):
 *     · Bullish FVG: candle1.high < candle3.low → gap zone = [candle1.high, candle3.low]
 *     · Bearish FVG: candle1.low  > candle3.high → gap zone = [candle3.high, candle1.low]
 *     · filled: 이후 봉의 가격 범위가 gap을 일부라도 덮으면 true
 *
 * - 결과는 최신순으로 OB 10개 / FVG 10개까지만 유지.
 */

import type {
  FairValueGap,
  OrderBlock,
  OrderBlockFvgResult,
} from '@/types/smartMoney'

export interface Bar {
  datetime: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// 분석에 필요한 최소 봉 개수
const MIN_BARS = 10
// 임펄스(impulse) 가격 변화 임계값 (1.0%)
const IMPULSE_THRESHOLD = 0.01
// 임펄스로 간주할 후속 봉 개수
const IMPULSE_LOOKAHEAD = 3
// 직전 swing 비교에 사용할 lookback 윈도우
const SWING_LOOKBACK = 10
// 결과로 유지할 최대 개수
const MAX_KEEP = 10

// ============================================
// Helper — 인덱스 i 이전 N봉 내 swing high / low
// ============================================
function priorSwingHigh(bars: Bar[], i: number, lookback: number): number | null {
  const start = Math.max(0, i - lookback)
  if (start >= i) return null
  let max = -Infinity
  for (let k = start; k < i; k++) {
    if (bars[k].high > max) max = bars[k].high
  }
  return max === -Infinity ? null : max
}

function priorSwingLow(bars: Bar[], i: number, lookback: number): number | null {
  const start = Math.max(0, i - lookback)
  if (start >= i) return null
  let min = Infinity
  for (let k = start; k < i; k++) {
    if (bars[k].low < min) min = bars[k].low
  }
  return min === Infinity ? null : min
}

// ============================================
// Order Block 탐지
// ============================================
function detectOrderBlocks(bars: Bar[]): OrderBlock[] {
  const obs: OrderBlock[] = []
  const n = bars.length

  for (let i = 0; i < n - IMPULSE_LOOKAHEAD; i++) {
    const candle = bars[i]
    const isBearishCandle = candle.close < candle.open
    const isBullishCandle = candle.close > candle.open

    // 후속 1~3봉 결합 가격 변화율
    const baseClose = candle.close
    if (baseClose <= 0) continue

    let bullishConfirmed = false
    let bearishConfirmed = false

    for (let lookahead = 1; lookahead <= IMPULSE_LOOKAHEAD; lookahead++) {
      const target = bars[i + lookahead]
      if (!target) break
      const change = (target.close - baseClose) / baseClose

      if (isBearishCandle && change >= IMPULSE_THRESHOLD) {
        // 직전 swing high 돌파 확인
        const prevHigh = priorSwingHigh(bars, i, SWING_LOOKBACK)
        // 후속 lookahead 구간의 max high가 prevHigh를 돌파했는지
        let maxHigh = -Infinity
        for (let k = i + 1; k <= i + lookahead; k++) {
          if (bars[k].high > maxHigh) maxHigh = bars[k].high
        }
        if (prevHigh === null || maxHigh > prevHigh) {
          bullishConfirmed = true
          break
        }
      }
      if (isBullishCandle && change <= -IMPULSE_THRESHOLD) {
        const prevLow = priorSwingLow(bars, i, SWING_LOOKBACK)
        let minLow = Infinity
        for (let k = i + 1; k <= i + lookahead; k++) {
          if (bars[k].low < minLow) minLow = bars[k].low
        }
        if (prevLow === null || minLow < prevLow) {
          bearishConfirmed = true
          break
        }
      }
    }

    if (!bullishConfirmed && !bearishConfirmed) continue

    const direction: OrderBlock['direction'] = bullishConfirmed ? 'bullish' : 'bearish'

    // mitigation 검사 — 임펄스 직후(i + IMPULSE_LOOKAHEAD + 1) 이후 봉이 zone에 재진입했는가
    let mitigated = false
    const mitigationStart = i + IMPULSE_LOOKAHEAD + 1
    for (let k = mitigationStart; k < n; k++) {
      const b = bars[k]
      // 존(zone) 오버랩 (방향 무관 동일 식)
      if (b.low <= candle.high && b.high >= candle.low) {
        mitigated = true
        break
      }
    }

    obs.push({
      barIndex: i,
      high: candle.high,
      low: candle.low,
      direction,
      mitigated,
    })
  }

  // 최신순(barIndex 내림차순)으로 정렬 후 상위 MAX_KEEP만
  obs.sort((a, b) => b.barIndex - a.barIndex)
  return obs.slice(0, MAX_KEEP)
}

// ============================================
// FVG (3봉 불균형) 탐지
// ============================================
function detectFvgs(bars: Bar[]): FairValueGap[] {
  const fvgs: FairValueGap[] = []
  const n = bars.length

  for (let i = 0; i + 2 < n; i++) {
    const c1 = bars[i]
    const c3 = bars[i + 2]

    // Bullish FVG: c1.high < c3.low → gap = [c1.high, c3.low]
    if (c1.high < c3.low) {
      const top = c3.low
      const bottom = c1.high
      let filled = false
      for (let k = i + 3; k < n; k++) {
        const b = bars[k]
        // 이후 봉의 범위가 gap과 겹치면 fill
        if (b.low <= top && b.high >= bottom) {
          filled = true
          break
        }
      }
      fvgs.push({
        startBarIndex: i,
        top,
        bottom,
        direction: 'bullish',
        filled,
      })
      continue
    }

    // Bearish FVG: c1.low > c3.high → gap = [c3.high, c1.low]
    if (c1.low > c3.high) {
      const top = c1.low
      const bottom = c3.high
      let filled = false
      for (let k = i + 3; k < n; k++) {
        const b = bars[k]
        if (b.low <= top && b.high >= bottom) {
          filled = true
          break
        }
      }
      fvgs.push({
        startBarIndex: i,
        top,
        bottom,
        direction: 'bearish',
        filled,
      })
    }
  }

  fvgs.sort((a, b) => b.startBarIndex - a.startBarIndex)
  return fvgs.slice(0, MAX_KEEP)
}

// ============================================
// 설명 텍스트
// ============================================
function buildDescription(orderBlocks: OrderBlock[], fvgs: FairValueGap[]): string {
  if (orderBlocks.length === 0 && fvgs.length === 0) {
    return 'OB/FVG 미탐지'
  }
  const obBull = orderBlocks.filter(o => o.direction === 'bullish').length
  const obBear = orderBlocks.filter(o => o.direction === 'bearish').length
  const fvgBull = fvgs.filter(f => f.direction === 'bullish').length
  const fvgBear = fvgs.filter(f => f.direction === 'bearish').length
  const obUnmitigated = orderBlocks.filter(o => !o.mitigated).length
  const fvgUnfilled = fvgs.filter(f => !f.filled).length
  return (
    `OB ${orderBlocks.length}개(강세 ${obBull} / 약세 ${obBear}, 미체결 ${obUnmitigated}), ` +
    `FVG ${fvgs.length}개(강세 ${fvgBull} / 약세 ${fvgBear}, 미체결 ${fvgUnfilled})`
  )
}

// ============================================
// 메인 엔트리
// ============================================
export function detectOrderBlocksAndFvg(bars: Bar[]): OrderBlockFvgResult {
  if (!bars || bars.length < MIN_BARS) {
    return {
      orderBlocks: [],
      fvgs: [],
      description: '데이터 부족 (최소 10봉 필요)',
    }
  }

  const orderBlocks = detectOrderBlocks(bars)
  const fvgs = detectFvgs(bars)

  return {
    orderBlocks,
    fvgs,
    description: buildDescription(orderBlocks, fvgs),
  }
}
