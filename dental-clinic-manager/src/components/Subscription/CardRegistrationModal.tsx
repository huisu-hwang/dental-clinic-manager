'use client'

import { useState } from 'react'
import { X, CreditCard, AlertCircle } from 'lucide-react'
import * as PortOne from '@portone/browser-sdk/v2'
import type { SubscriptionPlan } from '@/types/subscription'

interface CardRegistrationModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  selectedPlan: SubscriptionPlan | null
}

export default function CardRegistrationModal({
  isOpen,
  onClose,
  onSuccess,
  selectedPlan,
}: CardRegistrationModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID
  const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY

  async function handleCardRegister() {
    if (!selectedPlan || !storeId || !channelKey) {
      setError('결제 설정이 올바르지 않습니다. 관리자에게 문의해주세요.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 포트원 v2 빌링키 발급 (토스페이먼츠 카드 등록 팝업)
      const response = await PortOne.requestIssueBillingKey({
        storeId,
        channelKey,
        billingKeyMethod: 'CARD',
        issueId: `billing-key-${Date.now()}`,
        issueName: `${selectedPlan.display_name} 플랜 정기결제`,
        windowType: {
          pc: 'IFRAME',
          mobile: 'REDIRECTION',
        },
      })

      // 모바일 리다이렉션 케이스: undefined 반환 (리다이렉션 후 처리됨)
      if (!response) return

      if (response.code !== undefined) {
        setError(response.message ?? '카드 등록에 실패했습니다.')
        return
      }

      const { billingKey } = response
      // 카드 정보는 포트원 응답에서 직접 제공되지 않음 (보안상 제한)
      const card: { name?: string; number?: string } = {}

      // 서버에 빌링키 등록 + 즉시 결제 요청
      const res = await fetch('/api/subscription/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingKey,
          planId: selectedPlan.id,
          cardName: card?.name ?? '',
          cardNumberLast4: card?.number?.slice(-4) ?? '',
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '구독 등록에 실패했습니다.')
        return
      }

      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !selectedPlan) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">결제 수단 등록</h2>
          <button onClick={onClose} disabled={loading} className="rounded-lg p-2 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* 플랜 요약 */}
        <div className="mx-6 my-4 rounded-xl bg-blue-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">{selectedPlan.display_name} 플랜</p>
              <p className="text-sm text-gray-600">{selectedPlan.description}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-blue-600">
                {selectedPlan.price.toLocaleString()}원
              </p>
              <p className="text-xs text-gray-500">월 구독료 (부가세 포함)</p>
            </div>
          </div>
        </div>

        {/* 안내 */}
        <div className="px-6">
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="flex gap-3">
              <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />
              <div className="text-sm text-gray-600">
                <p className="font-medium text-gray-800">카드 등록 안내</p>
                <ul className="mt-1.5 space-y-1">
                  <li>• 결제 버튼을 누르면 토스페이먼츠 안전 결제 팝업이 열립니다</li>
                  <li>• 카드 정보는 저장되지 않으며 토스페이먼츠가 안전하게 관리합니다</li>
                  <li>• 등록 즉시 이번 달 요금이 결제됩니다</li>
                  <li>• 매월 같은 날짜에 자동으로 결제됩니다</li>
                </ul>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* 버튼 */}
        <div className="flex gap-3 px-6 py-5">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleCardRegister}
            disabled={loading}
            className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                처리 중...
              </span>
            ) : (
              `${selectedPlan.price.toLocaleString()}원 결제하기`
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
