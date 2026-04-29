import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RLInferenceClient } from '../src/rlInferenceClient'

describe('RLInferenceClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('predict() POSTs with X-RL-API-KEY and parses portfolio response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          kind: 'portfolio',
          weights: { AAPL: 0.5, MSFT: 0.5 },
          confidence: 0.8,
          raw_action: [0.5, 0.5],
          metadata: {},
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    global.fetch = fetchMock as unknown as typeof fetch
    const client = new RLInferenceClient({ baseUrl: 'http://127.0.0.1:8001', apiKey: 'k', timeoutMs: 1000 })
    const res = await client.predict({
      model_id: 'm',
      checkpoint_path: '/p',
      algorithm: 'PPO',
      kind: 'portfolio',
      state_window: 5,
      input_features: ['close'],
      ohlcv: {},
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).headers).toMatchObject({ 'X-RL-API-KEY': 'k' })
    expect(res.kind).toBe('portfolio')
    expect((res as { confidence: number }).confidence).toBe(0.8)
  })

  it('throws timeout error after timeoutMs', async () => {
    global.fetch = vi.fn().mockImplementation(
      () => new Promise(() => {}),
    ) as unknown as typeof fetch
    const client = new RLInferenceClient({ baseUrl: 'http://x', apiKey: 'k', timeoutMs: 50 })
    await expect(
      client.predict({
        model_id: 'm', checkpoint_path: '/p', algorithm: 'PPO', kind: 'portfolio',
        state_window: 5, input_features: ['close'], ohlcv: {},
      }),
    ).rejects.toThrow(/timeout/i)
  })

  it('throws on non-2xx response', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('bad', { status: 500 })) as unknown as typeof fetch
    const client = new RLInferenceClient({ baseUrl: 'http://x', apiKey: 'k', timeoutMs: 1000 })
    await expect(
      client.predict({
        model_id: 'm', checkpoint_path: '/p', algorithm: 'PPO', kind: 'portfolio',
        state_window: 5, input_features: ['close'], ohlcv: {},
      }),
    ).rejects.toThrow(/500/)
  })
})
