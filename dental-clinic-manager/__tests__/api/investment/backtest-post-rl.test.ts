import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const strategySingle = vi.fn()
  const modelSingle = vi.fn()
  const insertSingle = vi.fn()
  const insert = vi.fn()

  const strategyQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: strategySingle,
  }

  const modelQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: modelSingle,
  }

  const insertSelectQuery = {
    select: vi.fn().mockReturnThis(),
    single: insertSingle,
  }

  const insertQuery = {
    insert,
  }

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'investment_strategies') return strategyQuery
      if (table === 'rl_models') return modelQuery
      if (table === 'backtest_runs') return insertQuery
      throw new Error(`unexpected table: ${table}`)
    }),
  }

  return {
    strategySingle,
    modelSingle,
    insertSingle,
    insert,
    strategyQuery,
    modelQuery,
    insertQuery,
    insertSelectQuery,
    supabase,
    runRLBacktest: vi.fn(),
  }
})

vi.mock('@/lib/auth/requireAuth', () => ({
  requireAuth: vi.fn(async () => ({ user: { id: 'user-1' }, error: null, status: 200 })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => mocks.supabase),
}))

vi.mock('@/lib/rlBacktestService', () => ({
  runRLBacktest: mocks.runRLBacktest,
}))

vi.mock('@/lib/stockDataService', () => ({
  fetchPrices: vi.fn(),
}))

import { POST } from '@/app/api/investment/backtest/route'

describe('POST /api/investment/backtest RL normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.strategyQuery.select.mockReturnThis()
    mocks.strategyQuery.eq.mockReturnThis()
    mocks.modelQuery.select.mockReturnThis()
    mocks.modelQuery.eq.mockReturnThis()
    mocks.insert.mockReturnValue(mocks.insertSelectQuery)
    mocks.insertSelectQuery.select.mockReturnThis()

    mocks.strategySingle.mockResolvedValue({
      data: {
        id: 'strategy-1',
        user_id: 'user-1',
        strategy_type: 'rl_portfolio',
        rl_model_id: 'model-1',
      },
    })
    mocks.modelSingle.mockResolvedValue({
      data: {
        id: 'model-1',
        status: 'ready',
        checkpoint_path: '/tmp/model.pt',
        kind: 'portfolio',
        algorithm: 'ppo',
        state_window: 20,
        input_features: ['close'],
        universe: ['000660'],
      },
    })
    mocks.insertSingle.mockResolvedValue({ data: { id: 'run-1' }, error: null })
    mocks.runRLBacktest.mockResolvedValue({
      total_return: 0.25,
      sharpe_ratio: 1.8,
      max_drawdown: 0.12,
      n_rebalances: 4,
      equity_curve: [
        { date: '2026-01-02', equity: 1_000_000 },
        { date: '2026-01-03', equity: 1_250_000 },
      ],
      buy_hold_return: 0.1,
      buy_hold_curve: [
        { date: '2026-01-02', equity: 1_000_000 },
        { date: '2026-01-03', equity: 1_100_000 },
      ],
      win_rate: 0.5,
      trades: [
        {
          entry_date: '2026-01-02',
          exit_date: '2026-01-03',
          ticker: '000660',
          direction: 'buy',
          entry_price: 100,
          exit_price: 110,
          quantity: 10,
          pnl: 100,
          pnl_percent: 10,
          holding_days: 1,
        },
        {
          entry_date: '2026-01-03',
          exit_date: '2026-01-04',
          ticker: '000660',
          direction: 'buy',
          entry_price: 110,
          exit_price: 108,
          quantity: 10,
          pnl: -20,
          pnl_percent: -1.8182,
          holding_days: 1,
        },
      ],
      rl_metadata: { note: 'ok' },
    })
  })

  it('maps RL metrics and equity curves to the same shape as rule-based backtests', async () => {
    const req = new Request('http://localhost/api/investment/backtest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        strategyId: 'strategy-1',
        ticker: '000660',
        market: 'KR',
        startDate: '2026-01-02',
        endDate: '2026-12-31',
        initialCapital: 1_000_000,
      }),
    })

    const resp = await POST(req as any)
    expect(resp.status).toBe(200)

    const body = await resp.json()
    expect(body.data.metrics).toMatchObject({
      totalReturn: 25,
      maxDrawdown: 12,
      sharpeRatio: 1.8,
      winRate: 50,
      totalTrades: 2,
    })
    expect(body.data.equityCurve).toEqual([
      { date: '2026-01-02', value: 1_000_000 },
      { date: '2026-01-03', value: 1_250_000 },
    ])
    expect(body.data.buyHold).toEqual({
      totalReturn: 10,
      equityCurve: [
        { date: '2026-01-02', value: 1_000_000 },
        { date: '2026-01-03', value: 1_100_000 },
      ],
    })

    const insertedRow = mocks.insert.mock.calls[0]?.[0]
    expect(insertedRow.win_rate).toBe(50)
    expect(insertedRow.total_trades).toBe(2)
    expect(insertedRow.profit_factor).toBe(5)
    expect(insertedRow.equity_curve).toEqual(body.data.equityCurve)
  })
})
