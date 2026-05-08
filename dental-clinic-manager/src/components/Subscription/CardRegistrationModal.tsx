'use client'

import { useState } from 'react'
import { X, CreditCard, AlertCircle } from 'lucide-react'
import { loadTossPayments } from '@tosspayments/tosspayments-sdk'
import type { SubscriptionPlan } from '@/types/subscription'

interface CardRegistrationModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  selectedPlan: SubscriptionPlan | null
}

/**
 * 카드 등록 모달 (토스페이먼츠 SDK 기반)
 *
 * 토스 빌링 인증은 redirect 기반(`successUrl`/`failUrl`)이므로
 * `onSuccess` 콜백은 즉시 호출되지 않는다. 사용자가 인증을 마치면
 * `/owner/subscription/billing/success?planId=...`로 돌아오고, 해당 페이지에서
 * authKey + customerKey를 받아 서버 등록 API를 호출한다.
 *
 * 기존 CardRegistrationModal과 동일한 props로 호출 가능 (drop-in).
 */
export default function CardRegistrationModal({
  isOpen,
  onClose,
  selectedPlan,
}: CardRegistrationModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCardRegister() {
    if (!selectedPlan) {
      setError('플랜을 선택해주세요.')
      return
    }

    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY
    if (!clientKey) {
      setError('결제 설정이 올바르지 않습니다. 관리자에게 문의해주세요.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 1) 서버에서 customerKey 발급 (활성 구독이 이미 있으면 그 값을 그대로 반환)
      const ckRes = await fetch('/api/billing/customer-key', { method: 'POST' })
      if (!ckRes.ok) {
        const j = await ckRes.json().catch(() => ({}))
        throw new Error(j.error ?? 'customerKey 발급 실패')
      }
      const { customerKey } = await ckRes.json()

      // 2) 토스 SDK 빌링 인증 (redirect)
      const tossPayments = await loadTossPayments(clientKey)
      const payment = tossPayments.payment({ customerKey })

      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl: `${window.location.origin}/owner/subscription/billing/success?planId=${selectedPlan.id}`,
        failUrl: `${window.location.origin}/owner/subscription/billing/fail`,
      })
      // requestBillingAuth는 redirect되므로 이 줄 이후는 일반적으로 도달하지 않음.
    } catch (err) {
      setError(err instanceof Error ? err.message : '결제 모듈 호출 실패')
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-gray-900">카드 등록</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {selectedPlan && (
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-sm text-gray-500">선택한 플랜</p>
              <p className="mt-1 font-semibold text-gray-900">
                {selectedPlan.display_name}
              </p>
              <p className="text-sm text-gray-600">
                {selectedPlan.price.toLocaleString()}원/월
              </p>
            </div>
          )}

          <div className="rounded-xl bg-blue-50 p-3 text-xs text-blue-700">
            안전한 결제를 위해 토스페이먼츠 카드 등록 페이지로 이동합니다.
            인증이 끝나면 자동으로 결제가 진행됩니다.
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleCardRegister}
            disabled={loading || !selectedPlan}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <CreditCard className="h-4 w-4" />
            {loading ? '처리 중...' : '카드 등록 후 결제 시작'}
          </button>
        </div>
      </div>
    </div>
  )
}
