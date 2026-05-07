// src/app/investment/subscribe/page.tsx
// 미구독자 안내 + PortOne SDK로 빌링키 발급 + register API 호출
'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle } from 'lucide-react'
import * as PortOne from '@portone/browser-sdk/v2'

interface Plan {
  id: string
  display_name: string
  monthly_base_price: number
  revenue_share_pct: number
  description: string | null
  is_active: boolean
}

export default function InvestmentSubscribePage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/')
  }, [user, authLoading, router])

  useEffect(() => {
    fetch('/api/investment/subscription/status')
      .then(r => r.json())
      .then(d => {
        if (d.subscription?.status === 'active') router.replace('/investment')
        setPlan(d.plan)
      })
      .catch(e => setStatusError(e instanceof Error ? e.message : '구독 정보 조회 실패'))
  }, [router])

  const onSubscribe = async () => {
    if (!plan) return
    setSubmitting(true); setError(null)
    try {
      const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID
      const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY
      if (!storeId || !channelKey) {
        setError('결제 모듈 설정이 누락되었습니다. 운영자에게 문의해주세요.')
        return
      }

      let res: { billingKey?: string; cardNumber?: string; cardName?: string; code?: string; message?: string } | undefined
      try {
        res = await PortOne.requestIssueBillingKey({
          storeId,
          channelKey,
          billingKeyMethod: 'CARD',
          issueId: `issue-${user?.id}-${Date.now()}`,
          issueName: '자동매매 구독',
        }) as typeof res
      } catch (err) {
        setError(err instanceof Error ? err.message : '결제 모듈 호출 실패')
        return
      }

      if (!res) return  // 모바일 리다이렉트 케이스
      if (res.code !== undefined) { setError(res.message ?? '결제 수단 등록 실패'); return }
      if (!res.billingKey) { setError('결제 수단 등록에 실패했습니다.'); return }

      // CardRegistrationModal 패턴 정렬: PortOne은 카드 정보를 반환하지 않으므로 빈 문자열 전송
      const reg = await fetch('/api/investment/subscription/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingKey: res.billingKey,
          planId: plan.id,
          cardName: '',
          cardNumberLast4: '',
        }),
      })
      const regJson = await reg.json()
      if (!reg.ok) { setError(regJson.error ?? '구독 등록 실패'); return }
      setDone(true)
      setTimeout(() => router.replace('/investment'), 1500)
    } finally { setSubmitting(false) }
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
      {done && <div className="text-green-600 text-sm">구독이 시작되었습니다. 잠시 후 이동합니다.</div>}

      <button
        onClick={onSubscribe}
        disabled={submitting || done}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold"
      >
        {submitting ? '처리 중...' : '구독 시작'}
      </button>
    </div>
  )
}
