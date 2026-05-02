'use client'
import { Sparkles } from 'lucide-react'
import type { SubscriptionPlan, Subscription } from '@/types/subscription'
import { formatPlanPrice } from '@/lib/subscriptionPlans'

interface Props {
  plans: SubscriptionPlan[]
  current?: Subscription | null
  onSelect: (plan: SubscriptionPlan) => void
}

interface BundleCardProps {
  plan: SubscriptionPlan
  isCurrent: boolean
  onSelect: (plan: SubscriptionPlan) => void
  variant: 'standard' | 'premium'
}

function BundleCard({ plan, isCurrent, onSelect, variant }: BundleCardProps) {
  const styles =
    variant === 'premium'
      ? {
          bg: 'bg-purple-50 dark:bg-purple-950/30',
          border: 'border-purple-200 dark:border-purple-800',
          ring: 'ring-purple-500',
          ringHover: 'hover:ring-purple-300',
          currentText: 'text-purple-700',
        }
      : {
          bg: 'bg-indigo-50 dark:bg-indigo-950/30',
          border: 'border-indigo-200 dark:border-indigo-800',
          ring: 'ring-indigo-500',
          ringHover: 'hover:ring-indigo-300',
          currentText: 'text-indigo-700',
        }

  return (
    <button
      type="button"
      onClick={() => onSelect(plan)}
      className={[
        'flex w-full flex-col rounded-lg border p-5 text-left transition',
        styles.bg,
        styles.border,
        isCurrent ? `ring-2 ${styles.ring}` : `hover:ring-1 ${styles.ringHover}`,
      ].join(' ')}
    >
      {isCurrent && (
        <div className={`mb-1 text-[10px] font-semibold ${styles.currentText}`}>현재 이용 중</div>
      )}
      <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{plan.display_name}</div>
      {plan.features?.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-xs text-gray-700 dark:text-gray-300">
          {plan.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 text-sm font-bold text-gray-900 dark:text-gray-100">{formatPlanPrice(plan)}</div>
    </button>
  )
}

export default function PremiumBundleSection({ plans, current, onSelect }: Props) {
  const standard = plans.find((p) => p.name === 'standard-bundle')
  const premium = plans.find((p) => p.name === 'premium-bundle')

  if (!standard && !premium) return null

  return (
    <section aria-labelledby="bundle-heading" className="space-y-3">
      <div className="rounded-md bg-purple-500/10 px-3 py-2">
        <h2
          id="bundle-heading"
          className="flex items-center gap-2 text-sm font-semibold text-purple-700 dark:text-purple-300"
        >
          <Sparkles className="h-4 w-4" /> 유료 패키지
        </h2>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {standard && (
          <BundleCard
            plan={standard}
            isCurrent={current?.plan_id === standard.id}
            onSelect={onSelect}
            variant="standard"
          />
        )}
        {premium && (
          <BundleCard
            plan={premium}
            isCurrent={current?.plan_id === premium.id}
            onSelect={onSelect}
            variant="premium"
          />
        )}
      </div>
    </section>
  )
}
