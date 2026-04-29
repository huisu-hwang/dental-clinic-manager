/**
 * RL 전략 백테스트 위임 서비스
 *
 * rl-inference-server `/backtest_universe` endpoint에 위임.
 * Server side에서 yfinance로 OHLCV 페치 → portfolio simulation.
 * 메인 앱 IP가 Yahoo에서 차단되어도 server 환경(Python yfinance)은 별도 client로 정상 동작.
 */

import type { RLModel } from '@/types/rlTrading'

const RL_SERVER_URL = process.env.RL_SERVER_URL ?? 'http://127.0.0.1:8001'
const RL_API_KEY = process.env.RL_API_KEY ?? ''

interface RLBacktestResponse {
  total_return: number
  sharpe_ratio: number
  max_drawdown: number
  n_rebalances: number
  equity_curve: Array<{ date: string; equity: number }>
  metadata: Record<string, unknown>
}

export interface RLBacktestParams {
  model: RLModel
  startDate: string
  endDate: string
  initialCapital: number
}

export interface RLBacktestResult {
  total_return: number
  sharpe_ratio: number
  max_drawdown: number
  n_rebalances: number
  equity_curve: Array<{ date: string; equity: number }>
  rl_metadata: Record<string, unknown>
}

export async function runRLBacktest(params: RLBacktestParams): Promise<RLBacktestResult> {
  const { model, startDate, endDate, initialCapital } = params

  if (model.status !== 'ready' || !model.checkpoint_path) {
    throw new Error('rl_model is not ready (status=' + model.status + ')')
  }
  const universe = (model.universe ?? []) as string[]
  if (universe.length === 0) {
    throw new Error('rl_model has empty universe')
  }

  const body = {
    model_id: model.id,
    checkpoint_path: model.checkpoint_path,
    algorithm: model.algorithm,
    kind: model.kind,
    state_window: model.state_window,
    input_features: model.input_features,
    universe,
    start_date: startDate,
    end_date: endDate,
    initial_capital: initialCapital,
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 120_000)  // 2 min — yfinance fetch + simulation

  try {
    const resp = await fetch(`${RL_SERVER_URL}/backtest_universe`, {
      method: 'POST',
      headers: { 'X-RL-API-KEY': RL_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`rl-inference-server /backtest_universe ${resp.status}: ${text.slice(0, 300)}`)
    }
    const json = (await resp.json()) as RLBacktestResponse
    return {
      total_return: json.total_return,
      sharpe_ratio: json.sharpe_ratio,
      max_drawdown: json.max_drawdown,
      n_rebalances: json.n_rebalances,
      equity_curve: json.equity_curve,
      rl_metadata: json.metadata,
    }
  } finally {
    clearTimeout(timer)
  }
}
