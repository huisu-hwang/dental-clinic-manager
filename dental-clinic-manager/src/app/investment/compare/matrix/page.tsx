'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// 별도 페이지로 마운트되면 dashboard 레이아웃(사이드바·헤더)이 사라져 어색하므로
// dashboard 통합 sub 라우트(/dashboard?tab=investment&sub=matrix)로 영구 리다이렉트.
// 매트릭스 UI 본체는 src/components/Investment/Matrix/MatrixContent.tsx 에서 렌더되며
// InvestmentTab.tsx 의 'matrix' subTab 분기(dynamic import)로 진입한다.
export default function RedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard?tab=investment&sub=matrix')
  }, [router])
  return null
}
