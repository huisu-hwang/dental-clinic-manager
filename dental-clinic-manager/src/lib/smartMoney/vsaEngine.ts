/**
 * Volume Spread Analysis (VSA) 엔진 — Tom Williams 'Effort vs Result'
 *
 * 봉마다 다음 지표를 계산:
 *   - spread        : high - low
 *   - bodyDirection : up(close>open) / down(close<open) / neutral
 *   - closePosition : (close - low) / spread (0=하단, 1=상단)
 *   - volRatio      : volume / avg(직전 20봉)
 *
 * 시그널 (최근 5봉만 actionable):
 *   - No Demand       : 양봉 / 좁은 spread / volRatio < 0.7
 *   - No Supply       : 음봉 / 좁은 spread / volRatio < 0.7
 *   - Buying Climax   : volRatio > 2.5 / wide spread / closePosition < 0.5 / 직전 추세 상승
 *   - Selling Climax  : volRatio > 2.5 / wide spread / closePosition > 0.5 / 직전 추세 하락
 *   - Stopping Volume : 음봉 / 매우 큰 거래량 / closePosition > 0.66 / 작은 body
 *
 * effortVsResult:
 *   - bullish : Selling Climax / Stopping Volume / No Supply 중 하나라도 최근 5봉 내 발견
 *   - bearish : Buying Climax / No Demand 발견
 *   - neutral : 그 외
 */

import type { VSAResult, VSASignalEntry } from '@/types/smartMoney'

export interface Bar {
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const SCAN_WINDOW = 30          // 최근 30봉 스캔
const ACTIONABLE_WINDOW = 10    // 시그널 채택 구간 (최근 N봉, 5→10 완화)
const VOL_AVG_BARS = 20         // volRatio 산출용 평균 봉 수
const SPREAD_AVG_BARS = 10      // 좁은/넓은 spread 판정 기준
const NARROW_SPREAD_MULT = 0.85 // 0.7→0.85 완화 (No Demand/Supply 더 잘 잡히게)
const WIDE_SPREAD_MULT = 1.3    // 1.5→1.3 완화 (Climax wide-spread 인정 범위 넓힘)
const LOW_VOL_RATIO = 0.85      // 0.7→0.85 완화 (No Demand/Supply 검출)
const CLIMAX_VOL_RATIO = 1.8    // 2.5→1.8 완화 (climax 검출)
const STOPPING_CLOSE_POS = 0.66
const STOPPING_BODY_TO_SPREAD = 0.4   // 작은 body 기준
const MAX_SIGNALS = 10

type VSAType = VSASignalEntry['type']

interface BarMetrics {
  spread: number
  bodyDirection: 'up' | 'down' | 'neutral'
  closePosition: number
  volRatio: number
  bodySize: number
}

function emptyResult(): VSAResult {
  return {
    signals: [],
    effortVsResult: 'neutral',
    description: '데이터 부족',
  }
}

/**
 * i 봉 직전 N봉의 평균 거래량 (i 자체 제외)
 */
function avgVolumeBefore(bars: Bar[], i: number, n: number): number {
  const start = Math.max(0, i - n)
  if (i <= start) return 0
  let sum = 0
  let count = 0
  for (let k = start; k < i; k++) {
    sum += bars[k].volume
    count++
  }
  return count > 0 ? sum / count : 0
}

/**
 * i 봉 직전 N봉의 평균 spread
 */
function avgSpreadBefore(bars: Bar[], i: number, n: number): number {
  const start = Math.max(0, i - n)
  if (i <= start) return 0
  let sum = 0
  let count = 0
  for (let k = start; k < i; k++) {
    sum += Math.max(0, bars[k].high - bars[k].low)
    count++
  }
  return count > 0 ? sum / count : 0
}

/**
 * i 봉 직전 10봉의 가격 추세 방향: close 변화 누적이 양수면 'up'
 */
function priorTrend(bars: Bar[], i: number): 'up' | 'down' | 'flat' {
  const start = Math.max(0, i - 10)
  if (i - start < 2) return 'flat'
  const first = bars[start].close
  const last = bars[i - 1].close
  if (first <= 0) return 'flat'
  const chg = (last - first) / first
  if (chg > 0.005) return 'up'
  if (chg < -0.005) return 'down'
  return 'flat'
}

function computeMetrics(bar: Bar, avgVol: number): BarMetrics {
  const spread = Math.max(0, bar.high - bar.low)
  let bodyDirection: BarMetrics['bodyDirection'] = 'neutral'
  if (bar.close > bar.open) bodyDirection = 'up'
  else if (bar.close < bar.open) bodyDirection = 'down'
  const closePosition = spread > 0 ? (bar.close - bar.low) / spread : 0.5
  const volRatio = avgVol > 0 ? bar.volume / avgVol : 0
  const bodySize = Math.abs(bar.close - bar.open)
  return { spread, bodyDirection, closePosition, volRatio, bodySize }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function buildSignal(
  type: VSAType,
  barIndex: number,
  metrics: BarMetrics,
  description: string
): VSASignalEntry {
  // confidence = clamp(volRatio*25 + |closePosition - 0.5|*50, 0, 100)
  const distFromCenter = Math.abs(metrics.closePosition - 0.5)
  const confidence = clamp(metrics.volRatio * 25 + distFromCenter * 50, 0, 100)
  return {
    type,
    barIndex,
    confidence,
    description,
  }
}

export function analyzeVSA(bars: Bar[]): VSAResult {
  if (!bars || bars.length < VOL_AVG_BARS + 2) {
    return emptyResult()
  }

  const lastIdx = bars.length - 1
  const scanStart = Math.max(0, bars.length - SCAN_WINDOW)
  const actionableStart = Math.max(0, bars.length - ACTIONABLE_WINDOW)

  const signals: VSASignalEntry[] = []

  for (let i = scanStart; i <= lastIdx; i++) {
    // actionable window 밖이면 무시
    if (i < actionableStart) continue

    const bar = bars[i]
    const avgVol = avgVolumeBefore(bars, i, VOL_AVG_BARS)
    if (avgVol <= 0) continue
    const avgSpread = avgSpreadBefore(bars, i, SPREAD_AVG_BARS)
    if (avgSpread <= 0) continue

    const m = computeMetrics(bar, avgVol)
    if (m.spread <= 0) continue

    const isNarrow = m.spread < avgSpread * NARROW_SPREAD_MULT
    const isWide = m.spread > avgSpread * WIDE_SPREAD_MULT
    const trend = priorTrend(bars, i)

    // No Demand
    if (m.bodyDirection === 'up' && isNarrow && m.volRatio < LOW_VOL_RATIO) {
      signals.push(buildSignal('no-demand', i, m, '수요 부재 — 상승 동력 소진'))
    }

    // No Supply
    if (m.bodyDirection === 'down' && isNarrow && m.volRatio < LOW_VOL_RATIO) {
      signals.push(buildSignal('no-supply', i, m, '공급 부재 — 매도 압력 고갈'))
    }

    // Buying Climax
    if (
      m.volRatio > CLIMAX_VOL_RATIO &&
      isWide &&
      m.closePosition < 0.5 &&
      trend === 'up'
    ) {
      signals.push(buildSignal('buying-climax', i, m, '매수 클라이맥스 — 분배 가능성'))
    }

    // Selling Climax
    if (
      m.volRatio > CLIMAX_VOL_RATIO &&
      isWide &&
      m.closePosition > 0.5 &&
      trend === 'down'
    ) {
      signals.push(buildSignal('selling-climax', i, m, '매도 클라이맥스 — 매집 흡수 가능성'))
    }

    // Stopping Volume
    if (
      m.bodyDirection === 'down' &&
      m.volRatio > CLIMAX_VOL_RATIO &&
      m.closePosition > STOPPING_CLOSE_POS &&
      m.spread > 0 &&
      m.bodySize / m.spread < STOPPING_BODY_TO_SPREAD
    ) {
      signals.push(buildSignal('stopping-volume', i, m, '멈춤 거래량 — 강한 손이 흡수'))
    }
  }

  // 최신 순 정렬 + 상위 MAX_SIGNALS
  signals.sort((a, b) => b.barIndex - a.barIndex)
  const trimmed = signals.slice(0, MAX_SIGNALS)

  // effortVsResult 판정 (actionable window 안의 시그널만 대상)
  const recentTypes = new Set(
    trimmed.filter(s => s.barIndex >= actionableStart).map(s => s.type)
  )
  let effortVsResult: VSAResult['effortVsResult'] = 'neutral'
  const bullishHit =
    recentTypes.has('selling-climax') ||
    recentTypes.has('stopping-volume') ||
    recentTypes.has('no-supply')
  const bearishHit =
    recentTypes.has('buying-climax') ||
    recentTypes.has('no-demand')
  if (bullishHit && !bearishHit) effortVsResult = 'bullish'
  else if (bearishHit && !bullishHit) effortVsResult = 'bearish'
  else effortVsResult = 'neutral'

  const descParts: string[] = []
  if (trimmed.length === 0) {
    descParts.push('VSA 시그널 없음')
  } else {
    descParts.push(`VSA 시그널 ${trimmed.length}건`)
    if (effortVsResult === 'bullish') descParts.push('강세 (Effort vs Result: bullish)')
    else if (effortVsResult === 'bearish') descParts.push('약세 (Effort vs Result: bearish)')
    else descParts.push('중립')
  }

  return {
    signals: trimmed,
    effortVsResult,
    description: descParts.join(' · '),
  }
}
