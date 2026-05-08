// src/app/investment/subscribe/page.tsx
// 미구독자 안내 + 토스페이먼츠 SDK로 빌링 인증 (successUrl 리다이렉트)
'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle } from 'lucide-react'
import { loadTossPayments } from '@tosspayments/tosspayments-sdk'

interface Plan {
  id: string
  display_name: string
  monthly_base_price: number
  revenue_share_pct: number
  description: string | null
  is_active: boolean
}

interface StatusResponse {
  subscription?: {
    status?: string | null
    plan?: Plan | null
  } | null
  plan?: Plan | null
}

export default function InvestmentSubscribePage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/')
  }, [user, authLoading, router])

  useEffect(() => {
    fetch('/api/investment/subscription/status')
      .then(r => r.json())
      .then((d: StatusResponse) => {
        if (d.subscription?.status === 'active') {
          router.replace('/investment')
          return
        }
        // status route는 { subscription, plan } 반환 — subscription.plan 우선 + 폴백
        setPlan(d.subscription?.plan ?? d.plan ?? null)
      })
      .catch(e => setStatusError(e instanceof Error ? e.message : '구독 정보 조회 실패'))
  }, [router])

  const onSubscribe = async () => {
    if (!plan) return
    setSubmitting(true)
    setError(null)
    try {
      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY
      if (!clientKey) {
        setError('NEXT_PUBLIC_TOSS_CLIENT_KEY 미설정')
        setSubmitting(false)
        return
      }

      // 1) customerKey 발급
      const ckRes = await fetch('/api/investment/billing/customer-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id }),
      })
      if (!ckRes.ok) {
        const j = await ckRes.json().catch(() => ({}))
        throw new Error(j.error ?? 'customerKey 발급 실패')
      }
      const { customerKey } = await ckRes.json()

      // 2) 토스 빌링 인증 요청 (리다이렉트)
      const tossPayments = await loadTossPayments(clientKey)
      const payment = tossPayments.payment({ customerKey })

      const params = new URLSearchParams({
        planId: plan.id,
        amount: String(plan.monthly_base_price),
        planName: plan.display_name,
      })

      await payment.requestBillingAuth({
        method: 'CARD',
        successUrl: `${window.location.origin}/investment/subscribe/success?${params.toString()}`,
        failUrl: `${window.location.origin}/investment/subscribe/fail`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '결제 모듈 호출 실패')
      setSubmitting(false)
    }
  }

  if (authLoading) return <div className="p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
  if (statusError) return <div className="p-8 text-red-600">{statusError}</div>
  if (!plan) return <div className="p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>

  return (
    <div className="max-w-xl mx-auto p-8 space-y-6">
      <h1 className="text-2xl font-bold">{plan.display_name} 구독</h1>
      {plan.description && <p className="text-gray-600 text-sm">{plan.description}</p>}

      <div className="bg-white rounded-xl border p-6 space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold">{plan.monthly_base_price.toLocaleString()}원</span>
          <span className="text-gray-500">/ 월</span>
        </div>
        <div className="text-sm text-gray-600">
          추가로 매월 실현 수익의 <b>{plan.revenue_share_pct}%</b>가 청구됩니다 (수익이 양수일 때만).
        </div>
        <ul className="text-sm space-y-1 text-gray-700 pt-2">
          <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> AI 자동매매 전략</li>
          <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> 전략 백테스트</li>
          <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> 실시간 포트폴리오</li>
          <li className="flex gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> 군중심리 분석 (포함)</li>
        </ul>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <button
        onClick={onSubscribe}
        disabled={submitting}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold"
      >
        {submitting ? '처리 중...' : '구독 시작'}
      </button>
    </div>
  )
}
