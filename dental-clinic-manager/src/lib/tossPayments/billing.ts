import { tossFetch } from './client'
import type { TossBilling, TossPayment } from './types'

export async function issueBillingKey(params: {
  authKey: string
  customerKey: string
}): Promise<TossBilling> {
  return tossFetch<TossBilling>('/v1/billing/authorizations/issue', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function confirmBilling(params: {
  billingKey: string
  customerKey: string
  orderId: string
  orderName: string
  amount: number
  customerName: string
  customerEmail: string
  taxFreeAmount?: number
}): Promise<TossPayment> {
  const { billingKey, ...body } = params
  return tossFetch<TossPayment>(`/v1/billing/${billingKey}`, {
    method: 'POST',
    idempotencyKey: params.orderId,
    body: JSON.stringify(body),
  })
}
