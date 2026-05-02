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

  if (!RL_API_KEY) {
    throw new Error(
      `RL_API_KEY 환경변수가 설정되지 않았습니다. .env.local 또는 배포 환경의 환경변수에 ` +
      `RL_SERVER_URL과 RL_API_KEY를 추가하고 서버를 재시작하세요. (서버: ${RL_SERVER_URL})`
    )
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 120_000)  // 2 min — yfinance fetch + simulation

  try {
    let resp: Response
    try {
      resp = await fetch(`${RL_SERVER_URL}/backtest_universe`, {
        method: 'POST',
        headers: { 'X-RL-API-KEY': RL_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
    } catch (fetchErr) {
      // Node native fetch는 ECONNREFUSED/DNS 실패 등에서 "fetch failed" (cause 포함) 던진다.
      // 사용자에게 원인을 명확히 전달하기 위해 cause 정보를 풀어 메시지로 노출한다.
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        throw new Error('RL 백테스트가 120초 안에 완료되지 않아 중단되었습니다. 기간을 줄이거나 종목 수를 줄여 다시 시도하세요.')
      }
      const cause = (fetchErr as { cause?: { code?: string; message?: string } } | undefined)?.cause
      const reason = cause?.code ?? cause?.message ?? (fetchErr instanceof Error ? fetchErr.message : String(fetchErr))
      throw new Error(
        `RL 추론 서버에 연결할 수 없습니다 (${RL_SERVER_URL}, ${reason}). ` +
        `로컬에서는 rl-inference-server가 실행 중인지(\`uvicorn src.main:app --port 8001\`), ` +
        `배포 환경에서는 RL_SERVER_URL이 외부에서 접근 가능한 주소인지 확인하세요.`
      )
    }
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
