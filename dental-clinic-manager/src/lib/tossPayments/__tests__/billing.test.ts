import { describe, it, expect, vi, beforeEach } from 'vitest'
import { issueBillingKey, confirmBilling } from '../billing'

beforeEach(() => {
  process.env.TOSS_SECRET_KEY = 'test_sk_xyz'
  vi.restoreAllMocks()
})

describe('issueBillingKey', () => {
  it('POST /v1/billing/authorizations/issue → Billing 응답 반환', async () => {
    const billing = {
      mId: 'tosspayments',
      customerKey: 'cust-123',
      authenticatedAt: '2026-05-08T01:00:00+09:00',
      method: 'CARD',
      billingKey: 'bk_abc',
      card: { issuerCode: '41', acquirerCode: '41', number: '1234********5678', cardType: '신용', ownerType: '개인' },
    }
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(billing), { status: 200 })
    )

    const result = await issueBillingKey({ authKey: 'auth_x', customerKey: 'cust-123' })

    expect(result).toEqual(billing)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.tosspayments.com/v1/billing/authorizations/issue')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      authKey: 'auth_x',
      customerKey: 'cust-123',
    })
  })
})

describe('confirmBilling', () => {
  it('POST /v1/billing/{billingKey} → Payment 응답', async () => {
    const payment = {
      paymentKey: 'pk_xyz',
      orderId: 'sub-abc-202605',
      orderName: '하얀치과 베이직 플랜',
      status: 'DONE',
      method: '카드',
      totalAmount: 50000,
      balanceAmount: 50000,
      approvedAt: '2026-05-08T01:00:01+09:00',
      requestedAt: '2026-05-08T01:00:00+09:00',
      secret: 'ps_secret_aaa',
    }
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(payment), { status: 200 })
    )

    const result = await confirmBilling({
      billingKey: 'bk_abc',
      customerKey: 'cust-123',
      orderId: 'sub-abc-202605',
      orderName: '하얀치과 베이직 플랜',
      amount: 50000,
      customerName: '홍길동',
      customerEmail: 'a@b.com',
    })

    expect(result.paymentKey).toBe('pk_xyz')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.tosspayments.com/v1/billing/bk_abc')
    expect((init as RequestInit).headers).toMatchObject({ 'Idempotency-Key': 'sub-abc-202605' })
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      customerKey: 'cust-123',
      orderId: 'sub-abc-202605',
      orderName: '하얀치과 베이직 플랜',
      amount: 50000,
      customerName: '홍길동',
      customerEmail: 'a@b.com',
    })
  })
})
