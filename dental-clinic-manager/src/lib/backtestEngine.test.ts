import { describe, expect, it } from 'vitest'

import { runBacktest } from '@/lib/backtestEngine'
import type { ConditionGroup, OHLCV, RiskSettings } from '@/types/investment'

const alwaysTrue: ConditionGroup = {
  type: 'group',
  operator: 'AND',
  conditions: [
    {
      type: 'leaf',
      left: { type: 'constant', value: 1 },
      operator: '>',
      right: { type: 'constant', value: 0 },
    },
  ],
}

const alwaysFalse: ConditionGroup = {
  type: 'group',
  operator: 'AND',
  conditions: [
    {
      type: 'leaf',
      left: { type: 'constant', value: 0 },
      operator: '>',
      right: { type: 'constant', value: 1 },
    },
  ],
}

const riskSettings: RiskSettings = {
  maxDailyLossPercent: 2,
  maxPositions: 1,
  maxPositionSizePercent: 100,
  stopLossPercent: 0,
  takeProfitPercent: 0,
  maxHoldingDays: 0,
}

describe('runBacktest metrics', () => {
  it('reflects forced-close exit costs in final equity and total return', () => {
    const prices: OHLCV[] = [
      { date: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000 },
      { date: '2026-01-03', open: 100, high: 110, low: 100, close: 110, volume: 1000 },
    ]

    const result = runBacktest({
      prices,
      indicators: [],
      buyConditions: alwaysTrue,
      sellConditions: alwaysFalse,
      riskSettings,
      initialCapital: 1_000_000,
      market: 'KR',
      ticker: '000660',
      useFullCapital: true,
    })

    const quantity = 9_998
    const buyFee = 149.97
    const sellFee = 2_694.461
    const expectedFinalEquity = 1_097_135.569
    const expectedReturnPct = ((expectedFinalEquity - 1_000_000) / 1_000_000) * 100

    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].quantity).toBe(quantity)
    expect(result.equityCurve.at(-1)?.value).toBe(Math.round(expectedFinalEquity))
    expect(result.metrics.totalReturn).toBeCloseTo(expectedReturnPct, 4)
    expect(result.buyHold.equityCurve.at(-1)?.value).toBe(Math.round(expectedFinalEquity))
    expect(result.buyHold.totalReturn).toBeCloseTo(expectedReturnPct, 4)
    expect(result.trades[0].pnl).toBeCloseTo((110 - 100) * quantity - buyFee - sellFee, 6)
  })

  it('preserves infinite profit factor for all-winning trades', () => {
    const prices: OHLCV[] = [
      { date: '2026-01-02', open: 100, high: 100, low: 100, close: 100, volume: 1000 },
      { date: '2026-01-03', open: 100, high: 102, low: 100, close: 101, volume: 1000 },
      { date: '2026-01-04', open: 103, high: 103, low: 103, close: 103, volume: 1000 },
    ]

    const result = runBacktest({
      prices,
      indicators: [],
      buyConditions: alwaysTrue,
      sellConditions: alwaysTrue,
      riskSettings,
      initialCapital: 1_000_000,
      market: 'US',
      ticker: '000660',
      useFullCapital: true,
    })

    expect(result.trades).toHaveLength(1)
    expect(result.metrics.winRate).toBe(100)
    expect(result.metrics.profitFactor).toBe(Number.POSITIVE_INFINITY)
  })
})
