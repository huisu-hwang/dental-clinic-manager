/**
 * 시장 구조 엔진 — Break of Structure (BOS) / Change of Character (CHoCH)
 *
 * SMC(Smart Money Concepts) 시장구조 탐지:
 *
 * - Swing Point 탐지 : 프랙탈(fractal) 로직으로 좌우 N봉(기본 3봉)보다
 *                      높은 고점 = swing high, 낮은 저점 = swing low를 추출
 * - Swing 분류       : 직전 동일 타입 swing과 비교하여 HH / LH / HL / LL 라벨링
 *                      · HH (Higher High)  : 새 swing high > 직전 swing high
 *                      · LH (Lower High)   : 새 swing high < 직전 swing high
 *                      · HL (Higher Low)   : 새 swing low  > 직전 swing low
 *                      · LL (Lower Low)    : 새 swing low  < 직전 swing low
 * - Trend 결정       : 가장 최근 패턴이
 *                      · HH + HL → bullish
 *                      · LH + LL → bearish
 *                      · 그 외   → range
 * - 구조 이벤트(structural events) :
 *                      · BOS bullish  : bullish trend에서 가격이 직전 HH 돌파 (추세 지속)
 *                      · BOS bearish  : bearish trend에서 가격이 직전 LL 돌파 (추세 지속)
 *                      · CHoCH bullish: bearish trend에서 가격이 직전 LH 돌파 (추세 반전!)
 *                      · CHoCH bearish: bullish trend에서 가격이 직전 HL 돌파 (추세 반전!)
 * - lastEvent / lastEventDirection 으로 가장 최근 1개 이벤트만 추적
 * - swings 는 가장 최근 10개만 반환 (압축)
 */

import type {
  MarketStructureResult,
  StructureEventType,
  StructureTrend,
  SwingPoint,
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
const MIN_BARS = 30
// 반환할 swing 최대 개수
const MAX_SWINGS = 10

// ============================================
// Swing Point 탐지 (fractal)
// ============================================
interface RawSwing {
  barIndex: number
  price: number
  type: 'high' | 'low'
}

function findRawSwings(bars: Bar[], strength: number): RawSwing[] {
  const swings: RawSwing[] = []
  const n = bars.length
  for (let i = strength; i < n - strength; i++) {
    const center = bars[i]
    let isHigh = true
    let isLow = true
    for (let k = 1; k <= strength; k++) {
      const left = bars[i - k]
      const right = bars[i + k]
      if (!(center.high > left.high && center.high > right.high)) isHigh = false
      if (!(center.low < left.low && center.low < right.low)) isLow = false
      if (!isHigh && !isLow) break
    }
    if (isHigh) swings.push({ barIndex: i, price: center.high, type: 'high' })
    if (isLow) swings.push({ barIndex: i, price: center.low, type: 'low' })
  }
  // 시간 순 정렬 (동일 인덱스에서 high/low 양쪽 잡힐 수 있음)
  swings.sort((a, b) => a.barIndex - b.barIndex)
  return swings
}

// ============================================
// Swing 라벨링 (HH/LH/HL/LL)
// ============================================
function labelSwings(rawSwings: RawSwing[]): SwingPoint[] {
  const labeled: SwingPoint[] = []
  let prevHigh: RawSwing | null = null
  let prevLow: RawSwing | null = null

  for (const s of rawSwings) {
    if (s.type === 'high') {
      let kind: SwingPoint['kind']
      if (prevHigh === null) {
        // 비교 대상이 없으면 직전 low 대비로 추정 (없으면 HH로 가정)
        kind = 'HH'
      } else {
        kind = s.price > prevHigh.price ? 'HH' : 'LH'
      }
      labeled.push({ barIndex: s.barIndex, price: s.price, kind })
      prevHigh = s
    } else {
      let kind: SwingPoint['kind']
      if (prevLow === null) {
        kind = 'HL'
      } else {
        kind = s.price > prevLow.price ? 'HL' : 'LL'
      }
      labeled.push({ barIndex: s.barIndex, price: s.price, kind })
      prevLow = s
    }
  }
  return labeled
}

// ============================================
// Trend 결정 — 가장 최근의 highs/lows 한 쌍을 본다
// ============================================
function detectTrend(swings: SwingPoint[]): StructureTrend {
  let lastHighKind: 'HH' | 'LH' | null = null
  let lastLowKind: 'HL' | 'LL' | null = null
  for (let i = swings.length - 1; i >= 0; i--) {
    const s = swings[i]
    if (lastHighKind === null && (s.kind === 'HH' || s.kind === 'LH')) {
      lastHighKind = s.kind
    } else if (lastLowKind === null && (s.kind === 'HL' || s.kind === 'LL')) {
      lastLowKind = s.kind
    }
    if (lastHighKind !== null && lastLowKind !== null) break
  }
  if (lastHighKind === 'HH' && lastLowKind === 'HL') return 'bullish'
  if (lastHighKind === 'LH' && lastLowKind === 'LL') return 'bearish'
  return 'range'
}

// ============================================
// 마지막 동일 종류(swing kind) swing 탐색 헬퍼
// ============================================
function findLastSwingOfKind(
  swings: SwingPoint[],
  kinds: SwingPoint['kind'][],
): SwingPoint | null {
  for (let i = swings.length - 1; i >= 0; i--) {
    if (kinds.includes(swings[i].kind)) return swings[i]
  }
  return null
}

// ============================================
// 구조 이벤트(BOS / CHoCH) 탐지
//
// 알고리즘:
//   1) 모든 swing을 시계열로 라벨링
//   2) 매 시점마다 "최근까지의 swing 시퀀스 → trend"를 추정
//   3) 그 trend 기준으로 직후의 봉들이 기준 가격을 돌파했는지 확인
//   4) 가장 마지막 이벤트만 lastEvent로 채택
// ============================================
interface StructEvent {
  type: Exclude<StructureEventType, null>
  direction: 'bullish' | 'bearish'
  barIndex: number
}

function detectStructuralEvents(
  bars: Bar[],
  swings: SwingPoint[],
): StructEvent | null {
  if (swings.length < 2) return null

  let lastEvent: StructEvent | null = null

  // 각 swing이 확정된 직후부터 다음 swing 직전까지의 봉을 검사
  for (let s = 0; s < swings.length; s++) {
    const trendSwings = swings.slice(0, s + 1)
    const trend = detectTrend(trendSwings)

    // 다음 swing 직전 봉까지 범위
    const startBar = swings[s].barIndex + 1
    const endBar = s + 1 < swings.length ? swings[s + 1].barIndex : bars.length - 1
    if (startBar > endBar) continue

    // 기준 레퍼런스: 가장 최근 HH / LL / LH / HL
    const lastHH = findLastSwingOfKind(trendSwings, ['HH'])
    const lastLL = findLastSwingOfKind(trendSwings, ['LL'])
    const lastLH = findLastSwingOfKind(trendSwings, ['LH'])
    const lastHL = findLastSwingOfKind(trendSwings, ['HL'])

    for (let i = startBar; i <= endBar; i++) {
      const bar = bars[i]
      // BOS bullish : bullish trend + 가격이 직전 HH 위로 종가 마감
      if (trend === 'bullish' && lastHH && bar.close > lastHH.price) {
        lastEvent = { type: 'BOS', direction: 'bullish', barIndex: i }
        continue
      }
      // BOS bearish : bearish trend + 가격이 직전 LL 아래로 종가 마감
      if (trend === 'bearish' && lastLL && bar.close < lastLL.price) {
        lastEvent = { type: 'BOS', direction: 'bearish', barIndex: i }
        continue
      }
      // CHoCH bullish : bearish trend에서 직전 LH 돌파 (반전 신호)
      if (trend === 'bearish' && lastLH && bar.close > lastLH.price) {
        lastEvent = { type: 'CHoCH', direction: 'bullish', barIndex: i }
        continue
      }
      // CHoCH bearish : bullish trend에서 직전 HL 이탈 (반전 신호)
      if (trend === 'bullish' && lastHL && bar.close < lastHL.price) {
        lastEvent = { type: 'CHoCH', direction: 'bearish', barIndex: i }
        continue
      }
    }
  }

  return lastEvent
}

// ============================================
// 설명 텍스트 생성
// ============================================
function buildDescription(
  trend: StructureTrend,
  lastEvent: StructureEventType,
  lastEventDirection: 'bullish' | 'bearish' | null,
  swings: SwingPoint[],
): string {
  const trendLabel =
    trend === 'bullish' ? '상승 추세' : trend === 'bearish' ? '하락 추세' : '횡보'
  if (!lastEvent || !lastEventDirection) {
    return `시장 구조: ${trendLabel} (swing ${swings.length}개)`
  }
  const dirLabel = lastEventDirection === 'bullish' ? '상승' : '하락'
  const eventLabel =
    lastEvent === 'BOS'
      ? `BOS(${dirLabel} 추세 지속)`
      : `CHoCH(${dirLabel} 방향 추세 전환)`
  return `시장 구조: ${trendLabel}, 최근 이벤트=${eventLabel}`
}

// ============================================
// 메인 엔트리
// ============================================
export function analyzeMarketStructure(
  bars: Bar[],
  swingStrength: number = 3,
): MarketStructureResult {
  if (!bars || bars.length < MIN_BARS) {
    return {
      trend: 'range',
      lastEvent: null,
      lastEventDirection: null,
      swings: [],
      description: '데이터 부족 (최소 30봉 필요)',
    }
  }

  const strength = Math.max(1, Math.floor(swingStrength))
  const rawSwings = findRawSwings(bars, strength)
  const labeledSwings = labelSwings(rawSwings)

  const trend = detectTrend(labeledSwings)
  const event = detectStructuralEvents(bars, labeledSwings)

  const compactSwings = labeledSwings.slice(-MAX_SWINGS)

  const lastEvent: StructureEventType = event ? event.type : null
  const lastEventDirection: 'bullish' | 'bearish' | null = event ? event.direction : null

  return {
    trend,
    lastEvent,
    lastEventDirection,
    swings: compactSwings,
    description: buildDescription(trend, lastEvent, lastEventDirection, compactSwings),
  }
}
