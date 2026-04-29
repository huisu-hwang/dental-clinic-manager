import { describe, it, expect, vi } from 'vitest'
import { runOhlcvIngestion, type IngestionDeps, type OhlcvRow } from '../src/ohlcvIngestionJob'

function makeDeps(rowsByTicker: Record<string, OhlcvRow[]>): IngestionDeps {
  return {
    fetchYahoo: vi.fn(async (t: string) => rowsByTicker[t] ?? []),
    upsert: vi.fn(async (rows: OhlcvRow[]) => ({ inserted: rows.length, error: null })),
  }
}

const sampleRow = (ticker: string): OhlcvRow => ({
  ticker, market: 'US', timeframe: '1d',
  datetime: '2026-04-28T20:00:00.000Z',
  open: 100, high: 101, low: 99, close: 100.5, volume: 1_000_000,
})

describe('runOhlcvIngestion', () => {
  it('upserts rows for each ticker', async () => {
    const deps = makeDeps({ AAPL: [sampleRow('AAPL')], MSFT: [sampleRow('MSFT')] })
    const r = await runOhlcvIngestion(['AAPL', 'MSFT'], 5, deps)
    expect(r.tickers).toBe(2)
    expect(r.inserted).toBe(2)
    expect(r.failed).toHaveLength(0)
  })

  it('continues when one ticker fetch fails', async () => {
    const deps: IngestionDeps = {
      fetchYahoo: vi.fn(async (t: string) => {
        if (t === 'BAD') throw new Error('yahoo 500')
        return [sampleRow(t)]
      }),
      upsert: vi.fn(async (rows: OhlcvRow[]) => ({ inserted: rows.length, error: null })),
    }
    const r = await runOhlcvIngestion(['AAPL', 'BAD', 'MSFT'], 5, deps)
    expect(r.tickers).toBe(3)
    expect(r.inserted).toBe(2)
    expect(r.failed).toEqual([{ ticker: 'BAD', error: 'yahoo 500' }])
  })

  it('skips empty fetch results', async () => {
    const deps = makeDeps({ AAPL: [] })
    const r = await runOhlcvIngestion(['AAPL'], 5, deps)
    expect(r.inserted).toBe(0)
    expect(r.failed).toHaveLength(0)
  })

  it('records upsert errors as failures', async () => {
    const deps: IngestionDeps = {
      fetchYahoo: vi.fn(async (t: string) => [sampleRow(t)]),
      upsert: vi.fn(async () => ({ inserted: 0, error: 'duplicate key' })),
    }
    const r = await runOhlcvIngestion(['AAPL'], 5, deps)
    expect(r.inserted).toBe(0)
    expect(r.failed).toEqual([{ ticker: 'AAPL', error: 'duplicate key' }])
  })
})
