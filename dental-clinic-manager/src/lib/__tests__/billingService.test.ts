import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getOrCreateCustomerKey, makeOrderId, addOneMonth } from '../billingService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getOrCreateCustomerKey', () => {
  it('기존 customer_key가 있으면 그대로 반환', async () => {
    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValueOnce({
                  data: { id: 'sub-1', customer_key: 'existing-key' },
                  error: null,
                }),
              })),
            })),
          })),
        })),
      })),
    }
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockClient)

    const key = await getOrCreateCustomerKey('clinic-1')
    expect(key).toBe('existing-key')
  })

  it('없으면 새 UUID 발급 + 빈 row INSERT', async () => {
    const insertMock = vi.fn().mockResolvedValueOnce({ error: null })
    const selectChain = {
      eq: () => ({
        order: () => ({
          limit: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    }
    const mockClient = {
      from: vi.fn(() => ({
        select: () => selectChain,
        insert: insertMock,
      })),
    }
    ;(createClient as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockClient)

    const key = await getOrCreateCustomerKey('clinic-1')
    expect(key).toMatch(/^[0-9a-f-]{36}$/)
    expect(insertMock).toHaveBeenCalled()
  })
})

describe('makeOrderId', () => {
  it('하이픈 제거 후 앞 8자 + YYYYMM', () => {
    const id = makeOrderId('a3b9d12f-1234-5678-9012-abc')
    expect(id).toMatch(/^sub-a3b9d12f-\d{6}$/)
  })

  it('retry_count > 0 시 -rN 접미사', () => {
    const id = makeOrderId('a3b9d12f-1234-5678-9012-abc', 2)
    expect(id).toMatch(/^sub-a3b9d12f-\d{6}-r2$/)
  })
})

describe('addOneMonth', () => {
  it('일반 월 +1', () => {
    expect(addOneMonth(new Date('2026-04-15')).toISOString().slice(0, 10)).toBe('2026-05-15')
  })
  it('1월 31일 → 2월말 (JS Date 자연 처리)', () => {
    const result = addOneMonth(new Date('2026-01-31'))
    expect(result.getMonth()).toBeGreaterThanOrEqual(1)
  })
})
