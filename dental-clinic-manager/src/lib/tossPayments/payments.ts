import { tossFetch } from './client'
import type { TossPayment } from './types'

export async function getPayment(paymentKey: string): Promise<TossPayment> {
  return tossFetch<TossPayment>(`/v1/payments/${encodeURIComponent(paymentKey)}`, {
    method: undefined,
  })
}

export async function cancelPayment(params: {
  paymentKey: string
  cancelReason: string
  cancelAmount?: number
  idempotencyKey?: string
}): Promise<TossPayment> {
  const { paymentKey, idempotencyKey, ...body } = params
  return tossFetch<TossPayment>(`/v1/payments/${encodeURIComponent(paymentKey)}/cancel`, {
    method: 'POST',
    idempotencyKey,
    body: JSON.stringify(body),
  })
}
