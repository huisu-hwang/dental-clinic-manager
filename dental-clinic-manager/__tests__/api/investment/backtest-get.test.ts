import { describe, it, expect, vi, beforeEach } from 'vitest'

// requireAuth + getSupabaseAdmin을 mock
vi.mock('@/lib/auth/requireAuth', () => ({
  requireAuth: vi.fn(async () => ({ user: { id: 'user-1' }, error: null, status: 200 })),
}))

const supabaseChain = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

const originalLimit = supabaseChain.limit
const originalIn = supabaseChain.in
const originalSingle = supabaseChain.single

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => supabaseChain),
}))

import { GET } from '@/app/api/investment/backtest/route'

function makeReq(qs: string): Request {
  return new Request(`http://localhost/api/investment/backtest?${qs}`)
}

describe('GET /api/investment/backtest filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabaseChain.limit = originalLimit
    supabaseChain.in = originalIn
    supabaseChain.single = originalSingle
    Object.values(supabaseChain).forEach((fn: any) => {
      if (fn && typeof fn === 'function' && 'mockReturnThis' in fn) {
        fn.mockReturnThis()
      }
    })
  })

  it('returns rows with strategy_id + ticker + since + limit', async () => {
    const rows = [
      { id: 'r1', strategy_id: 's1', ticker: 'AAPL', total_return: 0.18, executed_at: '2026-04-29T00:00:00Z' },
    ]
    // 종단 메서드는 await 시 Promise<{data, error}> 형태
    const last = vi.fn().mockResolvedValue({ data: rows, error: null })
    supabaseChain.limit = last as any

    const resp = await GET(makeReq('strategy_id=s1&ticker=AAPL&since=2026-04-01&limit=50') as any)
    expect(resp.status).toBe(200)
    const body = await resp.json()
    expect(body.data).toEqual(rows)
    expect(supabaseChain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(supabaseChain.eq).toHaveBeenCalledWith('strategy_id', 's1')
    expect(supabaseChain.eq).toHaveBeenCalledWith('ticker', 'AAPL')
    expect(supabaseChain.gte).toHaveBeenCalledWith('executed_at', '2026-04-01')
    expect(supabaseChain.limit).toHaveBeenCalledWith(50)
  })

  it('caps limit to 200', async () => {
    const last = vi.fn().mockResolvedValue({ data: [], error: null })
    supabaseChain.limit = last as any
    await GET(makeReq('limit=999') as any)
    expect(supabaseChain.limit).toHaveBeenCalledWith(200)
  })

  it('returns specific rows for ids=a,b,c', async () => {
    const last = vi.fn().mockResolvedValue({ data: [{ id: 'a' }, { id: 'b' }], error: null })
    supabaseChain.in = last as any
    const resp = await GET(makeReq('ids=a,b') as any)
    expect(resp.status).toBe(200)
    expect(supabaseChain.in).toHaveBeenCalledWith('id', ['a', 'b'])
  })

  it('rejects when ids contains non-uuid junk over 50 items', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `id${i}`).join(',')
    const resp = await GET(makeReq(`ids=${ids}`) as any)
    expect(resp.status).toBe(400)
  })

  it('returns single row for ?id=xxx (existing behavior preserved)', async () => {
    supabaseChain.single = vi.fn().mockResolvedValue({ data: { id: 'r1' }, error: null }) as any
    const resp = await GET(makeReq('id=r1') as any)
    expect(resp.status).toBe(200)
    const body = await resp.json()
    expect(body.data).toEqual({ id: 'r1' })
  })
})
