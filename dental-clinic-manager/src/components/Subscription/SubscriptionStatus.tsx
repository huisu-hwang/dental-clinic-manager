'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CreditCard,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import type { SubscriptionStatusResponse, SubscriptionPlan } from '@/types/subscription'
import { formatPlanPrice } from '@/lib/subscriptionPlans'
import PlanSelectModal from './PlanSelectModal'
import CardRegistrationModal from './CardRegistrationModal'

const STATUS_CONFIG = {
  active: { label: '구독 중', color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle },
  trialing: { label: '체험 중', color: 'text-blue-600', bg: 'bg-blue-50', icon: CheckCircle },
  past_due: { label: '결제 연체', color: 'text-amber-600', bg: 'bg-amber-50', icon: AlertTriangle },
  suspended: { label: '서비스 정지', color: 'text-red-600', bg: 'bg-red-50', icon: XCircle },
  cancelled: { label: '취소됨', color: 'text-gray-600', bg: 'bg-gray-50', icon: XCircle },
  expired: { label: '만료됨', color: 'text-gray-600', bg: 'bg-gray-50', icon: XCircle },
} as const

export default function SubscriptionStatus() {
  const [statusData, setStatusData] = useState<SubscriptionStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [showCardModal, setShowCardModal] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/subscription/status')
      const data = await res.json()
      setStatusData(data)
    } catch {
      // 오류 무시
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  function handlePlanSelect(plan: SubscriptionPlan) {
    setSelectedPlan(plan)
    setShowPlanModal(false)
    setShowCardModal(true)
  }

  async function handleCancelSubscription() {
    if (!confirm('구독을 취소하시겠습니까? 현재 결제 기간이 끝나면 서비스 이용이 중단됩니다.')) return
    setCancelling(true)
    try {
      const res = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ immediate: false }),
      })
      const data = await res.json()
      if (res.ok) {
        alert(data.message)
        fetchStatus()
      } else {
        alert(data.error ?? '취소에 실패했습니다.')
      }
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  const { subscription, plan, isFreePlan, canUpgrade, daysUntilExpiry } = statusData ?? {
    subscription: null,
    plan: null,
    isFreePlan: true,
    canUpgrade: true,
    daysUntilExpiry: null,
  }

  const status = subscription?.status ?? 'active'
  const statusConfig = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.active
  const StatusIcon = statusConfig.icon

  return (
    <div className="space-y-4">
      {/* 현재 플랜 카드 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-500">현재 플랜</h3>
            <p className="mt-1 text-xl font-bold text-gray-900">
              {plan ? plan.display_name : 'Free'} 플랜
            </p>
            {plan && (
              <p className="text-sm text-gray-600">{formatPlanPrice(plan)}</p>
            )}
          </div>

          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 ${statusConfig.bg}`}>
            <StatusIcon className={`h-4 w-4 ${statusConfig.color}`} />
            <span className={`text-xs font-medium ${statusConfig.color}`}>{statusConfig.label}</span>
          </div>
        </div>

        {/* 결제 연체 경고 */}
        {status === 'past_due' && (
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
            <p className="font-medium">결제가 실패했습니다</p>
            <p className="mt-0.5 text-xs">
              {subscription?.next_retry_at
                ? `다음 재시도: ${new Date(subscription.next_retry_at).toLocaleDateString('ko-KR')}`
                : '카드 정보를 확인해주세요'}
            </p>
          </div>
        )}

        {/* 취소 예약 안내 */}
        {subscription?.cancel_at_period_end && (
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            <p>
              구독 취소가 예약되었습니다.{' '}
              {subscription.current_period_end && (
                <span className="font-medium">
                  {new Date(subscription.current_period_end).toLocaleDateString('ko-KR')}
                </span>
              )}
              까지 서비스를 이용할 수 있습니다.
            </p>
          </div>
        )}

        {/* 카드 정보 */}
        {subscription?.card_name && (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
            <CreditCard className="h-4 w-4 text-gray-400" />
            <span>
              {subscription.card_name} ****{subscription.card_number_last4}
            </span>
          </div>
        )}

        {/* 다음 결제일 */}
        {subscription?.next_billing_date && !subscription.cancel_at_period_end && (
          <div className="mt-2 text-sm text-gray-500">
            다음 결제일:{' '}
            {new Date(subscription.next_billing_date).toLocaleDateString('ko-KR')}
            {daysUntilExpiry !== null && daysUntilExpiry <= 7 && (
              <span className="ml-1 text-amber-600">({daysUntilExpiry}일 후)</span>
            )}
          </div>
        )}
      </div>

      {/* 액션 버튼 */}
      <div className="flex flex-col gap-2">
        {canUpgrade && (
          <button
            onClick={() => setShowPlanModal(true)}
            className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-5 py-3.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            <span>{isFreePlan ? '유료 플랜으로 업그레이드' : '플랜 변경'}</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {!isFreePlan && !subscription?.cancel_at_period_end && status === 'active' && (
          <button
            onClick={handleCancelSubscription}
            disabled={cancelling}
            className="rounded-xl border border-gray-200 px-5 py-3.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelling ? '처리 중...' : '구독 취소'}
          </button>
        )}
      </div>

      {/* 모달 */}
      <PlanSelectModal
        isOpen={showPlanModal}
        onClose={() => setShowPlanModal(false)}
        onSelect={handlePlanSelect}
        currentSubscription={subscription}
      />
      <CardRegistrationModal
        isOpen={showCardModal}
        onClose={() => setShowCardModal(false)}
        onSuccess={fetchStatus}
        selectedPlan={selectedPlan}
      />
    </div>
  )
}
