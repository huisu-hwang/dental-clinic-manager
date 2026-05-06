/**
 * RL 전략 백테스트 위임 서비스
 *
 * rl-inference-server `/backtest_universe` endpoint에 위임.
 * Server side에서 yfinance로 OHLCV 페치 → portfolio simulation.
 * 메인 앱 IP가 Yahoo에서 차단되어도 server 환경(Python yfinance)은 별도 client로 정상 동작.
 */

import type { RLModel } from '@/types/rlTrading'

// 함수 호출 시점에 환경변수를 읽어야 .env.local 변경 후 재시작 없이도 즉시 반영된다.
// (모듈 로드 시점에 캡처하면 dev hot reload가 모듈을 새로 평가하지 않을 때 stale 값 사용)
function getServerConfig() {
  return {
    url: process.env.RL_SERVER_URL ?? 'http://127.0.0.1:8001',
    apiKey: process.env.RL_API_KEY ?? '',
  }
}

/**
 * rl-inference-server의 raw 에러 응답을 사용자 친화적 한국어 메시지로 변환한다.
 * - 빈번한 케이스(미래 기간/짧은 기간/yfinance 실패)를 명시적으로 잡고,
 *   알 수 없는 케이스는 원본 detail을 함께 노출해서 디버깅 가능하게 둔다.
 */
function translateRLServerError(
  status: number,
  rawBody: string,
  ctx: { startDate: string; endDate: string },
): string {
  let detail = rawBody
  try {
    const parsed = JSON.parse(rawBody) as { detail?: unknown }
    if (typeof parsed.detail === 'string') detail = parsed.detail
    else if (parsed.detail) detail = JSON.stringify(parsed.detail)
  } catch {
    // raw text는 그대로 사용
  }

  // 가장 자주 발생: 미래 기간 → yfinance 응답 0행 → dropna 후 0행
  if (/insufficient OHLCV.*rows=0/i.test(detail)) {
    return (
      `선택한 기간(${ctx.startDate} ~ ${ctx.endDate})에 시장 데이터가 없습니다. ` +
      `미래 날짜는 백테스트할 수 없습니다. 종료일을 오늘 이전으로 설정하고 ` +
      `최소 7거래일 이상의 기간을 선택하세요.`
    )
  }
  // 휴장일/주말만 포함된 짧은 기간
  if (/no rebalance dates/i.test(detail)) {
    return (
      `선택한 기간(${ctx.startDate} ~ ${ctx.endDate})에 거래일이 부족합니다. ` +
      `최소 1주(7일) 이상, 가급적 주중을 포함하는 기간을 선택하세요.`
    )
  }
  // 데이터는 있는데 너무 적음
  if (/insufficient OHLCV/i.test(detail)) {
    return (
      `백테스트에 필요한 시장 데이터가 부족합니다 (${ctx.startDate} ~ ${ctx.endDate}). ` +
      `기간을 늘려 다시 시도하세요. (원본: ${detail.slice(0, 120)})`
    )
  }
  // yfinance 자체 실패 (rate limit/네트워크 차단)
  if (/yfinance|yahoo|HTTP Error|Connection|Timeout/i.test(detail)) {
    return (
      `Yahoo Finance에서 가격 데이터를 가져올 수 없습니다. ` +
      `잠시 후 다시 시도하거나 다른 기간/종목으로 시도하세요. (원본: ${detail.slice(0, 150)})`
    )
  }

  // 알 수 없는 케이스: 상세 내용 일부 노출
  return `RL 백테스트 서버 오류 (${status}): ${detail.slice(0, 250)}`
}

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

  const { url: rlUrl, apiKey: rlApiKey } = getServerConfig()

  if (!rlApiKey) {
    throw new Error(
      `RL_API_KEY 환경변수가 설정되지 않았습니다. .env.local 또는 배포 환경의 환경변수에 ` +
      `RL_SERVER_URL과 RL_API_KEY를 추가하고 서버를 재시작하세요. (서버: ${rlUrl})`
    )
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 120_000)  // 2 min — yfinance fetch + simulation

  try {
    let resp: Response
    try {
      resp = await fetch(`${rlUrl}/backtest_universe`, {
        method: 'POST',
        headers: { 'X-RL-API-KEY': rlApiKey, 'content-type': 'application/json' },
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
        `RL 추론 서버에 연결할 수 없습니다 (${rlUrl}, ${reason}). ` +
        `로컬에서는 rl-inference-server가 실행 중인지(\`uvicorn src.main:app --port 8001\`), ` +
        `배포 환경에서는 RL_SERVER_URL이 외부에서 접근 가능한 주소인지 확인하세요.`
      )
    }
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(translateRLServerError(resp.status, text, { startDate, endDate }))
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
