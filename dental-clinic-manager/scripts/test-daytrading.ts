/**
 * 단타(Day Trading) 모듈 검증 스크립트
 *
 * 1) 합성 데이터 5개 시나리오로 5종 분봉 지표 검증
 * 2) yahoo-finance2로 AAPL 5분봉 7일치 가져와 실데이터 백테스트
 */

import YahooFinance from 'yahoo-finance2'
import { calculateIndicators } from '../src/lib/indicatorEngine'
import { runDayTradingBacktest } from '../src/lib/dayTradingBacktestEngine'
import type {
  OHLCV, IndicatorConfig, ConditionGroup, RiskSettings,
} from '../src/types/investment'

const yf = new YahooFinance()

// ============================================
// 합성 데이터 헬퍼
// ============================================

const TRADING_HOURS = [
  '09:30', '09:35', '09:40', '09:45', '09:50', '09:55',
  '10:00', '10:05', '10:10', '10:15', '10:20', '10:25', '10:30', '10:35', '10:40', '10:45', '10:50', '10:55',
  '11:00', '11:05', '11:10', '11:15', '11:20', '11:25', '11:30', '11:35', '11:40', '11:45', '11:50', '11:55',
  '12:00', '12:05', '12:10', '12:15', '12:20', '12:25', '12:30', '12:35', '12:40', '12:45', '12:50', '12:55',
  '13:00', '13:05', '13:10', '13:15', '13:20', '13:25', '13:30', '13:35', '13:40', '13:45', '13:50', '13:55',
  '14:00', '14:05', '14:10', '14:15', '14:20', '14:25', '14:30', '14:35', '14:40', '14:45', '14:50', '14:55',
  '15:00', '15:05', '15:10', '15:15', '15:20', '15:25', '15:30', '15:35', '15:40', '15:45', '15:50', '15:55',
]
// 78봉/일 (9:30 ~ 15:55, 5분봉)

const DAYS = ['2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17']

interface BarSpec {
  o: number; h: number; l: number; c: number; v: number
}

/** 거래일 5일 × 78봉 = 390봉 생성 */
function buildBars(barFn: (dayIdx: number, barIdx: number) => BarSpec): OHLCV[] {
  const bars: OHLCV[] = []
  for (let d = 0; d < DAYS.length; d++) {
    for (let b = 0; b < TRADING_HOURS.length; b++) {
      const spec = barFn(d, b)
      bars.push({
        date: `${DAYS[d]}T${TRADING_HOURS[b]}:00`,
        open: spec.o,
        high: spec.h,
        low: spec.l,
        close: spec.c,
        volume: spec.v,
      })
    }
  }
  return bars
}

// ============================================
// 시나리오 정의
// ============================================

// A: 강한 상승 추세 (CLV+, 거래량 일정 증가)
function scenarioStrongUp(): OHLCV[] {
  return buildBars((d, b) => {
    const t = d * TRADING_HOURS.length + b
    const base = 100 + t * 0.05    // 점진적 상승
    return {
      o: base,
      h: base + 0.6,
      l: base - 0.1,
      c: base + 0.5,                // 종가 상단 → CLV +
      v: 1000 + t * 5,
    }
  })
}

// B: 강한 하락 추세 (CLV-)
function scenarioStrongDown(): OHLCV[] {
  return buildBars((d, b) => {
    const t = d * TRADING_HOURS.length + b
    const base = 100 - t * 0.04
    return {
      o: base,
      h: base + 0.1,
      l: base - 0.6,
      c: base - 0.5,                // 종가 하단 → CLV -
      v: 1000 + t * 5,
    }
  })
}

// C: ORB 돌파 시나리오 — 첫 30분 박스, 이후 상방 돌파
function scenarioORBBreakout(): OHLCV[] {
  return buildBars((d, b) => {
    if (b < 6) {
      // 첫 30분 박스: 100 ~ 101 사이
      return { o: 100.5, h: 101, l: 100, c: 100.5, v: 800 }
    }
    // 이후 ORB.high(101) 위로 돌파 → 102 ~ 105 추세
    const above = 101 + (b - 6) * 0.05
    return { o: above, h: above + 0.5, l: above - 0.1, c: above + 0.4, v: 1500 }
  })
}

// D: 장 마감 거래량 급증 → CLOSING_PRESSURE 높음
function scenarioClosingSpike(): OHLCV[] {
  return buildBars((d, b) => {
    const last6 = b >= TRADING_HOURS.length - 6
    const vol = last6 ? 10000 : 500   // 마지막 6봉만 거래량 20배
    return { o: 100, h: 100.5, l: 99.5, c: 100, v: vol }
  })
}

// E: 단봉 대형 거래 → LARGE_BLOCK > 5
function scenarioLargeBlock(): OHLCV[] {
  return buildBars((d, b) => {
    // 평균은 1000, 매일 10:00 봉(인덱스 6)만 거래량 10배
    const vol = b === 6 ? 10000 : 1000
    return { o: 100, h: 100.5, l: 99.5, c: 100, v: vol }
  })
}

// ============================================
// 합성 데이터 검증
// ============================================

const indicatorConfigs: IndicatorConfig[] = [
  { id: 'VWAP', type: 'VWAP', params: {} },
  { id: 'ORB_6', type: 'OPENING_RANGE', params: { numBars: 6 } },
  { id: 'LB_20', type: 'LARGE_BLOCK', params: { period: 20 } },
  { id: 'CP_6', type: 'CLOSING_PRESSURE', params: { lastNumBars: 6 } },
  { id: 'PULSE_20', type: 'INTRADAY_PULSE', params: { volPeriod: 20 } },
]

function validateScenario(name: string, bars: OHLCV[], expects: string) {
  const r = calculateIndicators(bars, indicatorConfigs)
  const vwap = r['VWAP'] as number[]
  const orb = r['ORB_6'] as Record<string, number>[]
  const lb = r['LB_20'] as number[]
  const cp = r['CP_6'] as number[]
  const pulse = r['PULSE_20'] as number[]

  const lastIdx = bars.length - 1
  const last = bars[lastIdx]

  console.log(`\n📊 ${name}`)
  console.log(`   기대: ${expects}`)
  console.log(`   봉수: ${bars.length}, 첫 봉=${bars[0].date}, 마지막 봉=${last.date}`)

  // 마지막 봉 기준 지표값
  console.log(`   [마지막 봉] close=${last.close.toFixed(2)} vwap=${vwap[lastIdx]?.toFixed(2)} ` +
    `orb=(H ${orb[lastIdx]?.high?.toFixed(2)}, L ${orb[lastIdx]?.low?.toFixed(2)}) ` +
    `lb=${lb[lastIdx]?.toFixed(2)} cp=${cp[lastIdx]?.toFixed(2)}% pulse=${pulse[lastIdx]?.toFixed(2)}`)

  // 핵심 통계
  const validPulse = pulse.filter(v => !isNaN(v))
  const avgPulse = validPulse.length ? validPulse.reduce((a, b) => a + b, 0) / validPulse.length : NaN
  const maxLB = Math.max(...lb.filter(v => !isNaN(v)))
  const maxCP = Math.max(...cp)
  const aboveVWAP = bars.filter((b, i) => !isNaN(vwap[i]) && b.close > vwap[i]).length
  const belowVWAP = bars.filter((b, i) => !isNaN(vwap[i]) && b.close < vwap[i]).length

  console.log(`   [통계] pulse 평균=${avgPulse.toFixed(2)}, ` +
    `LB 최대=${maxLB.toFixed(2)}, CP 최대=${maxCP.toFixed(2)}%, ` +
    `가격>VWAP=${aboveVWAP}봉, <VWAP=${belowVWAP}봉`)

  // ORB 돌파 카운트 (시나리오 C 검증용)
  let orbBreakouts = 0
  for (let i = 0; i < bars.length; i++) {
    if (orb[i] && !isNaN(orb[i].high) && bars[i].close > orb[i].high) orbBreakouts++
  }
  console.log(`   [ORB] 종가 > ORB.high: ${orbBreakouts}봉`)
}

// ============================================
// 실데이터 백테스트 (AAPL 5분봉)
// ============================================

async function fetchIntraday5m(symbol: string, days: number): Promise<OHLCV[]> {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  const result = await yf.chart(symbol, {
    period1: start,
    period2: end,
    interval: '5m',
  })
  return result.quotes
    .filter(q => q.open != null && q.high != null && q.low != null && q.close != null && q.volume != null)
    .map(q => ({
      date: q.date.toISOString().slice(0, 19),  // 'YYYY-MM-DDTHH:mm:ss'
      open: q.open!,
      high: q.high!,
      low: q.low!,
      close: q.close!,
      volume: q.volume!,
    }))
}

async function realDataBacktest() {
  console.log('\n═══════════════ 실데이터 검증 (AAPL 5분봉, 7일) ═══════════════')
  let bars: OHLCV[]
  try {
    bars = await fetchIntraday5m('AAPL', 7)
  } catch (e) {
    console.error('Yahoo Finance 5분봉 조회 실패:', (e as Error).message)
    return
  }

  console.log(`데이터: ${bars.length}봉 (${bars[0]?.date} ~ ${bars[bars.length - 1]?.date})`)
  if (bars.length < 50) {
    console.log('데이터 부족 — 백테스트 생략')
    return
  }

  // 거래일 분포
  const dayCounts = new Map<string, number>()
  for (const b of bars) {
    const d = b.date.slice(0, 10)
    dayCounts.set(d, (dayCounts.get(d) || 0) + 1)
  }
  console.log(`거래일: ${Array.from(dayCounts.entries()).map(([d, n]) => `${d}(${n})`).join(', ')}`)

  // 지표 통계
  const indResults = calculateIndicators(bars, indicatorConfigs)
  const pulse = indResults['PULSE_20'] as number[]
  const vwap = indResults['VWAP'] as number[]
  const validPulse = pulse.filter(v => !isNaN(v))
  if (validPulse.length > 0) {
    const minP = Math.min(...validPulse).toFixed(2)
    const maxP = Math.max(...validPulse).toFixed(2)
    const avgP = (validPulse.reduce((a, b) => a + b, 0) / validPulse.length).toFixed(2)
    console.log(`PULSE 통계: min=${minP}, max=${maxP}, avg=${avgP} (유효 ${validPulse.length}봉)`)
  }
  const lastIdx = bars.length - 1
  console.log(`마지막 봉: close=${bars[lastIdx].close.toFixed(2)} vwap=${vwap[lastIdx]?.toFixed(2)} ` +
    `pulse=${pulse[lastIdx]?.toFixed(2)}`)

  // 단순 전략: PULSE > 50 매수, < -30 매도, 장 마감 강제 청산
  const buyConditions: ConditionGroup = {
    type: 'group',
    operator: 'AND',
    conditions: [
      {
        type: 'leaf',
        left: { type: 'indicator', id: 'PULSE_20' },
        operator: '>',
        right: { type: 'constant', value: 50 },
      },
    ],
  }
  const sellConditions: ConditionGroup = {
    type: 'group',
    operator: 'OR',
    conditions: [
      {
        type: 'leaf',
        left: { type: 'indicator', id: 'PULSE_20' },
        operator: '<',
        right: { type: 'constant', value: -30 },
      },
    ],
  }
  const riskSettings: RiskSettings = {
    maxDailyLossPercent: 5,
    maxPositions: 1,
    maxPositionSizePercent: 100,
    stopLossPercent: 1.5,
    takeProfitPercent: 3,
    maxHoldingDays: 12,  // 분봉 12개 = 60분 (단타)
  }

  const result = runDayTradingBacktest({
    prices: bars,
    indicators: indicatorConfigs,
    buyConditions,
    sellConditions,
    riskSettings,
    initialCapital: 10000,
    market: 'US',
    ticker: 'AAPL',
    barMinutes: 5,
    forceCloseAtSessionEnd: true,
  })

  console.log(`\n[백테스트 결과 — PULSE > 50 매수, < -30 매도, SL 1.5%, TP 3%, 최대보유 12봉]`)
  console.log(`  총 수익률: ${result.metrics.totalReturn.toFixed(2)}%`)
  console.log(`  거래 횟수: ${result.metrics.totalTrades}`)
  console.log(`  승률: ${result.metrics.winRate.toFixed(2)}%`)
  console.log(`  Profit Factor: ${result.metrics.profitFactor.toFixed(2)}`)
  console.log(`  Max Drawdown: ${result.metrics.maxDrawdown.toFixed(2)}%`)
  console.log(`  Sharpe Ratio: ${result.metrics.sharpeRatio.toFixed(2)}`)
  console.log(`  평균 보유 봉수: ${result.metrics.avgHoldingDays.toFixed(2)}`)
  console.log(`  Buy & Hold: ${result.buyHold.totalReturn.toFixed(2)}% (최종 $${result.buyHold.finalValue})`)
  if (result.trades.length > 0) {
    console.log(`  첫 거래: ${result.trades[0].entryDate} → ${result.trades[0].exitDate}, ` +
      `pnl=${result.trades[0].pnl.toFixed(2)} (${result.trades[0].pnlPercent.toFixed(2)}%)`)
    console.log(`  마지막 거래: ${result.trades[result.trades.length - 1].entryDate} → ` +
      `${result.trades[result.trades.length - 1].exitDate}, ` +
      `pnl=${result.trades[result.trades.length - 1].pnl.toFixed(2)}`)
  }
}

// ============================================
// 메인
// ============================================

async function main() {
  console.log('═══════════════ 단타 모듈 합성 데이터 검증 ═══════════════')
  validateScenario('A. 강한 상승 추세', scenarioStrongUp(),
    'pulse 평균 > 0, close > VWAP 다수')
  validateScenario('B. 강한 하락 추세', scenarioStrongDown(),
    'pulse 평균 < 0, close < VWAP 다수')
  validateScenario('C. ORB 돌파 추세', scenarioORBBreakout(),
    'ORB 돌파 카운트 > 0')
  validateScenario('D. 장 마감 거래량 급증', scenarioClosingSpike(),
    'CP 최대 ≈ 100% (마지막 봉이 마감 6봉 점유율 합)')
  validateScenario('E. 단봉 대형 거래', scenarioLargeBlock(),
    'LB 최대 > 5 (10배 거래량 봉)')

  await realDataBacktest()
  console.log('\n검증 완료.')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
