import { Suspense } from 'react'
import MatrixContent from '@/components/Investment/Matrix/MatrixContent'

export const dynamic = 'force-dynamic'

export default function MatrixPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-500">로딩 중...</div>}>
      <MatrixContent />
    </Suspense>
  )
}
