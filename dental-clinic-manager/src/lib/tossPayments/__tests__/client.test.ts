import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { tossFetch, TossPaymentsError } from '../client'

describe('tossFetch', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, TOSS_SECRET_KEY: 'test_sk_xyz' }
    vi.restoreAllMocks()
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('Basic Auth 헤더에 secretKey + ":" base64 인코딩 부착', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    )

    await tossFetch('/v1/billing/abc', { method: 'POST', body: JSON.stringify({}) })

    const expected = 'Basic ' + Buffer.from('test_sk_xyz:').toString('base64')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.tosspayments.com/v1/billing/abc',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: expected }),
      })
    )
  })

  it('idempotencyKey 옵션 → Idempotency-Key 헤더', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    )

    await tossFetch('/v1/payments/abc', {
      method: 'POST',
      idempotencyKey: 'order-123',
      body: JSON.stringify({}),
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'order-123' }),
      })
    )
  })

  it('4xx 응답 → TossPaymentsError(code, message) throw', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 'INVALID_CARD', message: '잘못된 카드입니다' }),
        { status: 400 }
      )
    )

    await expect(tossFetch('/v1/billing/x', { method: 'POST' })).rejects.toMatchObject({
      name: 'TossPaymentsError',
      code: 'INVALID_CARD',
      message: '잘못된 카드입니다',
      httpStatus: 400,
    })
  })

  it('5xx 응답 → TossPaymentsError(httpStatus=500)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Internal', { status: 500 })
    )
    await expect(tossFetch('/v1/payments/x', { method: 'POST' })).rejects.toMatchObject({
      httpStatus: 500,
    })
  })

  it('TOSS_SECRET_KEY 미설정 시 throw', async () => {
    delete process.env.TOSS_SECRET_KEY
    await expect(tossFetch('/v1/x')).rejects.toThrow('TOSS_SECRET_KEY')
  })
})
