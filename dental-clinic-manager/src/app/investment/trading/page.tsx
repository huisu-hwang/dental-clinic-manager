'use client'

import { Activity } from 'lucide-react'

export default function TradingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-at-text">자동매매 현황</h1>
        <p className="text-sm text-at-text-secondary mt-1">실시간 매매 상태와 신호를 모니터링하세요</p>
      </div>

      <div className="bg-at-surface rounded-2xl shadow-at-card p-8">
        <div className="flex flex-col items-center justify-center py-8 text-at-text-weak">
          <Activity className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm font-medium">활성화된 자동매매가 없습니다</p>
          <p className="text-xs mt-1">전략을 활성화하면 실시간 매매 현황이 표시됩니다</p>
        </div>
      </div>
    </div>
  )
}
