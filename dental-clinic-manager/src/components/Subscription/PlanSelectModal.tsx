'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { SubscriptionPlan, Subscription } from '@/types/subscription'
import BasicPlansSection from './BasicPlansSection'
import PremiumBundleSection from './PremiumBundleSection'
import { countActiveEmployeesClient } from '@/lib/subscriptionClient'

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
  const [activeCount, setActiveCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [plansRes, count] = await Promise.all([
          fetch('/api/subscription/plans').then((r) => r.json()),
          countActiveEmployeesClient(),
        ])
        if (cancelled) return
        setPlans(Array.isArray(plansRes) ? plansRes : [])
        setActiveCount(count)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white dark:bg-gray-900 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-6 py-4 shrink-0">
          <h2 className="text-lg font-semibold">구독 플랜</h2>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : (
            <>
              <BasicPlansSection
                plans={plans}
                current={currentSubscription}
                activeCount={activeCount}
                onSelect={onSelect}
              />
              <PremiumBundleSection
                plans={plans}
                current={currentSubscription}
                onSelect={onSelect}
              />
            </>
          )}
        </div>

        <div className="border-t border-gray-100 dark:border-gray-800 px-6 py-3 text-center text-xs text-gray-500 shrink-0">
          51인 이상 사업장은 <a href="mailto:support@hayandc.com" className="text-blue-600 hover:underline">support@hayandc.com</a>으로 문의해주세요.
        </div>
      </div>
    </div>
  )
}
