'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { dataService } from '@/lib/dataService'
import { PREMIUM_FEATURE_IDS } from '@/config/menuConfig'
import { getSupabase } from '@/lib/supabase'

// 번들 구독 시 포함되는 기능 ID 매핑
const BUNDLE_FEATURE_MAP: Record<string, readonly string[]> = {
  'standard-bundle': ['recall', 'ai-analysis', 'financial', 'monthly-report', 'referral'],
  'premium-bundle': ['recall', 'ai-analysis', 'financial', 'monthly-report', 'referral', 'marketing'],
} as const

export function usePremiumFeatures() {
  const { user } = useAuth()
  const [premiumFeatures, setPremiumFeatures] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // master_admin은 모든 프리미엄 기능 활성화
    if (user?.role === 'master_admin') {
      setPremiumFeatures(new Set(PREMIUM_FEATURE_IDS))
      setIsLoading(false)
      return
    }

    if (!user?.clinic_id) {
      setPremiumFeatures(new Set())
      setIsLoading(false)
      return
    }

    const fetchPremiumFeatures = async () => {
      try {
        const featureIds = new Set<string>()

        // 1. 기존: clinic_premium_features 테이블 체크 (마스터가 수동 활성화)
        const { data } = await dataService.getClinicPremiumFeatures(user.clinic_id!)
        if (data) {
          for (const f of data) {
            featureIds.add(f.feature_id)
          }
        }

        // 2. 신규: subscriptions 테이블 체크 (구독 결제)
        const supabase = getSupabase()
        if (supabase) {
          const { data: subs } = await supabase
            .from('subscriptions')
            .select('plan_id, status, subscription_plans(feature_id)')
            .eq('clinic_id', user.clinic_id!)
            .in('status', ['active', 'trialing'])

          if (subs) {
            for (const sub of subs) {
              const plan = sub.subscription_plans as unknown as { feature_id: string | null } | null
              if (!plan?.feature_id) continue

              const bundleFeatures = BUNDLE_FEATURE_MAP[plan.feature_id]
              if (bundleFeatures) {
                // 번들 구독 → 포함된 기능 모두 활성화
                for (const fid of bundleFeatures) {
                  featureIds.add(fid)
                }
              } else {
                // 개별 feature 플랜 (investment 등)
                featureIds.add(plan.feature_id)
              }
            }
          }
        }

        setPremiumFeatures(featureIds)
      } catch (err) {
        console.error('[usePremiumFeatures] Unexpected error:', err)
        setPremiumFeatures(new Set())
      } finally {
        setIsLoading(false)
      }
    }

    fetchPremiumFeatures()
  }, [user?.clinic_id, user?.role])

  const hasPremiumFeature = useCallback((featureId: string): boolean => {
    return premiumFeatures.has(featureId)
  }, [premiumFeatures])

  return { premiumFeatures, hasPremiumFeature, isLoading }
}
