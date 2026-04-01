'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { dataService } from '@/lib/dataService'
import { PREMIUM_FEATURE_IDS } from '@/config/menuConfig'

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
        const { data, error } = await dataService.getClinicPremiumFeatures(user.clinic_id!)
        if (error) {
          console.error('[usePremiumFeatures] Error:', error)
          setPremiumFeatures(new Set())
        } else {
          const featureIds = new Set<string>((data || []).map((f: { feature_id: string }) => f.feature_id))
          setPremiumFeatures(featureIds)
        }
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
