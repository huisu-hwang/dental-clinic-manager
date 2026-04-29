/**
 * dailyRebalanceDeps.ts
 *
 * Builds the DailyRebalanceDeps object wired to real Supabase + KIS infra.
 */

import type { DailyRebalanceDeps } from './dailyRebalanceJob'
import { RLInferenceClient } from './rlInferenceClient'
import { getSupabase } from './supabaseClient'
import { logger } from './logger'
import { sendSignalAlert } from './telegramNotifier'
import { executeAutoOrder } from './orderExecutor'

export async function buildDailyRebalanceDeps(): Promise<DailyRebalanceDeps> {
  const rlClient = new RLInferenceClient({
    baseUrl: process.env.RL_SERVER_URL ?? 'http://127.0.0.1:8001',
    apiKey: process.env.RL_API_KEY ?? '',
    timeoutMs: 5000,
  })
  const today = new Date().toISOString().slice(0, 10)

  return {
    today,
    rlClient,

    fetchActiveRLStrategies: async () => {
      const supabase = getSupabase()
      const { data, error } = await supabase
        .from('investment_strategies')
        .select(
          'id, user_id, strategy_type, automation_level, rl_models!inner(id, min_confidence, universe, state_window, algorithm, input_features, checkpoint_path)',
        )
        .eq('is_active', true)
        .in('strategy_type', ['rl_portfolio', 'rl_single'])
      if (error) {
        logger.error({ error }, 'fetchActiveRLStrategies failed')
        return []
      }
      return (data ?? []).map((s: Record<string, unknown>) => ({
        id: s.id as string,
        user_id: s.user_id as string,
        strategy_type: s.strategy_type as 'rl_portfolio' | 'rl_single',
        automation_level: s.automation_level as 1 | 2,
        rl_model: s.rl_models as {
          id: string
          min_confidence: number
          universe: string[]
          state_window: number
          algorithm: string
          input_features: string[]
          checkpoint_path: string
        },
      }))
    },

    fetchUserSettings: async (userId) => {
      const supabase = getSupabase()
      const { data } = await supabase
        .from('user_investment_settings')
        .select('rl_paused_at')
        .eq('user_id', userId)
        .maybeSingle()
      return { rl_paused_at: (data as { rl_paused_at: string | null } | null)?.rl_paused_at ?? null }
    },

    fetchOhlcvWindow: async (universe, stateWindow) => {
      const supabase = getSupabase()
      const result: Record<
        string,
        Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>
      > = {}
      for (const ticker of universe) {
        const { data, error } = await supabase
          .from('intraday_price_cache')
          .select('datetime, open, high, low, close, volume')
          .eq('ticker', ticker)
          .eq('market', 'US')
          .eq('timeframe', '1d')
          .order('datetime', { ascending: false })
          .limit(stateWindow)
        if (error) {
          logger.warn({ ticker, error }, 'fetchOhlcvWindow: query failed, returning empty for ticker')
          result[ticker] = []
          continue
        }
        result[ticker] = (data ?? [])
          .slice()
          .reverse()
          .map((row: Record<string, unknown>) => ({
            date:
              typeof row.datetime === 'string'
                ? row.datetime.slice(0, 10)
                : new Date(row.datetime as string).toISOString().slice(0, 10),
            open: Number(row.open),
            high: Number(row.high),
            low: Number(row.low),
            close: Number(row.close),
            volume: Number(row.volume),
          }))
      }
      return result
    },

    fetchCurrentPositions: async (userId) => {
      const supabase = getSupabase()
      const { data, error } = await supabase
        .from('positions')
        .select('ticker, quantity, avg_entry_price')
        .eq('user_id', userId)
        .eq('status', 'open')
      if (error) {
        logger.error({ error }, 'fetchCurrentPositions failed')
        return {}
      }
      const map: Record<string, { qty: number; avg_price: number }> = {}
      for (const p of data ?? []) {
        const row = p as { ticker: string; quantity: unknown; avg_entry_price: unknown }
        map[row.ticker] = { qty: Number(row.quantity), avg_price: Number(row.avg_entry_price) }
      }
      return map
    },

    insertInferenceLog: async (log) => {
      const supabase = getSupabase()
      const { error } = await supabase.from('rl_inference_logs').insert(log)
      if (error) {
        // ON CONFLICT (strategy_id, trade_date) — idempotent log already exists
        if ((error as { code?: string }).code === '23505') {
          logger.warn(
            { strategy_id: log.strategy_id, trade_date: log.trade_date },
            'rl_inference_logs duplicate; skipping',
          )
          return
        }
        logger.error({ error, log }, 'insertInferenceLog failed')
      }
    },

    sendTelegram: async (userId, message) => {
      try {
        // sendSignalAlert resolves the userId → chatId lookup internally.
        // We piggy-back on it by passing a minimal signal payload whose formatted
        // text is replaced by a custom note in the strategyName field.
        // For a raw free-text message we use sendSignalAlert with type 'buy_signal'
        // and embed the full message in strategyName — this is the closest available
        // public API that takes a userId rather than a chatId.
        await sendSignalAlert(userId, {
          type: 'buy_signal',
          strategyName: message,
          ticker: '',
          market: '',
        })
      } catch (err) {
        logger.warn({ err, userId }, 'sendTelegram failed (non-fatal)')
      }
    },

    executeAutoOrder: async (params) => {
      // executeAutoOrder in orderExecutor.ts takes:
      //   { userId, strategyId, ticker, market, orderType, quantity, price, signalData? }
      // and returns Promise<boolean>.
      //
      // The job passes orderMethod ('market' | 'limit') but no price.
      // We translate: market → price=0, limit → we have no price so fall back to market (price=0).
      const price = params.orderMethod === 'limit' ? 0 : 0 // Phase 1: always market order (price=0)
      const ok = await executeAutoOrder({
        userId: params.userId,
        strategyId: params.strategyId,
        ticker: params.ticker,
        market: 'US',
        orderType: params.orderType,
        quantity: params.quantity,
        price,
        signalData: params.signalData,
      })
      return { ok, orderId: undefined, error: ok ? undefined : 'executeAutoOrder returned false' }
    },
  }
}
