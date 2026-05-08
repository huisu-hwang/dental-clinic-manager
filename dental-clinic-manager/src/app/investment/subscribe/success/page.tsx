'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

function InvestmentSubscribeSuccessContent() {
  const params = useSearchParams()
  const router = useRouter()
  const [state, setState] = useState<'processing' | 'done' | 'error'>('processing')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const authKey = params.get('authKey')
    const customerKey = params.get('customerKey')
    const planId = params.get('planId')
    const amountStr = params.get('amount')
    const planName = params.get('planName')

    if (!authKey || !customerKey || !planId || !amountStr || !planName) {
      setState('error')
      setError('필수 파라미터가 누락되었습니다.')
      return
    }

    const amount = Number(amountStr)
    if (!Number.isFinite(amount) || amount <= 0) {
      setState('error')
      setError('결제 금액이 올바르지 않습니다.')
      return
    }

    void (async () => {
      try {
        const res = await fetch('/api/investment/billing/auth/issue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authKey, customerKey, planId, amount, planName }),
        })
        const data = await res.json()
        if (!res.ok) {
          setState('error')
          setError(data.error ?? '결제 처리 실패')
          return
        }
        setState('done')
      } catch (err) {
        setState('error')
        setError(err instanceof Error ? err.message : '결제 처리 중 오류')
      }
    })()
  }, [params])

  if (state === 'processing') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="mt-4 text-gray-600">결제 처리 중입니다...</p>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-semibold text-red-600">결제 실패</h1>
        <p className="mt-3 text-sm text-gray-700">{error}</p>
        <div className="mt-6 flex gap-3 justify-center">
          <button
            onClick={() => router.push('/investment/subscribe')}
            className="rounded-xl bg-blue-600 px-6 py-2 text-sm text-white"
          >
            다시 시도
          </button>
          <button
            onClick={() => router.push('/dashboard')}
            className="rounded-xl bg-gray-100 px-6 py-2 text-sm"
          >
            대시보드로
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-2xl font-bold text-blue-600">구독이 시작되었습니다!</h1>
      <p className="mt-3 text-sm text-gray-600">매월 같은 날짜에 자동으로 결제됩니다.</p>
      <button
        onClick={() => router.push('/investment')}
        className="mt-6 rounded-xl bg-blue-600 px-6 py-3 text-white font-medium"
      >
        투자 페이지로 이동
      </button>
    </div>
  )
}

export default function InvestmentSubscribeSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            <p className="mt-4 text-gray-600">결제 처리 중입니다...</p>
          </div>
        </div>
      }
    >
      <InvestmentSubscribeSuccessContent />
    </Suspense>
  )
}
