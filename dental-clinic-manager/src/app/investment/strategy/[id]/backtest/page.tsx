'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// 백테스트는 전략 관리 페이지 내 인라인으로 표시됩니다.
// 이 URL로 직접 접근 시 전략 목록으로 이동합니다.
export default function BacktestRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/investment/strategy')
  }, [router])

  return null
}
