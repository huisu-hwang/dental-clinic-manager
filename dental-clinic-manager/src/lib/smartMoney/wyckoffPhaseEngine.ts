/**
 * 와이코프 가격 사이클 페이즈 분류기 (Wyckoff Price Cycle Phase Engine)
 *
 * - 다중봉(multi-bar) 슬라이딩 스캔으로 매집/분배 사이클 이벤트를 탐지하고
 *   Phase A ~ E 단계를 추정한다.
 *
 * 매집(Accumulation) 이벤트:
 *   - PS    : 거래량이 평균 1.5배 이상으로 처음 증가하나 가격은 소폭 하락
 *   - SC    : 거래량 2.5배 + 음봉 + 하단 wick > 50% + 구간 저점 부근
 *   - AR    : SC 이후 10봉 내 최고가 (자동 반등)
 *   - ST    : SC 저점을 1% 이내로 재테스트 + SC 대비 거래량 감소
 *   - Spring: SC/ST 저점을 0.3~2% 침범 후 회복 마감 + 거래량 1.5배
 *   - SOS   : AR 고점 돌파 양봉 + 거래량 1.5배
 *   - LPS   : SOS 이후 직전 저항대 위에서 거래량 감소하며 눌림
 *
 * 분배(Distribution) 이벤트:
 *   - PSY  : 거래량 증가하는 양봉 (예비 공급)
 *   - BC   : 거래량 2.5배 + 양봉 + 상단 wick > 50% + 구간 고점 부근
 *   - AR   : BC 이후 10봉 내 최저가
 *   - ST   : BC 고점 1% 이내 재테스트 + BC 대비 거래량 감소
 *   - UTAD : BC/ST 고점 0.3~2% 돌파 후 종가가 다시 아래로 마감 + 거래량 증가
 *   - SOW  : AR 저점 하향 돌파 음봉 + 거래량 증가
 *   - LPSY : SOW 이후 직전 지지대 아래서 반등 실패
 *
 * 페이즈 결정:
 *   - A : SC+AR+ST (또는 PSY+BC+AR) 모두 탐지
 *   - B : A + ST가 2개 이상 (장기 횡보)
 *   - C : A/B + Spring (또는 UTAD)
 *   - D : C + SOS (또는 SOW)
 *   - E : D + LPS (또는 LPSY)
 *
 * - cycle  : accumulation/distribution 이벤트 카운트 비교 (≥2개 우세 쪽)
 * - confidence : clamp(eventsCount * 15 + (phase ? 25 : 0), 0, 100)
 */

import type { WyckoffPhaseResult, WyckoffPhaseEvent } from '@/types/smartMoney'

export interface PhaseBar {
  datetime: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const MIN_BARS = 30
const VOL_WINDOW = 20
/** 가시범위 최저/최고 근처 판정 허용 오차 (3% — 분봉/일봉 모두 합리적) */
const VISIBLE_EXTREME_TOLERANCE = 0.03

// ============================================
// 보조 통계
// ============================================
function avgVolume(bars: PhaseBar[], endExclusive: number, window: number): number {
  const start = Math.max(0, endExclusive - window)
  let sum = 0
  let count = 0
  for (let i = start; i < endExclusive; i++) {
    if (bars[i].volume > 0) {
      sum += bars[i].volume
      count++
    }
  }
  return count > 0 ? sum / count : 0
}

function rangeOf(bar: PhaseBar): number {
  return Math.max(0, bar.high - bar.low)
}

function lowerWickRatio(bar: PhaseBar): number {
  const range = rangeOf(bar)
  if (range <= 0) return 0
  const bodyLow = Math.min(bar.open, bar.close)
  return (bodyLow - bar.low) / range
}

function upperWickRatio(bar: PhaseBar): number {
  const range = rangeOf(bar)
  if (range <= 0) return 0
  const bodyHigh = Math.max(bar.open, bar.close)
  return (bar.high - bodyHigh) / range
}

// ============================================
// 매집 사이클 이벤트 스캔
// ============================================
interface AccumulationEvents {
  ps: WyckoffPhaseEvent | null
  sc: WyckoffPhaseEvent | null
  ar: WyckoffPhaseEvent | null
  sts: WyckoffPhaseEvent[]
  spring: WyckoffPhaseEvent | null
  sos: WyckoffPhaseEvent | null
  lps: WyckoffPhaseEvent | null
}

function detectAccumulation(bars: PhaseBar[]): AccumulationEvents {
  const result: AccumulationEvents = {
    ps: null, sc: null, ar: null, sts: [], spring: null, sos: null, lps: null,
  }

  const n = bars.length

  // 가시범위 최저
  let visibleLow = Infinity
  for (let i = 0; i < n; i++) if (bars[i].low < visibleLow) visibleLow = bars[i].low

  // SC 후보: 가장 강한 셀링 클라이맥스 한 개 선정
  let scIdx = -1
  let scStrength = 0
  for (let i = VOL_WINDOW; i < n; i++) {
    const b = bars[i]
    const avg = avgVolume(bars, i, VOL_WINDOW)
    if (avg <= 0) continue
    const volMul = b.volume / avg
    if (volMul <= 1.8) continue
    if (b.close >= b.open) continue
    if (lowerWickRatio(b) <= 0.35) continue
    // 가시범위 최저 근처 (±1%)
    if (visibleLow <= 0) continue
    if (Math.abs(b.low - visibleLow) / visibleLow > VISIBLE_EXTREME_TOLERANCE) continue
    const strength = volMul * (1 + lowerWickRatio(b))
    if (strength > scStrength) {
      scStrength = strength
      scIdx = i
    }
  }

  if (scIdx >= 0) {
    const sc = bars[scIdx]
    result.sc = {
      type: 'SC',
      barIndex: scIdx,
      price: sc.low,
      description: `Selling Climax (vol ${(sc.volume / avgVolume(bars, scIdx, VOL_WINDOW)).toFixed(1)}x)`,
    }

    // PS: SC 이전 down-bar 중 첫 1.5x avg 거래량
    const psStart = Math.max(VOL_WINDOW, scIdx - 15)
    for (let i = psStart; i < scIdx; i++) {
      const b = bars[i]
      const avg = avgVolume(bars, i, VOL_WINDOW)
      if (avg <= 0) continue
      if (b.close >= b.open) continue
      if (b.volume / avg > 1.5) {
        result.ps = {
          type: 'PS',
          barIndex: i,
          price: b.low,
          description: 'Preliminary Support',
        }
        break
      }
    }

    // AR: SC 이후 10봉 내 최고가
    const arEnd = Math.min(n, scIdx + 11)
    let arIdx = -1
    let arHigh = -Infinity
    for (let i = scIdx + 1; i < arEnd; i++) {
      if (bars[i].high > arHigh) {
        arHigh = bars[i].high
        arIdx = i
      }
    }
    if (arIdx >= 0) {
      result.ar = {
        type: 'AR',
        barIndex: arIdx,
        price: arHigh,
        description: 'Automatic Rally',
      }
    }

    // ST: SC 이후, SC 저가 ±1% 재테스트, volume < SC volume
    const scLow = sc.low
    const stStart = result.ar ? result.ar.barIndex + 1 : scIdx + 1
    for (let i = stStart; i < n; i++) {
      const b = bars[i]
      if (scLow <= 0) continue
      if (Math.abs(b.low - scLow) / scLow > VISIBLE_EXTREME_TOLERANCE) continue
      if (b.volume >= sc.volume) continue
      result.sts.push({
        type: 'ST',
        barIndex: i,
        price: b.low,
        description: 'Secondary Test',
      })
    }

    // Spring: SC/ST 저가를 0.3~2% 이탈 후 종가가 그 위에서 마감, vol > 1.5x avg
    const refLow = scLow
    const springStart = scIdx + 1
    for (let i = springStart; i < n; i++) {
      const b = bars[i]
      if (refLow <= 0) continue
      const piercePct = (refLow - b.low) / refLow
      if (piercePct < 0.003 || piercePct > 0.02) continue
      if (b.close <= refLow) continue
      const avg = avgVolume(bars, i, VOL_WINDOW)
      if (avg <= 0) continue
      if (b.volume / avg <= 1.5) continue
      result.spring = {
        type: 'Spring',
        barIndex: i,
        price: b.low,
        description: 'Spring (false breakdown)',
      }
      break
    }

    // SOS: 양봉, vol > 1.5x avg, close > AR high
    if (result.ar) {
      const arHighRef = result.ar.price
      const sosStart = result.spring ? result.spring.barIndex + 1 : result.ar.barIndex + 1
      for (let i = sosStart; i < n; i++) {
        const b = bars[i]
        if (b.close <= b.open) continue
        const avg = avgVolume(bars, i, VOL_WINDOW)
        if (avg <= 0) continue
        if (b.volume / avg <= 1.5) continue
        if (b.close <= arHighRef) continue
        result.sos = {
          type: 'SOS',
          barIndex: i,
          price: b.close,
          description: 'Sign of Strength',
        }
        break
      }
    }

    // LPS: SOS 이후 풀백이 직전 레인지 상단(AR high) 위에서 holds, 거래량 감소
    if (result.sos && result.ar) {
      const arHighRef = result.ar.price
      for (let i = result.sos.barIndex + 1; i < n; i++) {
        const b = bars[i]
        if (b.low <= arHighRef) continue
        const avg = avgVolume(bars, i, VOL_WINDOW)
        if (avg <= 0) continue
        if (b.volume >= avg) continue
        result.lps = {
          type: 'LPS',
          barIndex: i,
          price: b.low,
          description: 'Last Point of Support',
        }
        break
      }
    }
  }

  return result
}

// ============================================
// 분배 사이클 이벤트 스캔 (매집의 미러)
// ============================================
interface DistributionEvents {
  psy: WyckoffPhaseEvent | null
  bc: WyckoffPhaseEvent | null
  ar: WyckoffPhaseEvent | null
  sts: WyckoffPhaseEvent[]
  utad: WyckoffPhaseEvent | null
  sow: WyckoffPhaseEvent | null
  lpsy: WyckoffPhaseEvent | null
}

function detectDistribution(bars: PhaseBar[]): DistributionEvents {
  const result: DistributionEvents = {
    psy: null, bc: null, ar: null, sts: [], utad: null, sow: null, lpsy: null,
  }

  const n = bars.length

  let visibleHigh = -Infinity
  for (let i = 0; i < n; i++) if (bars[i].high > visibleHigh) visibleHigh = bars[i].high

  // BC 후보: 가장 강한 buying climax
  let bcIdx = -1
  let bcStrength = 0
  for (let i = VOL_WINDOW; i < n; i++) {
    const b = bars[i]
    const avg = avgVolume(bars, i, VOL_WINDOW)
    if (avg <= 0) continue
    const volMul = b.volume / avg
    if (volMul <= 1.8) continue
    if (b.close <= b.open) continue
    if (upperWickRatio(b) <= 0.35) continue
    if (visibleHigh <= 0) continue
    if (Math.abs(b.high - visibleHigh) / visibleHigh > VISIBLE_EXTREME_TOLERANCE) continue
    const strength = volMul * (1 + upperWickRatio(b))
    if (strength > bcStrength) {
      bcStrength = strength
      bcIdx = i
    }
  }

  if (bcIdx >= 0) {
    const bc = bars[bcIdx]
    result.bc = {
      type: 'BC',
      barIndex: bcIdx,
      price: bc.high,
      description: `Buying Climax (vol ${(bc.volume / avgVolume(bars, bcIdx, VOL_WINDOW)).toFixed(1)}x)`,
    }

    // PSY: BC 이전 up-bar에서 거래량이 늘어나기 시작 (>1.5x)
    const psyStart = Math.max(VOL_WINDOW, bcIdx - 15)
    for (let i = psyStart; i < bcIdx; i++) {
      const b = bars[i]
      const avg = avgVolume(bars, i, VOL_WINDOW)
      if (avg <= 0) continue
      if (b.close <= b.open) continue
      if (b.volume / avg > 1.5) {
        result.psy = {
          type: 'PSY',
          barIndex: i,
          price: b.high,
          description: 'Preliminary Supply',
        }
        break
      }
    }

    // AR(분배): BC 이후 10봉 내 최저가
    const arEnd = Math.min(n, bcIdx + 11)
    let arIdx = -1
    let arLow = Infinity
    for (let i = bcIdx + 1; i < arEnd; i++) {
      if (bars[i].low < arLow) {
        arLow = bars[i].low
        arIdx = i
      }
    }
    if (arIdx >= 0) {
      result.ar = {
        type: 'AR',
        barIndex: arIdx,
        price: arLow,
        description: 'Automatic Reaction',
      }
    }

    // ST(분배): BC 고가 ±1% 재테스트, volume < BC
    const bcHigh = bc.high
    const stStart = result.ar ? result.ar.barIndex + 1 : bcIdx + 1
    for (let i = stStart; i < n; i++) {
      const b = bars[i]
      if (bcHigh <= 0) continue
      if (Math.abs(b.high - bcHigh) / bcHigh > VISIBLE_EXTREME_TOLERANCE) continue
      if (b.volume >= bc.volume) continue
      result.sts.push({
        type: 'ST',
        barIndex: i,
        price: b.high,
        description: 'Secondary Test (distribution)',
      })
    }

    // UTAD: BC/ST 고가 0.3~2% 돌파 후 종가가 그 아래에서 마감, vol 큰 봉
    const refHigh = bcHigh
    for (let i = bcIdx + 1; i < n; i++) {
      const b = bars[i]
      if (refHigh <= 0) continue
      const piercePct = (b.high - refHigh) / refHigh
      if (piercePct < 0.003 || piercePct > 0.02) continue
      if (b.close >= refHigh) continue
      const avg = avgVolume(bars, i, VOL_WINDOW)
      if (avg <= 0) continue
      if (b.volume / avg <= 1.5) continue
      result.utad = {
        type: 'UTAD',
        barIndex: i,
        price: b.high,
        description: 'Upthrust After Distribution',
      }
      break
    }

    // SOW: AR 저가 하향 돌파, 음봉, 거래량 증가
    if (result.ar) {
      const arLowRef = result.ar.price
      const sowStart = result.utad ? result.utad.barIndex + 1 : result.ar.barIndex + 1
      for (let i = sowStart; i < n; i++) {
        const b = bars[i]
        if (b.close >= b.open) continue
        const avg = avgVolume(bars, i, VOL_WINDOW)
        if (avg <= 0) continue
        if (b.volume / avg <= 1.5) continue
        if (b.close >= arLowRef) continue
        result.sow = {
          type: 'SOW',
          barIndex: i,
          price: b.close,
          description: 'Sign of Weakness',
        }
        break
      }
    }

    // LPSY: SOW 이후 반등이 직전 레인지 하단(AR low) 아래에서 fail
    if (result.sow && result.ar) {
      const arLowRef = result.ar.price
      for (let i = result.sow.barIndex + 1; i < n; i++) {
        const b = bars[i]
        if (b.high >= arLowRef) continue
        const avg = avgVolume(bars, i, VOL_WINDOW)
        if (avg <= 0) continue
        if (b.volume >= avg) continue
        result.lpsy = {
          type: 'LPSY',
          barIndex: i,
          price: b.high,
          description: 'Last Point of Supply',
        }
        break
      }
    }
  }

  return result
}

// ============================================
// 메인 엔트리
// ============================================
export function detectWyckoffPhase(
  bars: PhaseBar[],
  dailyBars?: PhaseBar[],
): WyckoffPhaseResult {
  // 와이코프 사이클은 본질적으로 다일(multi-day) 패턴이므로
  // 일봉이 충분히 제공되면 일봉을 우선 사용한다 (분봉은 fallback).
  const sourceBars = dailyBars && dailyBars.length >= MIN_BARS ? dailyBars : bars
  if (!sourceBars || sourceBars.length < MIN_BARS) {
    return { cycle: null, phase: null, events: [], confidence: 0, description: '데이터 부족' }
  }

  const acc = detectAccumulation(sourceBars)
  const dist = detectDistribution(sourceBars)

  const accEvents: WyckoffPhaseEvent[] = []
  if (acc.ps) accEvents.push(acc.ps)
  if (acc.sc) accEvents.push(acc.sc)
  if (acc.ar) accEvents.push(acc.ar)
  for (const st of acc.sts) accEvents.push(st)
  if (acc.spring) accEvents.push(acc.spring)
  if (acc.sos) accEvents.push(acc.sos)
  if (acc.lps) accEvents.push(acc.lps)

  const distEvents: WyckoffPhaseEvent[] = []
  if (dist.psy) distEvents.push(dist.psy)
  if (dist.bc) distEvents.push(dist.bc)
  if (dist.ar) distEvents.push(dist.ar)
  for (const st of dist.sts) distEvents.push(st)
  if (dist.utad) distEvents.push(dist.utad)
  if (dist.sow) distEvents.push(dist.sow)
  if (dist.lpsy) distEvents.push(dist.lpsy)

  // cycle 결정
  let cycle: WyckoffPhaseResult['cycle'] = null
  let events: WyckoffPhaseEvent[] = []
  if (accEvents.length > distEvents.length && accEvents.length >= 2) {
    cycle = 'accumulation'
    events = accEvents
  } else if (distEvents.length > accEvents.length && distEvents.length >= 2) {
    cycle = 'distribution'
    events = distEvents
  } else if (accEvents.length === 0 && distEvents.length === 0) {
    // ★ Fallback: 클라이맥스 이벤트가 전혀 없는 추세 종목용
    //   60일 추세 방향만 보고 cycle 추정. 실제 매집/분배 사이클 단계는
    //   판별할 수 없으므로 phase=null로 둠.
    const len = sourceBars.length
    const startPrice = sourceBars[Math.max(0, len - 30)].close
    const endPrice = sourceBars[len - 1].close
    if (startPrice > 0) {
      const trendPct = (endPrice - startPrice) / startPrice
      if (trendPct >= 0.03) {
        cycle = 'distribution' // 30일 +3% 이상 상승 → 고점 분배 가능성
      } else if (trendPct <= -0.03) {
        cycle = 'accumulation' // 30일 -3% 이상 하락 → 저점 매집 가능성
      }
    }
    if (cycle) {
      const trendDesc = cycle === 'accumulation' ? '하락 추세 — 매집 진행 가능성 (climax 미관측)' : '상승 추세 — 분배 진행 가능성 (climax 미관측)'
      return {
        cycle,
        phase: null,
        events: [],
        confidence: 25,
        description: trendDesc,
      }
    }
    return { cycle: null, phase: null, events: [], confidence: 0, description: '이벤트 없음 — 횡보' }
  } else {
    // 동률 또는 2개 미만 — 더 많은 쪽만 노출, cycle 미정
    events = accEvents.length >= distEvents.length ? accEvents : distEvents
  }

  // phase 결정 — 핵심 마커가 발견되면 더 관대하게 인정
  // (이전: hasA가 SC+AR+ST 모두, hasC가 hasA && spring 필수 → 너무 빡빡)
  let phase: WyckoffPhaseResult['phase'] = null
  if (cycle === 'accumulation') {
    const hasA = !!(acc.sc && acc.ar)              // SC + AR 만 있으면 A
    const hasB = hasA && acc.sts.length >= 1       // ST 1개 이상 → B
    const hasC = !!acc.spring                       // Spring 단독으로도 Phase C 인정
    const hasD = !!acc.sos                          // SOS 단독으로도 Phase D 인정
    const hasE = !!acc.lps                          // LPS 단독으로도 Phase E 인정
    if (hasE) phase = 'E'
    else if (hasD) phase = 'D'
    else if (hasC) phase = 'C'
    else if (hasB) phase = 'B'
    else if (hasA) phase = 'A'
  } else if (cycle === 'distribution') {
    const hasA = !!(dist.bc && dist.ar)            // BC + AR 만 있으면 A (PSY 필수 제거)
    const hasB = hasA && dist.sts.length >= 1
    const hasC = !!dist.utad
    const hasD = !!dist.sow
    const hasE = !!dist.lpsy
    if (hasE) phase = 'E'
    else if (hasD) phase = 'D'
    else if (hasC) phase = 'C'
    else if (hasB) phase = 'B'
    else if (hasA) phase = 'A'
  }

  events.sort((a, b) => a.barIndex - b.barIndex)
  const confidence = Math.max(0, Math.min(100, events.length * 15 + (phase ? 25 : 0)))

  const eventLabels = events.map(e => e.type).join(', ')
  const cycleLabel = cycle === 'accumulation' ? '매집' : cycle === 'distribution' ? '분배' : '중립'
  const phaseLabel = phase ? `Phase ${phase}` : '페이즈 미확정'
  const description = `${cycleLabel} 사이클 / ${phaseLabel} — 이벤트: ${eventLabels || '없음'}`

  return { cycle, phase, events, confidence, description }
}
