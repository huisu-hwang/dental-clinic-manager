'use client'

import { useState, useEffect } from 'react'
import { X, Check, Users, Zap } from 'lucide-react'
import type { SubscriptionPlan, Subscription } from '@/types/subscription'

interface PlanSelectModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (plan: SubscriptionPlan) => void
  currentSubscription?: Subscription | null
}

export default function PlanSelectModal({
  isOpen,
  onClose,
  onSelect,
  currentSubscription,
}: PlanSelectModalProps) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [activeTab, setActiveTab] = useState<'headcount' | 'feature'>('headcount')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    fetchPlans()
  }, [isOpen])

  async function fetchPlans() {
    setLoading(true)
    try {
      const res = await fetch('/api/subscription/plans')
      const data = await res.json()
      setPlans(data)
    } catch {
      // 오류 무시
    } finally {
      setLoading(false)
    }
  }

  const headcountPlans = plans.filter(p => p.type === 'headcount')
  const featurePlans = plans.filter(p => p.type === 'feature')
  const currentPlanId = currentSubscription?.plan_id

  function formatPrice(price: number) {
    if (price === 0) return '무료'
    return `${price.toLocaleString()}원/월`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">구독 플랜 선택</h2>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 border-b border-gray-100 px-6">
          <button
            onClick={() => setActiveTab('headcount')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'headcount'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="h-4 w-4" />
            인원별 플랜
          </button>
          <button
            onClick={() => setActiveTab('feature')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'feature'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Zap className="h-4 w-4" />
            기능별 추가
          </button>
        </div>

        {/* 플랜 목록 */}
        <div className="max-h-[60vh] overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(activeTab === 'headcount' ? headcountPlans : featurePlans).map(plan => {
                const isCurrent = plan.id === currentPlanId
                const isEnterprise = plan.name === 'enterprise'

                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col rounded-xl border-2 p-5 transition-all ${
                      isCurrent
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-blue-300'
                    }`}
                  >
                    {isCurrent && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-0.5 text-xs font-medium text-white">
                        현재 플랜
                      </span>
                    )}

                    <div className="mb-3">
                      <h3 className="font-semibold text-gray-900">{plan.display_name}</h3>
                      {plan.type === 'headcount' && plan.name !== 'enterprise' && (
                        <p className="mt-0.5 text-xs text-gray-500">
                          {plan.min_users}~{plan.max_users}인
                        </p>
                      )}
                      {plan.description && (
                        <p className="mt-1 text-xs text-gray-500">{plan.description}</p>
                      )}
                    </div>

                    <div className="mb-4">
                      <span className="text-2xl font-bold text-gray-900">
                        {formatPrice(plan.price)}
                      </span>
                    </div>

                    <ul className="mb-4 flex-1 space-y-1.5">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    <button
                      disabled={isCurrent || isEnterprise}
                      onClick={() => !isCurrent && !isEnterprise && onSelect(plan)}
                      className={`w-full rounded-lg py-2 text-sm font-medium transition-colors ${
                        isCurrent
                          ? 'cursor-default bg-blue-100 text-blue-600'
                          : isEnterprise
                          ? 'cursor-default bg-gray-100 text-gray-400'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {isCurrent ? '현재 플랜' : isEnterprise ? '문의하기' : '선택'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Enterprise 안내 */}
        {activeTab === 'headcount' && (
          <div className="border-t border-gray-100 px-6 py-4">
            <p className="text-center text-xs text-gray-500">
              51인 이상 사업장은{' '}
              <a href="mailto:support@hayandc.com" className="text-blue-600 hover:underline">
                support@hayandc.com
              </a>
              으로 문의해주세요.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
