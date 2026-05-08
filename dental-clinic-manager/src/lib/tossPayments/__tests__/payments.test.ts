import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getPayment, cancelPayment } from '../payments'

beforeEach(() => {
  process.env.TOSS_SECRET_KEY = 'test_sk_xyz'
  vi.restoreAllMocks()
})

describe('getPayment', () => {
  it('GET /v1/payments/{paymentKey} 호출', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ paymentKey: 'pk_x', status: 'DONE' }), { status: 200 })
    )
    const result = await getPayment('pk_x')
    expect(result.paymentKey).toBe('pk_x')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.tosspayments.com/v1/payments/pk_x',
      expect.objectContaining({ method: undefined })
    )
  })
})

describe('cancelPayment', () => {
  it('POST /v1/payments/{paymentKey}/cancel 호출 (전체 취소)', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ paymentKey: 'pk_x', status: 'CANCELED' }), { status: 200 })
    )
    await cancelPayment({ paymentKey: 'pk_x', cancelReason: '사용자 요청' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.tosspayments.com/v1/payments/pk_x/cancel')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      cancelReason: '사용자 요청',
    })
  })

  it('부분 취소 시 cancelAmount 포함', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ paymentKey: 'pk_x', status: 'PARTIAL_CANCELED' }), { status: 200 })
    )
    await cancelPayment({ paymentKey: 'pk_x', cancelReason: '일할 환불', cancelAmount: 10000 })

    const init = fetchMock.mock.calls[0][1]
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      cancelReason: '일할 환불',
      cancelAmount: 10000,
    })
  })
})
