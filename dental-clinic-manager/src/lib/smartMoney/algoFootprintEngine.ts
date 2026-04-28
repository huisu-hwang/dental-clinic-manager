/**
 * 알고리즘 풋프린트 엔진 — TWAP / VWAP / Iceberg / Sniper / MOO / MOC
 *
 * - TWAP score   : 1분봉 거래량의 변동계수 역수 (균등할수록 높음)
 * - VWAP score   : 시간대별 거래량 분포와 U-shape 표준곡선 코사인 유사도
 * - Iceberg score: ±5% 가격대 클러스터에서 동일 크기 체결이 반복되는 횟수
 * - Sniper score : 상위 5% 거래량 봉 직후의 가격 변화율 / 평균 가격 변화율
 * - MOO score    : 첫 봉(시가 동시호가) 거래량이 일중 중앙값 대비 얼마나 큰가
 * - MOC score    : 마지막 봉(종가 동시호가) 거래량이 일중 중앙값 대비 얼마나 큰가
 *
 * - direction        : 양봉/음봉 비율(과 close-OHLC 위치)로 매집/분배 추정
 * - auctionDirection : MOO/MOC 발생 시 시·종가 봉의 양봉/음봉 방향
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
// Iceberg — 좁은 가격대(±0.5%)에서 평균 미만 거래량의 유사 크기 봉 반복 클러스터
//
// 진짜 아이스버그 시그니처:
//   1) 분할 체결 = 평균 이하의 작은 거래량
//   2) 같은 가격대에서 반복 체결 (가격을 지키려는 의도)
//   3) 비슷한 사이즈로 반복 (알고 트레이딩 typical)
//
// 이전 구현은 정렬 후 인접 값을 보았기 때문에, 어떤 인트라데이 데이터에서도
// 저거래량 구간이 길게 정렬되면 100점이 나오는 결함이 있었음.
// ============================================
function scoreIceberg(bars: AlgoBar[]): number {
  if (bars.length < 10) return 0

  const allVolumes = bars.map(b => b.volume).filter(v => v > 0)
  if (allVolumes.length === 0) return 0
  const meanVol = allVolumes.reduce((s, v) => s + v, 0) / allVolumes.length
  if (meanVol <= 0) return 0
  // 평균 거래량의 1.5배 이상인 봉은 후보에서 제외 (아이스버그는 작게 분할)
  const volCap = meanVol * 1.5

  // 가격을 0.5% 좁은 버킷으로 그룹핑 (이전 5%는 너무 넓어서 인트라데이 ≈ 1~2개 빈만 생성)
  const priceBins = new Map<number, number[]>()
  for (const b of bars) {
    const mid = (b.high + b.low) / 2
    if (mid <= 0 || b.volume <= 0) continue
    if (b.volume > volCap) continue
    const binKey = Math.round(Math.log(mid) / Math.log(1.005))
    const arr = priceBins.get(binKey) ?? []
    arr.push(b.volume)
    priceBins.set(binKey, arr)
  }

  // 각 가격 빈 안에서 "± 10% 거래량으로 묶인 가장 큰 클러스터" 카운트
  // (정렬 후 슬라이딩 윈도우: 정렬 자체는 시간순서가 의미 없는 클러스터 빈도 측정에 사용)
  let bestCluster = 0
  for (const volumes of priceBins.values()) {
    if (volumes.length < 4) continue
    const sorted = [...volumes].sort((a, b) => a - b)
    for (let i = 0; i < sorted.length; i++) {
      const center = sorted[i]
      if (center <= 0) continue
      let count = 1
      for (let j = i + 1; j < sorted.length; j++) {
        if (Math.abs(sorted[j] - center) / center < 0.1) count++
        else break
      }
      if (count > bestCluster) bestCluster = count
    }
  }

  // 4 클러스터 → 0점, 8 → ~50점, 12 이상 → 100점
  if (bestCluster < 4) return 0
  return Math.max(0, Math.min(100, ((bestCluster - 4) / 8) * 100))
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
// MOO / MOC — 시·종가 동시호가 거래량 집중도
// ============================================
function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * 봉 거래량이 중앙값 대비 ratio일 때 점수:
 * ratio ≤ 1.5 → 0 / ratio = 3 → 60 / ratio = 5 → 100 / 그 이상 클램프
 */
function ratioToScore(ratio: number): number {
  if (ratio <= 1.5) return 0
  // 1.5 → 0, 5 → 100 선형
  return Math.max(0, Math.min(100, ((ratio - 1.5) / 3.5) * 100))
}

interface AuctionResult {
  mooScore: number
  mocScore: number
  auctionDirection: 'moo-buy' | 'moo-sell' | 'moc-buy' | 'moc-sell' | null
}

function detectAuctionFootprint(bars: AlgoBar[]): AuctionResult {
  if (bars.length < 5) {
    return { mooScore: 0, mocScore: 0, auctionDirection: null }
  }
  // 첫·마지막 봉을 제외한 중앙값 거래량 (양 끝 자체가 노이즈가 되지 않도록)
  const middleVolumes = bars.slice(1, -1).map(b => b.volume).filter(v => v > 0)
  const baseline = median(middleVolumes)
  if (baseline <= 0) return { mooScore: 0, mocScore: 0, auctionDirection: null }

  const first = bars[0]
  const last = bars[bars.length - 1]

  const mooRatio = first.volume / baseline
  const mocRatio = last.volume / baseline

  const mooScore = ratioToScore(mooRatio)
  const mocScore = ratioToScore(mocRatio)

  const dirOf = (b: AlgoBar): 'buy' | 'sell' | null => {
    const range = b.high - b.low
    if (range <= 0) {
      if (b.close > b.open) return 'buy'
      if (b.close < b.open) return 'sell'
      return null
    }
    const pos = (b.close - b.low) / range
    if (b.close > b.open && pos > 0.55) return 'buy'
    if (b.close < b.open && pos < 0.45) return 'sell'
    if (pos > 0.6) return 'buy'
    if (pos < 0.4) return 'sell'
    return null
  }

  // 더 강한 쪽을 채택. 같으면 MOC 우선(NAV 추종 패시브 머니 신호로서 유의미).
  let auctionDirection: AuctionResult['auctionDirection'] = null
  const mocStronger = mocScore >= mooScore
  if (mocStronger && mocScore >= 50) {
    const d = dirOf(last)
    if (d === 'buy') auctionDirection = 'moc-buy'
    else if (d === 'sell') auctionDirection = 'moc-sell'
  } else if (!mocStronger && mooScore >= 50) {
    const d = dirOf(first)
    if (d === 'buy') auctionDirection = 'moo-buy'
    else if (d === 'sell') auctionDirection = 'moo-sell'
  }

  return { mooScore, mocScore, auctionDirection }
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
      mooScore: 0,
      mocScore: 0,
      dominantAlgo: null,
      direction: 'neutral',
      auctionDirection: null,
    }
  }

  const twapScore = scoreTwap(bars)
  const vwapScore = scoreVwap(bars)
  const icebergScore = scoreIceberg(bars)
  const sniperScore = scoreSniper(bars)
  const { mooScore, mocScore, auctionDirection } = detectAuctionFootprint(bars)

  type AlgoLabel = 'TWAP' | 'VWAP' | 'Iceberg' | 'Sniper' | 'MOO' | 'MOC'
  const scores: { algo: AlgoLabel; score: number }[] = [
    { algo: 'TWAP', score: twapScore },
    { algo: 'VWAP', score: vwapScore },
    { algo: 'Iceberg', score: icebergScore },
    { algo: 'Sniper', score: sniperScore },
    { algo: 'MOO', score: mooScore },
    { algo: 'MOC', score: mocScore },
  ]
  scores.sort((a, b) => b.score - a.score)
  const dominantAlgo = scores[0].score >= 40 ? scores[0].algo : null

  const direction = detectDirection(bars)

  return {
    twapScore,
    vwapScore,
    icebergScore,
    sniperScore,
    mooScore,
    mocScore,
    dominantAlgo,
    direction,
    auctionDirection,
  }
}
