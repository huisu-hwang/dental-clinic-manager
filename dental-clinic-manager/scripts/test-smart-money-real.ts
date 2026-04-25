/**
 * 실제 데이터로 Smart Money 지표 검증 (Yahoo Finance)
 */
import YahooFinance from 'yahoo-finance2'
import { calculateIndicators } from '../src/lib/indicatorEngine'
import type { OHLCV, IndicatorConfig } from '../src/types/investment'

const yahooFinance = new YahooFinance()

async function fetchOHLCV(symbol: string, days: number): Promise<OHLCV[]> {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  const result = await yahooFinance.chart(symbol, {
    period1: start,
    period2: end,
    interval: '1d',
  })
  return result.quotes
    .filter(q => q.open != null && q.high != null && q.low != null && q.close != null && q.volume != null)
    .map(q => ({
      date: q.date.toISOString().slice(0, 10),
      open: q.open!,
      high: q.high!,
      low: q.low!,
      close: q.close!,
      volume: q.volume!,
    }))
}

const indicators: IndicatorConfig[] = [
  { id: 'SMART_MONEY_20_20_10_10', type: 'SMART_MONEY', params: { cmfPeriod: 20, divergenceLookback: 20, springLookback: 10, upthrustLookback: 10 } },
  { id: 'DAILY_SMART_MONEY_PULSE_20', type: 'DAILY_SMART_MONEY_PULSE', params: { volPeriod: 20 } },
  { id: 'RSI_14', type: 'RSI', params: { period: 14 } },
]

async function analyze(symbol: string, label: string) {
  console.log(`\n═══════════════ ${label} (${symbol}) ═══════════════`)
  const bars = await fetchOHLCV(symbol, 365 * 2)
  console.log(`데이터: ${bars.length}개 봉 (${bars[0]?.date} ~ ${bars[bars.length - 1]?.date})`)
  if (bars.length < 50) { console.log('데이터 부족'); return }

  const results = calculateIndicators(bars, indicators)
  const smi = results['SMART_MONEY_20_20_10_10'] as number[]
  const pulse = results['DAILY_SMART_MONEY_PULSE_20'] as number[]
  const rsi = results['RSI_14'] as number[]

  // 통계
  const valid = (arr: number[]) => arr.filter(v => !isNaN(v))
  const stats = (arr: number[]) => {
    const v = valid(arr)
    if (v.length === 0) return { min: 'N/A', max: 'N/A', avg: 'N/A' }
    const min = Math.min(...v).toFixed(2)
    const max = Math.max(...v).toFixed(2)
    const avg = (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)
    return { min, max, avg }
  }
  console.log(`SMI 통계: min=${stats(smi).min}, max=${stats(smi).max}, avg=${stats(smi).avg}`)
  console.log(`Pulse 통계: min=${stats(pulse).min}, max=${stats(pulse).max}, avg=${stats(pulse).avg}`)

  // 강한 매집/분산 신호 카운트
  const strongAccum = smi.filter(v => v > 30).length
  const strongDist = smi.filter(v => v < -30).length
  const strongDailyAccum = pulse.filter(v => v > 50).length
  const strongDailyDist = pulse.filter(v => v < -30).length
  console.log(`SMI > +30 (매집 신호): ${strongAccum}회 (${(strongAccum / valid(smi).length * 100).toFixed(1)}%)`)
  console.log(`SMI < -30 (분산 신호): ${strongDist}회 (${(strongDist / valid(smi).length * 100).toFixed(1)}%)`)
  console.log(`Pulse > +50 (일일 매집): ${strongDailyAccum}회 (${(strongDailyAccum / valid(pulse).length * 100).toFixed(1)}%)`)
  console.log(`Pulse < -30 (일일 분산): ${strongDailyDist}회 (${(strongDailyDist / valid(pulse).length * 100).toFixed(1)}%)`)

  // 최근 10봉 출력
  console.log(`\n최근 10봉:`)
  console.log('Date       | Close   | RSI   | SMI    | Pulse')
  console.log('-----------|---------|-------|--------|--------')
  for (let i = bars.length - 10; i < bars.length; i++) {
    const b = bars[i]
    const c = b.close.toFixed(2).padStart(7)
    const r = (rsi[i] ?? NaN).toFixed(1).padStart(5)
    const s = (smi[i] ?? NaN).toFixed(1).padStart(6)
    const p = (pulse[i] ?? NaN).toFixed(1).padStart(6)
    console.log(`${b.date} | ${c} | ${r} | ${s} | ${p}`)
  }

  // 전략 시뮬레이션: SMI > 30 매수, SMI < -20 매도 (단순 버전)
  let position = 0
  let cash = 10000
  let trades = 0
  let wins = 0
  let entryPrice = 0
  for (let i = 30; i < bars.length - 1; i++) {
    const nextOpen = bars[i + 1].open
    if (position === 0 && smi[i] > 30 && rsi[i] < 65) {
      position = cash / nextOpen
      entryPrice = nextOpen
      cash = 0
    } else if (position > 0 && (smi[i] < -20 || (i > 0 && smi[i - 1] > 0 && smi[i] < 0))) {
      cash = position * nextOpen
      trades++
      if (nextOpen > entryPrice) wins++
      position = 0
    }
  }
  if (position > 0) cash = position * bars[bars.length - 1].close
  const buyHold = (bars[bars.length - 1].close / bars[30].close - 1) * 100
  console.log(`\n전략 시뮬레이션 (SMI>30 매수, SMI<-20 매도):`)
  console.log(`  최종 자본: $${cash.toFixed(0)} (시작 $10000, 수익률 ${((cash / 10000 - 1) * 100).toFixed(2)}%)`)
  console.log(`  거래 횟수: ${trades}회, 승률: ${trades > 0 ? (wins / trades * 100).toFixed(1) : 0}%`)
  console.log(`  Buy & Hold 수익률: ${buyHold.toFixed(2)}%`)
}

async function main() {
  await analyze('005930.KS', '삼성전자')
  await analyze('AAPL', '애플')
  await analyze('NVDA', 'NVIDIA')
}

main().catch(e => { console.error(e); process.exit(1) })
