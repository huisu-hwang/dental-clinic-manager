import { describe, it, expect, vi, beforeEach } from 'vitest'
import { verifyAndFetchPayment } from '../webhook'

beforeEach(() => {
  process.env.TOSS_SECRET_KEY = 'test_sk_xyz'
  vi.restoreAllMocks()
})

describe('verifyAndFetchPayment', () => {
  it('paymentKey로 토스에서 직접 조회 → secret 일치 시 Payment 반환', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ paymentKey: 'pk_x', secret: 'ps_secret_aaa', status: 'DONE' }), { status: 200 })
    )

    const payment = await verifyAndFetchPayment({
      paymentKey: 'pk_x',
      expectedSecret: 'ps_secret_aaa',
    })
    expect(payment.paymentKey).toBe('pk_x')
  })

  it('secret 불일치 시 Error throw', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ paymentKey: 'pk_x', secret: 'real', status: 'DONE' }), { status: 200 })
    )

    await expect(
      verifyAndFetchPayment({ paymentKey: 'pk_x', expectedSecret: 'fake' })
    ).rejects.toThrow('웹훅 secret 불일치')
  })

  it('expectedSecret 없을 때(첫 결제 전 검증 불가)는 통과', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ paymentKey: 'pk_x', secret: 'any', status: 'DONE' }), { status: 200 })
    )

    const payment = await verifyAndFetchPayment({ paymentKey: 'pk_x', expectedSecret: null })
    expect(payment.paymentKey).toBe('pk_x')
  })
})
