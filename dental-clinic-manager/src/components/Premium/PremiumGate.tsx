'use client'

import { usePremiumFeatures } from '@/hooks/usePremiumFeatures'
import { PREMIUM_FEATURE_LABELS } from '@/config/menuConfig'
import type { PremiumFeatureId } from '@/config/menuConfig'
import { Lock, Sparkles } from 'lucide-react'

interface PremiumGateProps {
  featureId: PremiumFeatureId
  children: React.ReactNode
}

export default function PremiumGate({ featureId, children }: PremiumGateProps) {
  const { hasPremiumFeature, isLoading } = usePremiumFeatures()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  if (!hasPremiumFeature(featureId)) {
    const featureLabel = PREMIUM_FEATURE_LABELS[featureId] || featureId

    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
            <Lock className="w-8 h-8 text-slate-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-700 mb-2">
            프리미엄 기능
          </h2>
          <p className="text-slate-500 mb-4">
            <span className="font-semibold text-slate-600">{featureLabel}</span> 기능은
            프리미엄 서비스입니다.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 text-amber-700 text-sm">
            <Sparkles className="w-4 h-4" />
            <span>이용을 원하시면 관리자에게 문의해주세요</span>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
