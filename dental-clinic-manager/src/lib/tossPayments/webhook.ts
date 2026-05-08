import { getPayment } from './payments'
import type { TossPayment } from './types'

/**
 * 웹훅 페이로드는 신뢰하지 않는다.
 * paymentKey로 토스 API에 다시 조회 → secret 검증으로 출처 확인.
 */
export async function verifyAndFetchPayment(params: {
  paymentKey: string
  expectedSecret: string | null  // DB에 저장된 secret. 없으면(null) 검증 생략
}): Promise<TossPayment> {
  const payment = await getPayment(params.paymentKey)

  if (params.expectedSecret !== null && payment.secret !== params.expectedSecret) {
    throw new Error('웹훅 secret 불일치')
  }
  return payment
}
