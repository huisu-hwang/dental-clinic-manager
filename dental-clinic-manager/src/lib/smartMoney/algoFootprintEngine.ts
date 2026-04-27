/**
 * 알고리즘 풋프린트 엔진 — TWAP / VWAP / Iceberg / Sniper
 *
 * - TWAP score   : 1분봉 거래량의 변동계수 역수 (균등할수록 높음)
 * - VWAP score   : 시간대별 거래량 분포와 U-shape 표준곡선 코사인 유사도
 * - Iceberg score: ±5% 가격대 클러스터에서 동일 크기 체결이 반복되는 횟수
 * - Sniper score : 상위 5% 거래량 봉 직후의 가격 변화율 / 평균 가격 변화율
 *
 * - direction: 양봉/음봉 비율(과 close-OHLC 위치)로 매집/분배 추정
 */

import type { AlgoFootprintResult } from '@/types/smartMoney'

export interface AlgoBar {
  datetime: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// ============================================
// TWAP — 거래량의 균등성 (변동계수 역수)
// ============================================
function scoreTwap(bars: AlgoBar[]): number {
  if (bars.length < 5) return 0
  const volumes = bars.map(b => b.volume).filter(v => v >= 0)
  const n = volumes.length
  if (n === 0) return 0
  const mean = volumes.reduce((s, v) => s + v, 0) / n
  if (mean <= 0) return 0
  let varSum = 0
  for (const v of volumes) varSum += (v - mean) ** 2
  const std = Math.sqrt(varSum / n)
  const cv = std / mean  // 변동계수
  // cv=0 → 100, cv=1 → 0 (대략)
  return Math.max(0, Math.min(100, (1 - cv) * 100))
}

// ============================================
// VWAP — U-shape 표준곡선 코사인 유사도
// (장 시작/종료 부근에 거래량 집중되는 자연스러운 패턴 ≈ VWAP 알고)
// ============================================
function scoreVwap(bars: AlgoBar[]): number {
  if (bars.length < 5) return 0
  const n = bars.length
  // 거래량을 균등 5구간(bucket)으로 집계
  const buckets = 5
  const bucket: number[] = new Array(buckets).fill(0)
  for (let i = 0; i < n; i++) {
    const idx = Math.min(buckets - 1, Math.floor((i / n) * buckets))
    bucket[idx] += bars[i].volume
  }
  // U-shape 표준 (양 끝 강 / 가운데 약)
  const uShape = [1.5, 0.7, 0.5, 0.7, 1.5]
  // 코사인 유사도
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < buckets; i++) {
    dot += bucket[i] * uShape[i]
    normA += bucket[i] ** 2
    normB += uShape[i] ** 2
  }
  if (normA === 0 || normB === 0) return 0
  const cos = dot / (Math.sqrt(normA) * Math.sqrt(normB))
  return Math.max(0, Math.min(100, cos * 100))
}

// ============================================
// Iceberg — 동일 가격대(±5%) 클러스터에서 동일 크기 체결 반복
// ============================================
function scoreIceberg(bars: AlgoBar[]): number {
  if (bars.length < 10) return 0
  // 가격을 5% 버킷으로 정규화
  const priceBins = new Map<number, number[]>()
  for (const b of bars) {
    const mid = (b.high + b.low) / 2
    if (mid <= 0) continue
    const binKey = Math.round(Math.log(mid) / Math.log(1.05))  // ±5% 단위
    const arr = priceBins.get(binKey) ?? []
    arr.push(b.volume)
    priceBins.set(binKey, arr)
  }
  let maxRepeats = 0
  let totalCount = 0
  for (const volumes of priceBins.values()) {
    if (volumes.length < 3) continue
    // 같은 크기 체결 (±10% 허용) 반복 카운트
    const sorted = [...volumes].sort((a, b) => a - b)
    let bestRun = 1
    let curRun = 1
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const cur = sorted[i]
      if (prev > 0 && Math.abs(cur - prev) / prev < 0.1) {
        curRun++
        if (curRun > bestRun) bestRun = curRun
      } else {
        curRun = 1
      }
    }
    maxRepeats = Math.max(maxRepeats, bestRun)
    totalCount += volumes.length
  }
  if (totalCount === 0) return 0
  // 5회 반복 → 50점, 10회 → 100점
  return Math.max(0, Math.min(100, (maxRepeats / 10) * 100))
}

// ============================================
// Sniper — 상위 5% 거래량 봉 직후 가격 변화율 / 평균
// ============================================
function scoreSniper(bars: AlgoBar[]): number {
  if (bars.length < 20) return 0
  const volumes = bars.map(b => b.volume)
  const sorted = [...volumes].sort((a, b) => b - a)
  const top5pctIdx = Math.max(0, Math.floor(sorted.length * 0.05))
  const threshold = sorted[top5pctIdx] || sorted[0]
  if (threshold <= 0) return 0

  let topAvgChg = 0
  let topCount = 0
  let allChgSum = 0
  let allCount = 0

  for (let i = 0; i < bars.length - 1; i++) {
    const b = bars[i]
    const next = bars[i + 1]
    if (b.close <= 0) continue
    const chg = Math.abs((next.close - b.close) / b.close)
    allChgSum += chg
    allCount++
    if (b.volume >= threshold) {
      topAvgChg += chg
      topCount++
    }
  }

  if (topCount === 0 || allCount === 0) return 0
  const topAvg = topAvgChg / topCount
  const allAvg = allChgSum / allCount
  if (allAvg === 0) return 0
  const ratio = topAvg / allAvg
  // ratio 1배 → 0점, 3배 → 100점
  return Math.max(0, Math.min(100, ((ratio - 1) / 2) * 100))
}

// ============================================
// 방향성 판정 (매집 / 분배 / 중립)
// ============================================
function detectDirection(bars: AlgoBar[]): 'accumulation' | 'distribution' | 'neutral' {
  if (bars.length === 0) return 'neutral'
  let bullVol = 0
  let bearVol = 0
  let closeUpperHalf = 0
  let closeLowerHalf = 0
  for (const b of bars) {
    const range = b.high - b.low
    if (b.close > b.open) bullVol += b.volume
    else if (b.close < b.open) bearVol += b.volume
    if (range > 0) {
      // close가 봉의 상단/하단 어디에 위치하는지
      const pos = (b.close - b.low) / range
      if (pos > 0.6) closeUpperHalf++
      else if (pos < 0.4) closeLowerHalf++
    }
  }
  const totalVol = bullVol + bearVol
  if (totalVol === 0) return 'neutral'
  const bullRatio = bullVol / totalVol
  const upperBias = closeUpperHalf - closeLowerHalf

  if (bullRatio > 0.58 || upperBias > bars.length * 0.15) return 'accumulation'
  if (bullRatio < 0.42 || upperBias < -bars.length * 0.15) return 'distribution'
  return 'neutral'
}

// ============================================
// 메인 엔트리
// ============================================
export function analyzeAlgoFootprint(bars: AlgoBar[]): AlgoFootprintResult {
  if (!bars || bars.length === 0) {
    return {
      twapScore: 0,
      vwapScore: 0,
      icebergScore: 0,
      sniperScore: 0,
      dominantAlgo: null,
      direction: 'neutral',
    }
  }

  const twapScore = scoreTwap(bars)
  const vwapScore = scoreVwap(bars)
  const icebergScore = scoreIceberg(bars)
  const sniperScore = scoreSniper(bars)

  const scores: { algo: 'TWAP' | 'VWAP' | 'Iceberg' | 'Sniper'; score: number }[] = [
    { algo: 'TWAP', score: twapScore },
    { algo: 'VWAP', score: vwapScore },
    { algo: 'Iceberg', score: icebergScore },
    { algo: 'Sniper', score: sniperScore },
  ]
  scores.sort((a, b) => b.score - a.score)
  const dominantAlgo = scores[0].score >= 40 ? scores[0].algo : null

  const direction = detectDirection(bars)

  return {
    twapScore,
    vwapScore,
    icebergScore,
    sniperScore,
    dominantAlgo,
    direction,
  }
}
