'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePremiumFeatures } from '@/hooks/usePremiumFeatures'
import { PREMIUM_FEATURE_INFO } from '@/config/menuConfig'
import type { PremiumFeatureId, PremiumPlanOption } from '@/config/menuConfig'
import { Sparkles, Check, CreditCard, X } from 'lucide-react'
import CardRegistrationModal from '@/components/Subscription/CardRegistrationModal'
import type { SubscriptionPlan } from '@/types/subscription'

interface PremiumGateProps {
  featureId: PremiumFeatureId
  children: React.ReactNode
}

export default function PremiumGate({ featureId, children }: PremiumGateProps) {
  const router = useRouter()
  const { hasPremiumFeature, isLoading } = usePremiumFeatures()
  const [showPayment, setShowPayment] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null)
  const [dismissed, setDismissed] = useState(false)

  function handleClose() {
    setDismissed(true)
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/dashboard')
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 bg-white min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent" />
      </div>
    )
  }

  if (hasPremiumFeature(featureId)) {
    return <>{children}</>
  }

  if (dismissed) {
    return null
  }

  const info = PREMIUM_FEATURE_INFO[featureId]

  async function handleSelectPlan(option: PremiumPlanOption) {
    try {
      const res = await fetch('/api/subscription/plans?type=feature')
      const plans: SubscriptionPlan[] = await res.json()
      const plan = plans.find(p => p.feature_id === option.planFeatureId)
      if (plan) {
        setSelectedPlan(plan)
        setShowPayment(true)
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="relative min-h-screen">
      {/* 데모 배경 */}
      <div className="pointer-events-none select-none" aria-hidden="true">
        <div className="blur-[2px] opacity-70">
          {children}
        </div>
      </div>

      {/* 고정 오버레이 */}
      <div className="fixed inset-0 flex items-center justify-center p-4 z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/30 to-transparent" />

        <div className="relative w-full max-w-2xl">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white truncate">{info.title}</h2>
                      <span className="text-[10px] font-bold tracking-wider bg-white/25 text-white px-2 py-0.5 rounded-full flex-shrink-0">PRO</span>
                    </div>
                    <p className="text-sm text-white/80 truncate">{info.description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="닫기"
                  className="flex-shrink-0 rounded-lg p-2 text-white/90 hover:bg-white/20 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 플랜 카드 */}
            <div className={`px-6 py-5 ${info.plans.length > 1 ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : ''}`}>
              {info.plans.map((option) => (
                <div
                  key={option.planFeatureId}
                  className={`relative rounded-xl border-2 p-5 flex flex-col ${
                    option.recommended ? 'border-amber-400 bg-amber-50/50' : 'border-gray-200 bg-white'
                  }`}
                >
                  {option.recommended && info.plans.length > 1 && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-3 py-0.5 text-[10px] font-bold text-white whitespace-nowrap">
                      추천
                    </span>
                  )}

                  <h3 className="font-semibold text-gray-900 text-base">{option.name}</h3>
                  <div className="mt-2 mb-4">
                    <span className="text-2xl font-bold text-gray-900">{option.priceLabel}</span>
                    {option.priceLabel.includes('원') && (
                      <span className="text-xs text-gray-500 ml-1">(VAT 포함)</span>
                    )}
                  </div>

                  <ul className="space-y-2 mb-5 flex-1">
                    {option.includes.map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                        <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          <Check className="w-2.5 h-2.5 text-green-600" />
                        </div>
                        {item}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleSelectPlan(option)}
                    className={`w-full flex items-center justify-center gap-2 font-semibold py-3 px-4 rounded-xl transition-all text-sm ${
                      option.recommended
                        ? 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white shadow-lg shadow-amber-500/25'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    구독 시작하기
                  </button>
                </div>
              ))}
            </div>

            <div className="px-6 pb-4">
              <p className="text-center text-xs text-gray-400">
                언제든 구독을 취소할 수 있습니다
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 결제 모달 */}
      <CardRegistrationModal
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
        onSuccess={() => window.location.reload()}
        selectedPlan={selectedPlan}
      />
    </div>
  )
}
