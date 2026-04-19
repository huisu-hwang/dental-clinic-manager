// ============================================
// 포트원 v2 서버 사이드 헬퍼
// 토스페이먼츠를 하위 PG로 사용
// ============================================

import type { ChargeParams, ScheduleParams, PortOnePaymentResult } from '@/types/subscription'

const PORTONE_API_BASE = 'https://api.portone.io'

function getApiSecret(): string {
  const secret = process.env.PORTONE_API_SECRET
  if (!secret) throw new Error('PORTONE_API_SECRET 환경 변수가 설정되지 않았습니다')
  return secret
}

function getStoreId(): string {
  const storeId = process.env.PORTONE_STORE_ID
  if (!storeId) throw new Error('PORTONE_STORE_ID 환경 변수가 설정되지 않았습니다')
  return storeId
}

function getNoticeUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  return `${baseUrl}/api/webhooks/portone`
}

// 포트원 API 공통 요청 함수
async function portoneRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${PORTONE_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `PortOne ${getApiSecret()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`포트원 API 오류 [${res.status}]: ${errorBody}`)
  }

  return res.json() as Promise<T>
}

// 빌링키로 즉시 결제
export async function chargeBillingKey(params: ChargeParams): Promise<PortOnePaymentResult> {
  const paymentId = `payment-${params.clinicId}-${Date.now()}`

  const body = {
    storeId: getStoreId(),
    billingKey: params.billingKey,
    orderName: params.orderName,
    amount: {
      total: params.amount,
    },
    currency: 'KRW',
    customer: {
      fullName: params.customerName,
      email: params.customerEmail,
    },
    noticeUrls: [params.noticeUrl || getNoticeUrl()],
  }

  const result = await portoneRequest<{ payment: Record<string, unknown> }>(
    `/payments/${paymentId}/billing-key`,
    { method: 'POST', body: JSON.stringify(body) }
  )

  const payment = result.payment
  return {
    paymentId,
    txId: payment.transactionId as string | undefined,
    status: payment.status as string,
    amount: params.amount,
    paidAt: payment.paidAt as string | undefined,
    failReason: payment.failReason as string | undefined,
  }
}

// 다음 달 정기 결제 예약
export async function scheduleNextPayment(params: ScheduleParams): Promise<string> {
  const paymentId = `payment-scheduled-${params.clinicId}-${params.scheduledAt.getTime()}`

  const body = {
    payment: {
      billingKey: params.billingKey,
      orderName: params.planName,
      amount: {
        total: params.planPrice,
      },
      currency: 'KRW',
      customer: {
        email: params.customerEmail,
      },
      noticeUrls: [params.noticeUrl || getNoticeUrl()],
    },
    timeToPay: params.scheduledAt.toISOString(),
  }

  await portoneRequest(
    `/payments/${paymentId}/schedule`,
    { method: 'POST', body: JSON.stringify(body) }
  )

  return paymentId
}

// 빌링키로 예약된 결제 전체 취소
export async function cancelScheduleByBillingKey(billingKey: string): Promise<void> {
  await portoneRequest('/payment-schedules', {
    method: 'DELETE',
    body: JSON.stringify({ billingKey }),
  })
}

// 특정 예약 결제 ID들로 취소
export async function cancelScheduleByIds(scheduleIds: string[]): Promise<void> {
  await portoneRequest('/payment-schedules', {
    method: 'DELETE',
    body: JSON.stringify({ scheduleIds }),
  })
}

// 빌링키 삭제
export async function deleteBillingKey(billingKey: string): Promise<void> {
  await portoneRequest(`/billing-keys/${billingKey}`, {
    method: 'DELETE',
  })
}

// 결제 단건 조회 (웹훅 검증 후 실제 결제 정보 확인용)
export async function getPayment(paymentId: string): Promise<{
  id: string
  status: string
  transactionId?: string
  amount: { total: number }
  paidAt?: string
  failedAt?: string
  failReason?: string
}> {
  const result = await portoneRequest<{ payment: Record<string, unknown> }>(
    `/payments/${paymentId}`
  )
  const p = result.payment
  return {
    id: p.id as string,
    status: p.status as string,
    transactionId: p.transactionId as string | undefined,
    amount: p.amount as { total: number },
    paidAt: p.paidAt as string | undefined,
    failedAt: p.failedAt as string | undefined,
    failReason: p.failReason as string | undefined,
  }
}

// 다음 결제일 계산 (현재 날짜 기준 +1개월)
export function getNextBillingDate(from?: Date): Date {
  const date = from ? new Date(from) : new Date()
  date.setMonth(date.getMonth() + 1)
  return date
}

// 일할 계산: 남은 일수 기준 결제 금액
export function calculateProratedAmount(
  fullPrice: number,
  remainingDays: number,
  totalDays: number = 30
): number {
  return Math.ceil((fullPrice * remainingDays) / totalDays)
}

// 두 날짜 사이의 일수 계산
export function getDaysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * 포트원 결제 부분 취소 (일할 환불용)
 * @see https://developers.portone.io/api/rest-v2/payment#post-/payments/-paymentId-/cancel
 */
export async function partialRefund(params: {
  portonePaymentId: string
  amount: number
  reason: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await portoneRequest<unknown>(
      `/payments/${encodeURIComponent(params.portonePaymentId)}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({
          amount: params.amount,
          reason: params.reason,
        }),
      }
    )
    return { ok: true }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `REFUND_FAILED: ${msg}` }
  }
}
