'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { formatPlanPrice } from '@/lib/subscriptionPlans'
import type { SubscriptionPlan } from '@/types/subscription'

interface Props {
  open: boolean
  onClose: () => void
  onPayNow: () => void
  context: {
    currentPlan: string
    currentLimit: number
    currentActive: number
    pendingToApprove: number
    recommendedPlan: string
  }
}

export default function UpgradeRequiredModal({ open, onClose, onPayNow, context }: Props) {
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null)

  useEffect(() => {
    if (!open) return
    const ac = new AbortController()
    setPlan(null)  // reset stale plan
    fetch(`/api/subscription/plans?name=${encodeURIComponent(context.recommendedPlan)}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.plans ?? []
        setPlan(list.find((p: SubscriptionPlan) => p.name === context.recommendedPlan) ?? null)
      })
      .catch(() => {})
    return () => ac.abort()
  }, [open, context.recommendedPlan])

  const projected = context.currentActive + context.pendingToApprove

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>구독 업그레이드가 필요합니다</DialogTitle>
          <DialogDescription>
            현재 플랜(<b>{context.currentPlan}</b>)의 상한은 <b>{context.currentLimit}명</b>입니다.
            재직자 {context.currentActive}명 + 승인 대기 {context.pendingToApprove}명 = <b>{projected}명</b>
            이라 승인을 진행할 수 없습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {plan ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
              <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{plan.display_name}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {plan.min_users}~{plan.max_users}인 · {formatPlanPrice(plan)}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>나중에 결제</Button>
          <Button onClick={onPayNow}>지금 결제하기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
