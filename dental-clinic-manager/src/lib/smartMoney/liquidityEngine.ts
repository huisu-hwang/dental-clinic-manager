/**
 * 유동성 풀 / 스윕 검출 (SMC) — Equal-Highs / Equal-Lows / PDH / PDL
 *
 * - 스윙 하이/로우는 5봉 프랙탈(±2 이웃 대비 국부극값)로 검출
 * - 0.2% 이내로 모이는 스윙 하이 클러스터 → equal-highs 풀 (level = 평균)
 * - 0.2% 이내로 모이는 스윙 로우 클러스터 → equal-lows 풀
 * - dailyBars ≥ 2 이면 second-to-last day 의 high/low → PDH/PDL 풀
 * - 단독 스윙은 swing-high / swing-low 풀
 *
 * - 스윕 검출(최근 20봉 스캔):
 *   bullish-sweep: bar.low < pool.level*0.999 AND bar.close > pool.level
 *                  AND lower-wick > 50% range AND volume > 1.3x avg(20)
 *   bearish-sweep: bar.high > pool.level*1.001 AND bar.close < pool.level
 *                  AND upper-wick > 50% range AND volume > 1.3x avg(20)
 * - 풀이 한번 hit 되면 swept=true, recentSweeps 에 newest-first 로 누적 (max 5)
 *
 * - bars.length < 20 이면 안전 기본값 반환
 */

import type { LiquidityResult, LiquidityPool, SweepEvent } from '@/types/smartMoney'

export interface LiquidityBar {
  datetime: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const MIN_BARS = 20
const CLUSTER_TOLERANCE = 0.002 // 0.2%
const SWEEP_LOOKBACK = 20
const SWEEP_VOL_RATIO = 1.3
const MAX_RECENT_SWEEPS = 5

// ============================================
// 스윙 포인트 (5봉 프랙탈)
// ============================================
interface SwingPoint {
  barIndex: number
  price: number
}

function findSwingHighs(bars: LiquidityBar[]): SwingPoint[] {
  const out: SwingPoint[] = []
  for (let i = 2; i < bars.length - 2; i++) {
    const h = bars[i].high
    if (
      h > bars[i - 1].high &&
      h > bars[i - 2].high &&
      h > bars[i + 1].high &&
      h > bars[i + 2].high
    ) {
      out.push({ barIndex: i, price: h })
    }
  }
  return out
}

function findSwingLows(bars: LiquidityBar[]): SwingPoint[] {
  const out: SwingPoint[] = []
  for (let i = 2; i < bars.length - 2; i++) {
    const l = bars[i].low
    if (
      l < bars[i - 1].low &&
      l < bars[i - 2].low &&
      l < bars[i + 1].low &&
      l < bars[i + 2].low
    ) {
      out.push({ barIndex: i, price: l })
    }
  }
  return out
}

// ============================================
// 클러스터링 (0.2% 이내)
// ============================================
function clusterSwings(
  swings: SwingPoint[],
  tolerancePct: number,
): { level: number; size: number }[] {
  if (swings.length === 0) return []
  const sorted = [...swings].sort((a, b) => a.price - b.price)
  const clusters: { level: number; size: number }[] = []
  let bucket: SwingPoint[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const ref = bucket[0].price
    if (ref <= 0) {
      bucket = [sorted[i]]
      continue
    }
    if (Math.abs(sorted[i].price - ref) / ref <= tolerancePct) {
      bucket.push(sorted[i])
    } else {
      const avg = bucket.reduce((s, p) => s + p.price, 0) / bucket.length
      clusters.push({ level: avg, size: bucket.length })
      bucket = [sorted[i]]
    }
  }
  if (bucket.length > 0) {
    const avg = bucket.reduce((s, p) => s + p.price, 0) / bucket.length
    clusters.push({ level: avg, size: bucket.length })
  }
  return clusters
}

// ============================================
// 풀 빌드
// ============================================
function buildPools(
  bars: LiquidityBar[],
  dailyBars?: LiquidityBar[],
): LiquidityPool[] {
  const pools: LiquidityPool[] = []

  const swingHighs = findSwingHighs(bars)
  const swingLows = findSwingLows(bars)

  const highClusters = clusterSwings(swingHighs, CLUSTER_TOLERANCE)
  const lowClusters = clusterSwings(swingLows, CLUSTER_TOLERANCE)

  for (const c of highClusters) {
    pools.push({
      level: c.level,
      type: c.size >= 2 ? 'equal-highs' : 'swing-high',
      hits: c.size,
      swept: false,
    })
  }
  for (const c of lowClusters) {
    pools.push({
      level: c.level,
      type: c.size >= 2 ? 'equal-lows' : 'swing-low',
      hits: c.size,
      swept: false,
    })
  }

  // PDH/PDL — second-to-last 일봉
  if (dailyBars && dailyBars.length >= 2) {
    const prev = dailyBars[dailyBars.length - 2]
    if (prev && prev.high > 0) {
      pools.push({ level: prev.high, type: 'pdh', hits: 1, swept: false })
    }
    if (prev && prev.low > 0) {
      pools.push({ level: prev.low, type: 'pdl', hits: 1, swept: false })
    }
  }

  return pools
}

// ============================================
// 거래량 평균 (마지막 N봉)
// ============================================
function avgVolume(bars: LiquidityBar[], window: number): number {
  const start = Math.max(0, bars.length - window)
  let sum = 0
  let count = 0
  for (let i = start; i < bars.length; i++) {
    if (bars[i].volume > 0) {
      sum += bars[i].volume
      count++
    }
  }
  return count > 0 ? sum / count : 0
}

// ============================================
// 스윕 스캔 (최근 20봉)
// ============================================
function detectSweeps(
  bars: LiquidityBar[],
  pools: LiquidityPool[],
): SweepEvent[] {
  const sweeps: SweepEvent[] = []
  const n = bars.length
  if (n < SWEEP_LOOKBACK) return sweeps
  const baseAvg = avgVolume(bars, SWEEP_LOOKBACK)
  if (baseAvg <= 0) return sweeps

  const scanStart = Math.max(0, n - SWEEP_LOOKBACK)

  // 풀 타입별로 long(low-sweep)/short(high-sweep) 분류
  const lowSidePools = pools.filter(p => p.type === 'equal-lows' || p.type === 'pdl' || p.type === 'swing-low')
  const highSidePools = pools.filter(p => p.type === 'equal-highs' || p.type === 'pdh' || p.type === 'swing-high')

  for (let i = scanStart; i < n; i++) {
    const b = bars[i]
    const range = b.high - b.low
    if (range <= 0) continue
    const bodyLow = Math.min(b.open, b.close)
    const bodyHigh = Math.max(b.open, b.close)
    const lowerWick = (bodyLow - b.low) / range
    const upperWick = (b.high - bodyHigh) / range
    const volSpike = b.volume / baseAvg

    // bullish-sweep — 저점 풀 사냥
    for (const pool of lowSidePools) {
      if (pool.level <= 0) continue
      if (b.low >= pool.level * 0.999) continue
      if (b.close <= pool.level) continue
      if (lowerWick <= 0.5) continue
      if (volSpike <= SWEEP_VOL_RATIO) continue
      pool.swept = true
      sweeps.push({
        direction: 'bullish-sweep',
        level: pool.level,
        barIndex: i,
        wickRatio: lowerWick,
        volumeSpike: volSpike,
        recoveredInside: b.close > pool.level,
        description: `Bullish sweep of ${pool.type} @ ${pool.level.toFixed(2)}`,
      })
    }

    // bearish-sweep — 고점 풀 사냥
    for (const pool of highSidePools) {
      if (pool.level <= 0) continue
      if (b.high <= pool.level * 1.001) continue
      if (b.close >= pool.level) continue
      if (upperWick <= 0.5) continue
      if (volSpike <= SWEEP_VOL_RATIO) continue
      pool.swept = true
      sweeps.push({
        direction: 'bearish-sweep',
        level: pool.level,
        barIndex: i,
        wickRatio: upperWick,
        volumeSpike: volSpike,
        recoveredInside: b.close < pool.level,
        description: `Bearish sweep of ${pool.type} @ ${pool.level.toFixed(2)}`,
      })
    }
  }

  // newest-first, 최대 5개
  sweeps.sort((a, b) => b.barIndex - a.barIndex)
  return sweeps.slice(0, MAX_RECENT_SWEEPS)
}

// ============================================
// 메인 엔트리
// ============================================
export function analyzeLiquidity(
  bars: LiquidityBar[],
  dailyBars?: LiquidityBar[],
): LiquidityResult {
  if (!bars || bars.length < MIN_BARS) {
    return { pools: [], recentSweeps: [], description: '데이터 부족' }
  }

  const pools = buildPools(bars, dailyBars)
  const recentSweeps = detectSweeps(bars, pools)

  const eqHighs = pools.filter(p => p.type === 'equal-highs').length
  const eqLows = pools.filter(p => p.type === 'equal-lows').length
  const sweepCount = recentSweeps.length

  const description =
    `유동성 풀 ${pools.length}개 (EH ${eqHighs} / EL ${eqLows}) — 최근 스윕 ${sweepCount}건`

  return { pools, recentSweeps, description }
}
