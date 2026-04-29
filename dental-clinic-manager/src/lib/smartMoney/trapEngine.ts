/**
 * 트랩 엔진 — Bull Trap / Bear Trap (실패한 돌파)
 *
 * - 저항선/지지선: 최근 5봉 윈도우를 제외한 직전 30봉의 최고가/최저가
 * - Bull Trap : 최근 5봉 내에서 저항선을 +0.1% 초과 돌파했으나
 *               이후 ≤3봉 안에 종가가 저항선 아래로 회귀
 *               + (돌파 봉 거래량이 평균 대비 1.2배 이하 OR 돌파 폭만큼 추가 하락)
 * - Bear Trap : 최근 5봉 내에서 지지선을 -0.1% 초과 이탈했으나
 *               이후 ≤3봉 안에 종가가 지지선 위로 회귀
 *               + (이탈 봉 거래량이 평균 대비 1.2배 이하 OR V자 반등)
 * - volumeDivergence : 돌파/이탈 봉의 거래량이 평균 미만이면 true
 */

import type { TrapResult, TrapDetail } from '@/types/smartMoney'

export interface Bar {
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const LEVEL_LOOKBACK = 30          // 저항/지지선 산출 봉 수
const RECENT_WINDOW = 5            // 트랩 후보 검사 구간 (최근 N봉)
const RECLAIM_WINDOW = 3           // 돌파 후 회귀 허용 봉 수
const BREAK_THRESHOLD = 0.001      // 0.1% 돌파 임계
const VOLUME_WEAK_MULT = 1.2       // 거래량 약세 컷오프 (≤1.2x)
const VOLUME_AVG_BARS = 20         // 거래량 평균 산출 봉 수
const MAX_DETAILS = 5              // 최대 반환 트랩 개수

function emptyResult(): TrapResult {
  return {
    bullTrapDetected: false,
    bearTrapDetected: false,
    details: [],
    description: '데이터 부족',
  }
}

/**
 * i 봉 직전 VOLUME_AVG_BARS 봉의 평균 거래량 (i 봉 자체는 제외)
 */
function avgVolumeBefore(bars: Bar[], i: number): number {
  const start = Math.max(0, i - VOLUME_AVG_BARS)
  if (i <= start) return 0
  let sum = 0
  let count = 0
  for (let k = start; k < i; k++) {
    sum += bars[k].volume
    count++
  }
  return count > 0 ? sum / count : 0
}

export function detectTraps(bars: Bar[]): TrapResult {
  if (!bars || bars.length < LEVEL_LOOKBACK) {
    return emptyResult()
  }

  const lastIdx = bars.length - 1
  // 최근 5봉(검사 대상)을 제외한 직전 30봉 윈도우
  const recentStart = Math.max(0, bars.length - RECENT_WINDOW)
  const levelEnd = recentStart                              // exclusive
  const levelStart = Math.max(0, levelEnd - LEVEL_LOOKBACK) // inclusive
  if (levelEnd - levelStart < 1) {
    return emptyResult()
  }

  let resistance = Number.NEGATIVE_INFINITY
  let support = Number.POSITIVE_INFINITY
  for (let i = levelStart; i < levelEnd; i++) {
    const b = bars[i]
    if (b.high > resistance) resistance = b.high
    if (b.low < support) support = b.low
  }
  if (!isFinite(resistance) || !isFinite(support) || resistance <= 0 || support <= 0) {
    return emptyResult()
  }

  const details: TrapDetail[] = []

  // 최근 5봉을 순회하며 트랩 후보 검사
  for (let i = recentStart; i <= lastIdx; i++) {
    const breakBar = bars[i]
    const avgVol = avgVolumeBefore(bars, i)

    // ===== Bull Trap 후보 =====
    const breakoutMagnitude = (breakBar.high - resistance) / resistance
    if (breakoutMagnitude > BREAK_THRESHOLD) {
      // ≤3봉 안에 종가가 저항선 아래로 회귀했는가
      const reclaimMaxIdx = Math.min(lastIdx, i + RECLAIM_WINDOW)
      let reclaimedAt = -1
      for (let j = i; j <= reclaimMaxIdx; j++) {
        if (bars[j].close < resistance) {
          reclaimedAt = j
          break
        }
      }
      if (reclaimedAt >= 0) {
        const weakVolume = avgVol > 0 && breakBar.volume <= avgVol * VOLUME_WEAK_MULT
        // 돌파 폭만큼 후속 하락 (대안 조건)
        const breakAbs = breakBar.high - resistance
        let droppedFar = false
        for (let j = i + 1; j <= reclaimMaxIdx; j++) {
          if (resistance - bars[j].close >= breakAbs) {
            droppedFar = true
            break
          }
        }
        if (weakVolume || droppedFar) {
          details.push({
            type: 'bull-trap',
            breakoutBarIndex: i,
            level: resistance,
            reclaimedBarIndex: reclaimedAt,
            volumeDivergence: avgVol > 0 && breakBar.volume < avgVol,
            description: `저항선 ${resistance.toFixed(2)} 거짓 돌파 후 ${reclaimedAt - i}봉 내 회귀`,
          })
        }
      }
    }

    // ===== Bear Trap 후보 =====
    const breakdownMagnitude = (support - breakBar.low) / support
    if (breakdownMagnitude > BREAK_THRESHOLD) {
      const reclaimMaxIdx = Math.min(lastIdx, i + RECLAIM_WINDOW)
      let reclaimedAt = -1
      for (let j = i; j <= reclaimMaxIdx; j++) {
        if (bars[j].close > support) {
          reclaimedAt = j
          break
        }
      }
      if (reclaimedAt >= 0) {
        const weakVolume = avgVol > 0 && breakBar.volume <= avgVol * VOLUME_WEAK_MULT
        // V자 반등: 다음 봉의 range > 이탈 봉 range + 양봉 마감
        let vShape = false
        if (i + 1 <= lastIdx) {
          const next = bars[i + 1]
          const breakRange = breakBar.high - breakBar.low
          const nextRange = next.high - next.low
          if (nextRange > breakRange && next.close > next.open) {
            vShape = true
          }
        }
        if (weakVolume || vShape) {
          details.push({
            type: 'bear-trap',
            breakoutBarIndex: i,
            level: support,
            reclaimedBarIndex: reclaimedAt,
            volumeDivergence: avgVol > 0 && breakBar.volume < avgVol,
            description: `지지선 ${support.toFixed(2)} 거짓 이탈 후 ${reclaimedAt - i}봉 내 회귀`,
          })
        }
      }
    }
  }

  // 최신 순으로 정렬 후 최대 MAX_DETAILS개만 유지
  details.sort((a, b) => b.breakoutBarIndex - a.breakoutBarIndex)
  const trimmed = details.slice(0, MAX_DETAILS)

  const bullTrapDetected = trimmed.some(d => d.type === 'bull-trap')
  const bearTrapDetected = trimmed.some(d => d.type === 'bear-trap')

  const descParts: string[] = []
  if (bullTrapDetected) descParts.push(`Bull Trap ${trimmed.filter(d => d.type === 'bull-trap').length}회 감지`)
  if (bearTrapDetected) descParts.push(`Bear Trap ${trimmed.filter(d => d.type === 'bear-trap').length}회 감지`)
  if (descParts.length === 0) descParts.push('트랩 시그널 없음')

  return {
    bullTrapDetected,
    bearTrapDetected,
    details: trimmed,
    description: descParts.join(' · '),
  }
}
