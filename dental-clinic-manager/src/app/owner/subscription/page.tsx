'use client'

import { useEffect, useState } from 'react'
import { loadTossPayments } from '@tosspayments/tosspayments-sdk'
import type { SubscriptionPlan, SubscriptionStatusResponse } from '@/types/subscription'

export default function OwnerSubscriptionPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [status, setStatus] = useState<SubscriptionStatusResponse | null>(null)
  const [selected, setSelected] = useState<SubscriptionPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([
      fetch('/api/subscription/plans').then(r => r.json()),
      fetch('/api/subscription/status').then(r => r.json()),
    ]).then(([p, s]) => {
      setPlans(p)
      setStatus(s)
    })
  }, [])

  async function handleStart(plan: SubscriptionPlan) {
    setLoading(true)
    setError(null)
    try {
      const ckRes = await fetch('/api/billing/customer-key', { method: 'POST' })
      if (!ckRes.ok) throw new Error('customerKey 발급 실패')
      const { customerKey } = await ckRes.json()

      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY
      if (!clientKey) throw new Error('NEXT_PUBLIC_TOSS_CLIENT_KEY 미설정')

      const tossPayments = await loadTossPayments(clientKey)
      const payment = tossPayments.payment({ customerKey })

      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl: `${window.location.origin}/owner/subscription/billing/success?planId=${plan.id}`,
        failUrl: `${window.location.origin}/owner/subscription/billing/fail`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '결제 처리 중 오류')
      setLoading(false)
    }
  }

  if (status?.subscription?.status === 'active') {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold">구독 관리</h1>
        <p className="mt-4">현재 플랜: {status.plan?.display_name}</p>
        <p className="text-sm text-gray-500">
          다음 결제일: {status.subscription.next_billing_date?.slice(0, 10)}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold mb-6">플랜 선택</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plans.map(plan => (
          <div
            key={plan.id}
            className={`rounded-xl border p-5 cursor-pointer ${selected?.id === plan.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
            onClick={() => setSelected(plan)}
          >
            <h3 className="font-semibold">{plan.display_name}</h3>
            <p className="text-2xl font-bold mt-2">{plan.price.toLocaleString()}원<span className="text-sm font-normal">/월</span></p>
            <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
          </div>
        ))}
      </div>

      {error && <p className="mt-4 text-red-600 text-sm">{error}</p>}

      <button
        disabled={!selected || loading}
        onClick={() => selected && handleStart(selected)}
        className="mt-6 w-full rounded-xl bg-blue-600 py-3 text-white font-medium disabled:opacity-50"
      >
        {loading ? '처리 중...' : `${selected?.display_name ?? ''} 구독 시작`}
      </button>
    </div>
  )
}
