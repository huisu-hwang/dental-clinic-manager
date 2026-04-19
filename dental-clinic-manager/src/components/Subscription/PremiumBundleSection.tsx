'use client'
import { Sparkles } from 'lucide-react'
import type { SubscriptionPlan, Subscription } from '@/types/subscription'
import { formatPlanPrice } from '@/lib/subscriptionPlans'

interface Props {
  plans: SubscriptionPlan[]
  current?: Subscription | null
  onSelect: (plan: SubscriptionPlan) => void
}

export default function PremiumBundleSection({ plans, current, onSelect }: Props) {
  const bundle = plans.find((p) => p.name === 'premium-bundle')
  if (!bundle) return null
  const isCurrent = current?.plan_id === bundle.id

  return (
    <section aria-labelledby="premium-heading" className="space-y-3">
      <div className="rounded-md bg-purple-500/10 px-3 py-2">
        <h2 id="premium-heading" className="flex items-center gap-2 text-sm font-semibold text-purple-700 dark:text-purple-300">
          <Sparkles className="h-4 w-4" /> 프리미엄 패키지
        </h2>
      </div>

      <button
        type="button"
        onClick={() => onSelect(bundle)}
        className={[
          'w-full rounded-lg border p-5 text-left transition',
          'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800',
          isCurrent ? 'ring-2 ring-purple-500' : 'hover:ring-1 hover:ring-purple-300',
        ].join(' ')}
      >
        {isCurrent && <div className="mb-1 text-[10px] font-semibold text-purple-700">현재 이용 중</div>}
        <div className="text-base font-semibold">{bundle.display_name}</div>
        <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
          <li>AI 데이터 분석 — 매출/환자 추이 자동 분석</li>
          <li>경영 현황 — 수입/지출 관리</li>
          <li>마케팅 자동화 — AI 임상글 생성</li>
        </ul>
        <div className="mt-3 text-sm font-bold">{formatPlanPrice(bundle)}</div>
      </button>
    </section>
  )
}
