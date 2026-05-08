import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getOrCreateCustomerKey } from '../billingService'

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
