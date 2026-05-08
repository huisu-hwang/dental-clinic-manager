'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

function BillingFailContent() {
  const params = useSearchParams()
  const router = useRouter()

  const code = params.get('code') ?? '결제 실패'
  const message = params.get('message') ?? '카드 인증이 정상적으로 완료되지 않았습니다.'

  return (
    <div className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-xl font-semibold text-red-600">결제 처리 실패</h1>
      <p className="mt-3 text-sm font-medium text-gray-800">{code}</p>
      <p className="mt-2 text-sm text-gray-600">{message}</p>
      <div className="mt-6 flex gap-3 justify-center">
        <button
          onClick={() => router.push('/owner/subscription')}
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

export default function BillingFailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </div>
        </div>
      }
    >
      <BillingFailContent />
    </Suspense>
  )
}
