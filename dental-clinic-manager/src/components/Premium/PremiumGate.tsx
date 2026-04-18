'use client'

import { useState } from 'react'
import { usePremiumFeatures } from '@/hooks/usePremiumFeatures'
import { PREMIUM_FEATURE_INFO } from '@/config/menuConfig'
import type { PremiumFeatureId } from '@/config/menuConfig'
import { Sparkles, Check, CreditCard } from 'lucide-react'
import CardRegistrationModal from '@/components/Subscription/CardRegistrationModal'
import type { SubscriptionPlan } from '@/types/subscription'

interface PremiumGateProps {
  featureId: PremiumFeatureId
  children: React.ReactNode
}

export default function PremiumGate({ featureId, children }: PremiumGateProps) {
  const { hasPremiumFeature, isLoading } = usePremiumFeatures()
  const [showPayment, setShowPayment] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null)

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

  const info = PREMIUM_FEATURE_INFO[featureId]

  async function handleSubscribe() {
    try {
      const res = await fetch('/api/subscription/plans?type=feature')
      const plans: SubscriptionPlan[] = await res.json()
      // premium-bundle 또는 해당 feature의 플랜 찾기
      const plan = featureId === 'investment'
        ? plans.find(p => p.feature_id === 'investment')
        : plans.find(p => p.feature_id === 'premium-bundle')
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
      {/* 데모 배경: 실제 콘텐츠를 흐리게 표시 */}
      <div className="pointer-events-none select-none" aria-hidden="true">
        <div className="blur-[6px] opacity-40 saturate-50">
          {children}
        </div>
      </div>

      {/* 중앙 오버레이: 기능 설명 + 결제 CTA */}
      <div className="absolute inset-0 flex items-center justify-center p-4 z-10">
        {/* 배경 그라데이션 */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/60 via-white/80 to-white/60" />

        <div className="relative w-full max-w-lg">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white">{info.title}</h2>
                    <span className="text-[10px] font-bold tracking-wider bg-white/25 text-white px-2 py-0.5 rounded-full">PRO</span>
                  </div>
                  <p className="text-sm text-white/80">{info.planName} 플랜</p>
                </div>
              </div>
            </div>

            {/* 본문 */}
            <div className="px-6 py-5">
              <p className="text-sm text-gray-600 mb-4">{info.description}</p>

              <ul className="space-y-2.5 mb-6">
                {info.highlights.map((item, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-sm text-gray-700">
                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-green-600" />
                    </div>
                    {item}
                  </li>
                ))}
              </ul>

              {/* 가격 */}
              <div className="flex items-baseline gap-1 mb-5">
                <span className="text-3xl font-bold text-gray-900">{info.priceLabel}</span>
                {info.priceLabel.includes('원') && (
                  <span className="text-sm text-gray-500">(VAT 포함)</span>
                )}
              </div>

              {/* 결제 버튼 */}
              <button
                onClick={handleSubscribe}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white font-semibold py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40"
              >
                <CreditCard className="w-5 h-5" />
                구독 시작하기
              </button>

              <p className="text-center text-xs text-gray-400 mt-3">
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
