'use client'

import { ArrowLeft, Edit3 } from 'lucide-react'
import Link from 'next/link'

export default function EditStrategyPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard?tab=investment" className="p-2 rounded-lg hover:bg-at-surface-alt transition-colors">
          <ArrowLeft className="w-5 h-5 text-at-text-secondary" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-at-text">전략 수정</h1>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-at-border p-8">
        <div className="flex flex-col items-center justify-center py-8 text-at-text-weak">
          <Edit3 className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm font-medium">전략 편집 기능은 다음 업데이트에서 제공됩니다</p>
          <p className="text-xs mt-1">현재는 전략을 삭제하고 새로 만들어주세요</p>
        </div>
      </div>
    </div>
  )
}
