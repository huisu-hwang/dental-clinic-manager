/**
 * 알고리즘 풋프린트 엔진 — TWAP / VWAP / Iceberg / Sniper / MOO / MOC
 *
 * - TWAP score   : 가운데 시간대 거래량의 robust CV(IQR/median) 역수
 *                  iqrRatio ≤ 0.2 → 100점, iqrRatio ≥ 1.0 → 0점으로 임계 강화
 *                  (자연 인트라데이도 0.5~0.8 범위라 종전 매핑은 변별력 낮았음)
 * - VWAP score   : 5구간 거래량 분포(ratio-of-mean)와 U-shape 기준 Pearson 상관계수
 *                  r ≤ 0.3 → 0점, r ≥ 0.9 → 100점 (cosine은 모든 양수 벡터에서
 *                  항상 > 0 이라 변별력이 없었음 → 중심화한 Pearson으로 교체)
 * - Iceberg score: ±5% 가격대 클러스터에서 동일 크기 체결이 반복되는 횟수
 * - Sniper score : 상위 5% 거래량 봉 직후의 가격 변화율 / 평균 가격 변화율
 * - MOO score    : 첫 봉(시가 동시호가) 거래량이 일중 중앙값 대비 얼마나 큰가
 * - MOC score    : 마지막 봉(종가 동시호가) 거래량이 일중 중앙값 대비 얼마나 큰가
 *
 * - dominantAlgo     : 최고 점수가 60점 이상일 때만 부여 (종전 40 → 60으로 상향)
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
// TWAP — 가운데 시간대 거래량 균등성 (robust CV 기반)
//
// 원리: TWAP(Time-Weighted Average Price) 알고리즘은 정해진 시간 간격으로
// 동일량을 균등 매매. 시초·마감 동시호가는 자연 폭증이라 측정에서 제외하고,
// 가운데 시간대 거래량 분포가 균등할수록 TWAP 시그니처 강함.
//
// outlier에 민감한 std/mean 대신 IQR/median 사용 (robust)
// ============================================
function scoreTwap(bars: AlgoBar[]): number {
  if (bars.length < 60) return 0 // 1시간 미만이면 측정 불가
  // 시초 30분 + 마감 30분 제외 — 정규장 자연 폭증 구간 outlier 제거
  const trim = Math.min(30, Math.floor(bars.length * 0.1))
  const middle = bars.slice(trim, bars.length - trim)
  if (middle.length < 30) return 0
  const volumes = middle.map(b => b.volume).filter(v => v > 0)
  if (volumes.length < 30) return 0
  const sorted = [...volumes].sort((a, b) => a - b)
  const q1 = sorted[Math.floor(sorted.length * 0.25)]
  const q3 = sorted[Math.floor(sorted.length * 0.75)]
  const median = sorted[Math.floor(sorted.length * 0.5)]
  if (median <= 0) return 0
  const iqrRatio = (q3 - q1) / median // robust CV (1차 분산/중심)
  // 자연 인트라데이도 iqrRatio 0.5~0.8 범위라 종전 (2→0) 매핑은 대부분의 날에서
  // 60점 이상을 만들어 변별력이 없었음. 진짜 TWAP 알고리즘 시그니처는 매우 평탄한
  // 분포(< 0.3)를 만들어야 하므로 임계를 다음과 같이 강화:
  // iqrRatio ≤ 0.2 → 100점, iqrRatio ≥ 1.0 → 0점
  if (iqrRatio <= 0.2) return 100
  if (iqrRatio >= 1.0) return 0
  return Math.round(((1.0 - iqrRatio) / 0.8) * 100)
}

// ============================================
// VWAP — U-shape 표준곡선 Pearson 상관계수
// (장 시작/종료 부근에 거래량 집중되는 자연스러운 패턴 ≈ VWAP 알고)
//
// 종전 코사인 유사도는 두 벡터 모두 양수이므로 항상 > 0 → 어떤 정상 거래일도
// 80~95점이 나와 변별력이 없었음. 평균 중심화한 Pearson 상관계수로 교체하면
// 형상(shape)만을 비교하여 진짜 U-shape에서만 높은 점수를 부여한다.
// r ≤ 0.3 → 0점, r ≥ 0.9 → 100점 (그 사이 선형 보간).
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
  const totalVol = bucket.reduce((s, v) => s + v, 0)
  if (totalVol <= 0) return 0
  // ratio-of-mean 정규화: 각 버킷 / 평균
  const mean = totalVol / buckets
  const normBucket = bucket.map(v => v / mean)
  // U-shape 표준 (양 끝 강 / 가운데 약)
  const uShape = [1.5, 0.7, 0.5, 0.7, 1.5]
  // Pearson 상관계수 (normBucket vs uShape)
  const meanX = normBucket.reduce((s, v) => s + v, 0) / buckets
  const meanY = uShape.reduce((s, v) => s + v, 0) / buckets
  let num = 0, denX = 0, denY = 0
  for (let i = 0; i < buckets; i++) {
    const dx = normBucket[i] - meanX
    const dy = uShape[i] - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  if (denX === 0 || denY === 0) return 0
  const r = num / Math.sqrt(denX * denY)
  // r ≤ 0.3 → 0점, r ≥ 0.9 → 100점
  if (r <= 0.3) return 0
  if (r >= 0.9) return 100
  return Math.round(((r - 0.3) / 0.6) * 100)
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

  // 데이터 양에 비례한 임계값 — 봉 수의 3%(min 4) → 0점, 10%(min 12) → 100점
  // 1분봉이 5분봉보다 봉당 거래량 작아 클러스터 형성 더 어려움 → 임계 완화
  const minCluster = Math.max(4, Math.ceil(bars.length * 0.03))
  const maxCluster = Math.max(12, Math.ceil(bars.length * 0.10))
  if (bestCluster < minCluster) return 0
  const range = Math.max(1, maxCluster - minCluster)
  return Math.max(0, Math.min(100, ((bestCluster - minCluster) / range) * 100))
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
 * ratio ≤ 5 → 0 / ratio = 20 → 100
 *
 * 미국 정규장 시초가/종가 봉은 자연 패턴으로도 baseline의 5~15배 거래량이 흔함
 * (점심·중간 봉이 작아 median 자체가 작기 때문). 종전 1.2~4 매핑은 모든 종목에서
 * MOO/MOC=100을 만들어 변별력이 없었음.
 *
 * 진짜 MOO/MOC 알고리즘 신호(인덱스/패시브 펀드 NAV 추종 매매)는 그보다 더 큰
 * 거래량 집중을 보여야 하므로 임계 상향.
 */
function ratioToScore(ratio: number): number {
  if (ratio <= 5) return 0
  return Math.max(0, Math.min(100, ((ratio - 5) / 15) * 100))
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
/**
 * TWAP 방향 추정 — 전반부 vs 후반부 평균 종가 비교.
 * TWAP 알고는 시간 균등 매매하므로 그 시간 동안의 가격 추세 자체가 매수/매도 의도를 반영.
 */
export function inferTwapDirection(bars: AlgoBar[]): 'buy' | 'sell' | 'neutral' {
  if (bars.length < 30) return 'neutral'
  const half = Math.floor(bars.length / 2)
  const firstAvg = bars.slice(0, half).reduce((s, b) => s + b.close, 0) / half
  const secondAvg = bars.slice(half).reduce((s, b) => s + b.close, 0) / (bars.length - half)
  if (firstAvg <= 0) return 'neutral'
  const change = (secondAvg - firstAvg) / firstAvg
  if (change > 0.005) return 'buy'   // 0.5% 이상 상승 → 매수성 알고
  if (change < -0.005) return 'sell' // 0.5% 이상 하락 → 매도성 알고
  return 'neutral'
}

/**
 * VWAP 방향 추정 — 거래량 가중 평균 가격(VWAP) 계산 후 종가 위치로 판단.
 * 종가가 VWAP 위면 매수 우세, 아래면 매도 우세.
 */
export function inferVwapDirection(bars: AlgoBar[]): 'buy' | 'sell' | 'neutral' {
  if (bars.length < 5) return 'neutral'
  let pvSum = 0
  let vSum = 0
  for (const b of bars) {
    const typical = (b.high + b.low + b.close) / 3
    pvSum += typical * b.volume
    vSum += b.volume
  }
  if (vSum === 0) return 'neutral'
  const vwap = pvSum / vSum
  const lastClose = bars[bars.length - 1].close
  if (vwap <= 0) return 'neutral'
  const diff = (lastClose - vwap) / vwap
  if (diff > 0.003) return 'buy'   // VWAP 0.3% 이상 위 → 매수 우세
  if (diff < -0.003) return 'sell' // VWAP 0.3% 이상 아래 → 매도 우세
  return 'neutral'
}

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
//
// bars        : TWAP / VWAP / Iceberg / Sniper 점수 계산용 (1~2 거래일치 권장)
// auctionBars : MOO / MOC 점수 계산용 (반드시 단일 거래일치 — 시·종가 봉이 양 끝)
//               생략 시 bars 전체로 계산 (단일 거래일이라 가정).
//               2일치 이상이면 첫·마지막 봉이 어제·오늘에 걸쳐있어 MOO/MOC가 왜곡됨.
// ============================================
export function analyzeAlgoFootprint(
  bars: AlgoBar[],
  auctionBars?: AlgoBar[],
): AlgoFootprintResult {
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
      twapDirection: 'neutral',
      vwapDirection: 'neutral',
    }
  }

  const twapScore = scoreTwap(bars)
  const vwapScore = scoreVwap(bars)
  const icebergScore = scoreIceberg(bars)
  const sniperScore = scoreSniper(bars)
  const { mooScore, mocScore, auctionDirection } = detectAuctionFootprint(
    auctionBars && auctionBars.length > 0 ? auctionBars : bars,
  )

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
  const dominantAlgo = scores[0].score >= 60 ? scores[0].algo : null

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
    twapDirection: inferTwapDirection(bars),
    vwapDirection: inferVwapDirection(bars),
  }
}
