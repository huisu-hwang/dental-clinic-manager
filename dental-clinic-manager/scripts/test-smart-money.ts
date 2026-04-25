/**
 * Smart Money 지표 단위 검증
 *
 * 합성 데이터 시나리오:
 * 1. 매집 시나리오: 가격 횡보 + 거래량 증가 + 종가가 일봉 상단 마감 → SMI 양수 기대
 * 2. 분산 시나리오: 가격 신고가 시도 + 거래량 감소 + 종가가 일봉 하단 마감 → SMI 음수 기대
 * 3. Spring 시나리오: 지지선 가짜 이탈 후 종가 회복 → +1 spring
 * 4. Upthrust 시나리오: 저항선 가짜 돌파 후 종가 약세 → +1 upthrust
 */

import { calculateIndicators } from '../src/lib/indicatorEngine'
import type { OHLCV, IndicatorConfig } from '../src/types/investment'

function makeBar(date: string, o: number, h: number, l: number, c: number, v: number): OHLCV {
  return { date, open: o, high: h, low: l, close: c, volume: v }
}

// 시나리오 1: 매집 (50봉) - 가격 100 횡보, 거래량 점증, 종가가 일봉 상단 (CLV ≈ +0.7)
function makeAccumulation(): OHLCV[] {
  const bars: OHLCV[] = []
  for (let i = 0; i < 50; i++) {
    const date = `2025-01-${String(i + 1).padStart(2, '0')}`
    // close in upper half, volume increasing
    bars.push(makeBar(date, 99, 101, 98, 100.5, 1000 + i * 50))
  }
  return bars
}

// 시나리오 2: 분산 (50봉) - 가격 상승 시도하지만 종가 약세, 거래량 점감
function makeDistribution(): OHLCV[] {
  const bars: OHLCV[] = []
  for (let i = 0; i < 50; i++) {
    const date = `2025-01-${String(i + 1).padStart(2, '0')}`
    // close in lower half, volume decreasing
    bars.push(makeBar(date, 100, 102, 99, 99.5, 5000 - i * 50))
  }
  return bars
}

// 시나리오 3: Spring (40봉 + 1 Spring 봉)
function makeSpring(): OHLCV[] {
  const bars: OHLCV[] = []
  // 40봉 횡보 (low ~95, high ~102)
  for (let i = 0; i < 40; i++) {
    const date = `2025-02-${String(i + 1).padStart(2, '0')}`
    bars.push(makeBar(date, 99, 102, 95, 100, 1000))
  }
  // Spring 봉: low 92 (지지선 95 이탈), close 101 (회복+상단), volume 3000 (3배)
  bars.push(makeBar('2025-03-12', 99, 101.5, 92, 101, 3000))
  return bars
}

// 시나리오 4: Upthrust (40봉 + 1 Upthrust 봉)
function makeUpthrust(): OHLCV[] {
  const bars: OHLCV[] = []
  for (let i = 0; i < 40; i++) {
    const date = `2025-04-${String(i + 1).padStart(2, '0')}`
    bars.push(makeBar(date, 99, 102, 98, 100, 1000))
  }
  // Upthrust: high 105 (저항 102 돌파), close 99 (하단 마감), volume 3000
  bars.push(makeBar('2025-05-12', 100, 105, 98.5, 99, 3000))
  return bars
}

// 시나리오 5: 일일 펄스 - 강한 매집 마감 봉
function makeDailyAccumBar(): OHLCV[] {
  const bars: OHLCV[] = []
  for (let i = 0; i < 25; i++) {
    bars.push(makeBar(`2025-06-${String(i + 1).padStart(2, '0')}`, 100, 101, 99, 100, 1000))
  }
  // Day +25: 갭 하락 후 종가 회복, 거래량 2배, 종가 일봉 상단
  bars.push(makeBar('2025-07-01', 98, 102, 97, 101.5, 2000))
  return bars
}

// 시나리오 6: 일일 펄스 - 강한 분산 마감 봉 (Gap Fade)
function makeDailyDistBar(): OHLCV[] {
  const bars: OHLCV[] = []
  for (let i = 0; i < 25; i++) {
    bars.push(makeBar(`2025-08-${String(i + 1).padStart(2, '0')}`, 100, 101, 99, 100, 1000))
  }
  // 갭 상승 후 종가가 시가 아래 (Gap Fade), 거래량 2배, 종가 일봉 하단
  bars.push(makeBar('2025-09-01', 102.5, 103, 99, 99.5, 2000))
  return bars
}

const smartMoney: IndicatorConfig = {
  id: 'SMART_MONEY_20_20_10_10',
  type: 'SMART_MONEY',
  params: { cmfPeriod: 20, divergenceLookback: 20, springLookback: 10, upthrustLookback: 10 },
}
const dailyPulse: IndicatorConfig = {
  id: 'DAILY_SMART_MONEY_PULSE_20',
  type: 'DAILY_SMART_MONEY_PULSE',
  params: { volPeriod: 20 },
}

const scenarios = [
  { name: '시나리오 1: 매집 (CLV+, vol↑)', bars: makeAccumulation(), expect: 'SMI > 0' },
  { name: '시나리오 2: 분산 (CLV-, vol↓)', bars: makeDistribution(), expect: 'SMI < 0' },
  { name: '시나리오 3: Spring 단봉', bars: makeSpring(), expect: 'SMI 마지막 큰 양수' },
  { name: '시나리오 4: Upthrust 단봉', bars: makeUpthrust(), expect: 'SMI 마지막 큰 음수' },
  { name: '시나리오 5: 일일 매집 봉', bars: makeDailyAccumBar(), expect: 'Pulse > 50' },
  { name: '시나리오 6: 일일 Gap Fade', bars: makeDailyDistBar(), expect: 'Pulse < 0' },
]

console.log('═══════════════ Smart Money 지표 검증 ═══════════════\n')

for (const sc of scenarios) {
  const results = calculateIndicators(sc.bars, [smartMoney, dailyPulse])
  const smi = results['SMART_MONEY_20_20_10_10'] as number[]
  const pulse = results['DAILY_SMART_MONEY_PULSE_20'] as number[]
  const lastSmi = smi[smi.length - 1]
  const lastPulse = pulse[pulse.length - 1]
  const recentSmi = smi.slice(-5).map(v => (v as number).toFixed(1))
  const recentPulse = pulse.slice(-5).map(v => (v as number).toFixed(1))

  console.log(`📊 ${sc.name}`)
  console.log(`   기대: ${sc.expect}`)
  console.log(`   SMI 최근 5봉: [${recentSmi.join(', ')}]  (마지막=${lastSmi})`)
  console.log(`   Pulse 최근 5봉: [${recentPulse.join(', ')}]  (마지막=${lastPulse})`)
  console.log()
}
