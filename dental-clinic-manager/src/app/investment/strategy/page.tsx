'use client'

import { Target } from 'lucide-react'
import Link from 'next/link'

export default function StrategyListPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-at-text">전략 관리</h1>
          <p className="text-sm text-at-text-secondary mt-1">매매 전략을 생성하고 백테스트하세요</p>
        </div>
        <Link
          href="/investment/strategy/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-at-accent text-white rounded-xl text-sm font-medium hover:bg-at-accent-hover transition-colors"
        >
          새 전략 만들기
        </Link>
      </div>

      <div className="bg-at-surface rounded-2xl shadow-at-card p-8">
        <div className="flex flex-col items-center justify-center py-8 text-at-text-weak">
          <Target className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm font-medium">아직 생성된 전략이 없습니다</p>
          <p className="text-xs mt-1">새 전략을 만들어 백테스트해보세요</p>
        </div>
      </div>
    </div>
  )
}
