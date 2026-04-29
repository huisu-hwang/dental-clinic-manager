import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runDailyRebalance, DailyRebalanceDeps } from '../src/dailyRebalanceJob'

function makeDeps(overrides: Partial<DailyRebalanceDeps> = {}): DailyRebalanceDeps {
  return {
    fetchActiveRLStrategies: vi.fn().mockResolvedValue([]),
    fetchUserSettings: vi.fn().mockResolvedValue({ rl_paused_at: null }),
    fetchOhlcvWindow: vi.fn().mockResolvedValue({}),
    fetchCurrentPositions: vi.fn().mockResolvedValue({}),
    rlClient: { predict: vi.fn(), health: vi.fn() } as any,
    insertInferenceLog: vi.fn().mockResolvedValue(undefined),
    sendTelegram: vi.fn().mockResolvedValue(undefined),
    executeAutoOrder: vi.fn().mockResolvedValue({ ok: true, orderId: 'o1' }),
    today: '2026-04-29',
    ...overrides,
  }
}

const baseStrategy = {
  id: 's1', user_id: 'u1', strategy_type: 'rl_portfolio', automation_level: 1,
  rl_model: { id: 'm1', min_confidence: 0.5, universe: ['AAPL'], state_window: 5, algorithm: 'PPO', input_features: ['close'], checkpoint_path: '/p' },
}

describe('runDailyRebalance', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skips when no active RL strategies', async () => {
    const deps = makeDeps()
    const result = await runDailyRebalance(deps)
    expect(result.processed).toBe(0)
  })

  it('blocks when kill switch is active', async () => {
    const deps = makeDeps({
      fetchActiveRLStrategies: vi.fn().mockResolvedValue([baseStrategy]),
      fetchUserSettings: vi.fn().mockResolvedValue({ rl_paused_at: '2026-04-29T00:00:00Z' }),
    })
    await runDailyRebalance(deps)
    expect(deps.insertInferenceLog).toHaveBeenCalledWith(expect.objectContaining({ decision: 'blocked_kill_switch' }))
    expect(deps.executeAutoOrder).not.toHaveBeenCalled()
  })

  it('blocks when confidence below min_confidence', async () => {
    const deps = makeDeps({
      fetchActiveRLStrategies: vi.fn().mockResolvedValue([{ ...baseStrategy, automation_level: 2, rl_model: { ...baseStrategy.rl_model, min_confidence: 0.9 } }]),
      rlClient: { predict: vi.fn().mockResolvedValue({ kind: 'portfolio', weights: { AAPL: 1 }, confidence: 0.5, raw_action: [], metadata: {} }), health: vi.fn() } as any,
    })
    await runDailyRebalance(deps)
    expect(deps.insertInferenceLog).toHaveBeenCalledWith(expect.objectContaining({ decision: 'blocked_low_confidence' }))
    expect(deps.executeAutoOrder).not.toHaveBeenCalled()
  })

  it('automation_level=1 sends Telegram only, no auto order', async () => {
    const deps = makeDeps({
      fetchActiveRLStrategies: vi.fn().mockResolvedValue([baseStrategy]),
      rlClient: { predict: vi.fn().mockResolvedValue({ kind: 'portfolio', weights: { AAPL: 1 }, confidence: 0.8, raw_action: [], metadata: {} }), health: vi.fn() } as any,
    })
    await runDailyRebalance(deps)
    expect(deps.sendTelegram).toHaveBeenCalled()
    expect(deps.executeAutoOrder).not.toHaveBeenCalled()
  })

  it('automation_level=2 invokes executeAutoOrder', async () => {
    const deps = makeDeps({
      fetchActiveRLStrategies: vi.fn().mockResolvedValue([{ ...baseStrategy, automation_level: 2 }]),
      rlClient: { predict: vi.fn().mockResolvedValue({ kind: 'portfolio', weights: { AAPL: 1 }, confidence: 0.8, raw_action: [], metadata: {} }), health: vi.fn() } as any,
    })
    await runDailyRebalance(deps)
    expect(deps.executeAutoOrder).toHaveBeenCalled()
  })

  it('logs error and continues on prediction failure', async () => {
    const deps = makeDeps({
      fetchActiveRLStrategies: vi.fn().mockResolvedValue([{ ...baseStrategy, automation_level: 2 }]),
      rlClient: { predict: vi.fn().mockRejectedValue(new Error('timeout')), health: vi.fn() } as any,
    })
    await runDailyRebalance(deps)
    expect(deps.insertInferenceLog).toHaveBeenCalledWith(expect.objectContaining({ decision: 'error' }))
  })
})
