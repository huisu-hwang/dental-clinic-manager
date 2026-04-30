'use client'
import { Users } from 'lucide-react'
import type { SubscriptionPlan, Subscription } from '@/types/subscription'
import { formatPlanPrice } from '@/lib/subscriptionPlans'

interface Props {
  plans: SubscriptionPlan[]
  current?: Subscription | null
  activeCount: number
  onSelect: (plan: SubscriptionPlan) => void
}

export default function BasicPlansSection({ plans, current, activeCount, onSelect }: Props) {
  const headcountPlans = plans.filter((p) => p.type === 'headcount').sort((a, b) => a.sort_order - b.sort_order)
  const currentId = current?.plan_id
  const currentPlan = headcountPlans.find((p) => p.id === currentId)
  const limit = currentPlan?.max_users ?? 4
  const usage = Math.min(100, Math.round((activeCount / Math.max(1, limit)) * 100))

  return (
    <section aria-labelledby="basic-plans-heading" className="space-y-3">
      <div className="flex items-center justify-between rounded-md bg-blue-500/10 px-3 py-2">
        <h2 id="basic-plans-heading" className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
          <Users className="h-4 w-4" /> 기본 플랜 (직원 수 기준)
        </h2>
        <div className="text-xs text-blue-700 dark:text-blue-300">
          {activeCount}/{limit}명 사용 중
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {headcountPlans.map((plan) => {
          const isCurrent = plan.id === currentId
          const isDisabled = plan.max_users != null && plan.max_users < activeCount
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => !isDisabled && onSelect(plan)}
              disabled={isDisabled}
              className={[
                'flex flex-col gap-1 rounded-lg border p-4 text-left transition',
                'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
                isCurrent ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-blue-300',
                isDisabled ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
              title={isDisabled ? `현재 ${activeCount}명 재직 중` : undefined}
            >
              {isCurrent && <span className="text-[10px] font-semibold text-blue-700">현재 이용 중</span>}
              <div className="text-sm font-semibold">{plan.display_name}</div>
              <div className="text-xs text-muted-foreground">
                {plan.min_users}~{plan.max_users}인
              </div>
              <div className="mt-1 text-sm font-bold">{formatPlanPrice(plan)}</div>
            </button>
          )
        })}
      </div>

      <div className="h-1.5 overflow-hidden rounded bg-blue-100 dark:bg-blue-950">
        <div className={`h-full bg-blue-500 transition-all`} style={{ width: `${usage}%` }} />
      </div>
    </section>
  )
}
