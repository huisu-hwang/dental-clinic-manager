import type { RLInferenceClient, PortfolioPredictResponse } from './rlInferenceClient'

export interface RLStrategyRow {
  id: string
  user_id: string
  strategy_type: 'rl_portfolio' | 'rl_single'
  automation_level: 1 | 2
  rl_model: {
    id: string
    min_confidence: number
    universe: string[]
    state_window: number
    algorithm: string
    input_features: string[]
    checkpoint_path: string
  }
}

export interface DailyRebalanceDeps {
  fetchActiveRLStrategies: () => Promise<RLStrategyRow[]>
  fetchUserSettings: (userId: string) => Promise<{ rl_paused_at: string | null }>
  fetchOhlcvWindow: (
    universe: string[], stateWindow: number,
  ) => Promise<Record<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>>>
  fetchCurrentPositions: (userId: string) => Promise<Record<string, { qty: number; avg_price: number }>>
  rlClient: Pick<RLInferenceClient, 'predict' | 'health'>
  insertInferenceLog: (log: InferenceLogEntry) => Promise<void>
  sendTelegram: (userId: string, message: string) => Promise<void>
  executeAutoOrder: (params: {
    userId: string; strategyId: string; ticker: string; orderType: 'buy' | 'sell';
    quantity: number; orderMethod: 'market' | 'limit'; signalData: Record<string, unknown>
  }) => Promise<{ ok: boolean; orderId?: string; error?: string }>
  today: string
}

export interface InferenceLogEntry {
  strategy_id: string
  rl_model_id: string
  user_id: string
  trade_date: string
  state_hash: string
  output: Record<string, unknown>
  confidence: number | null
  decision: 'order' | 'hold' | 'blocked_low_confidence' | 'blocked_kill_switch' | 'error'
  blocked_reason?: string | null
  error_message?: string | null
  latency_ms?: number | null
}

interface RebalanceResult { processed: number; ordered: number; blocked: number; errored: number }

export async function runDailyRebalance(deps: DailyRebalanceDeps): Promise<RebalanceResult> {
  const result: RebalanceResult = { processed: 0, ordered: 0, blocked: 0, errored: 0 }
  const strategies = await deps.fetchActiveRLStrategies()

  for (const s of strategies) {
    result.processed++
    try {
      const settings = await deps.fetchUserSettings(s.user_id)
      if (settings.rl_paused_at) {
        await deps.insertInferenceLog({
          strategy_id: s.id, rl_model_id: s.rl_model.id, user_id: s.user_id,
          trade_date: deps.today, state_hash: '',
          output: {}, confidence: null, decision: 'blocked_kill_switch',
          blocked_reason: `paused at ${settings.rl_paused_at}`,
        })
        result.blocked++
        continue
      }

      const ohlcv = await deps.fetchOhlcvWindow(s.rl_model.universe, s.rl_model.state_window)
      const positions = await deps.fetchCurrentPositions(s.user_id)
      const t0 = Date.now()
      const prediction = await deps.rlClient.predict({
        model_id: s.rl_model.id,
        checkpoint_path: s.rl_model.checkpoint_path,
        algorithm: s.rl_model.algorithm,
        kind: 'portfolio',
        state_window: s.rl_model.state_window,
        input_features: s.rl_model.input_features,
        ohlcv,
        current_positions: positions,
      }) as PortfolioPredictResponse
      const latencyMs = Date.now() - t0

      if (prediction.confidence < s.rl_model.min_confidence) {
        await deps.insertInferenceLog({
          strategy_id: s.id, rl_model_id: s.rl_model.id, user_id: s.user_id,
          trade_date: deps.today, state_hash: '',
          output: prediction as unknown as Record<string, unknown>,
          confidence: prediction.confidence, decision: 'blocked_low_confidence',
          blocked_reason: `confidence ${prediction.confidence} < ${s.rl_model.min_confidence}`,
          latency_ms: latencyMs,
        })
        await deps.sendTelegram(s.user_id, `[RL] ${s.id} 신뢰도 ${prediction.confidence.toFixed(2)} 낮아 hold`)
        result.blocked++
        continue
      }

      const orders = computeOrdersFromWeights(prediction.weights, positions, 10000)

      if (s.automation_level === 1) {
        await deps.sendTelegram(s.user_id, `[RL] ${s.id} 신호: ${JSON.stringify(orders.slice(0, 5))}`)
      } else {
        for (const o of orders) {
          await deps.executeAutoOrder({
            userId: s.user_id, strategyId: s.id,
            ticker: o.ticker, orderType: o.side, quantity: o.qty,
            orderMethod: 'market',
            signalData: { source: 'rl', model_id: s.rl_model.id, weights: prediction.weights },
          })
        }
        result.ordered++
      }

      await deps.insertInferenceLog({
        strategy_id: s.id, rl_model_id: s.rl_model.id, user_id: s.user_id,
        trade_date: deps.today, state_hash: '',
        output: prediction as unknown as Record<string, unknown>,
        confidence: prediction.confidence, decision: 'order', latency_ms: latencyMs,
      })
    } catch (err) {
      const message = (err as Error).message
      await deps.insertInferenceLog({
        strategy_id: s.id, rl_model_id: s.rl_model.id, user_id: s.user_id,
        trade_date: deps.today, state_hash: '',
        output: {}, confidence: null, decision: 'error',
        error_message: message,
      })
      try { await deps.sendTelegram(s.user_id, `[RL] ${s.id} 오류: ${message}`) } catch {}
      result.errored++
    }
  }
  return result
}

interface PlannedOrder { ticker: string; side: 'buy' | 'sell'; qty: number }

function computeOrdersFromWeights(
  weights: Record<string, number>,
  current: Record<string, { qty: number; avg_price: number }>,
  totalCapitalFallback: number,
): PlannedOrder[] {
  const orders: PlannedOrder[] = []
  const totalQty = Object.values(current).reduce((s, p) => s + p.qty * p.avg_price, 0)
  const total = totalQty > 0 ? totalQty : totalCapitalFallback
  for (const [ticker, w] of Object.entries(weights)) {
    const targetValue = total * w
    const currentQty = current[ticker]?.qty ?? 0
    const currentValue = currentQty * (current[ticker]?.avg_price ?? 0)
    const diff = targetValue - currentValue
    if (Math.abs(diff) < total * 0.01) continue
    if (diff > 0) {
      orders.push({ ticker, side: 'buy', qty: Math.max(1, Math.floor(diff / Math.max(current[ticker]?.avg_price ?? 1, 1))) })
    } else {
      const qty = Math.min(currentQty, Math.floor(Math.abs(diff) / Math.max(current[ticker]?.avg_price ?? 1, 1)))
      if (qty > 0) orders.push({ ticker, side: 'sell', qty })
    }
  }
  return orders
}
