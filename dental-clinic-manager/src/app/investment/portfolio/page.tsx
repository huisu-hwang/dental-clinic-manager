'use client'

import { Briefcase } from 'lucide-react'

export default function PortfolioPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-at-text">포트폴리오</h1>
        <p className="text-sm text-at-text-secondary mt-1">보유 포지션과 투자 성과를 분석하세요</p>
      </div>

      <div className="bg-at-surface rounded-2xl shadow-at-card p-8">
        <div className="flex flex-col items-center justify-center py-8 text-at-text-weak">
          <Briefcase className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm font-medium">보유 포지션이 없습니다</p>
          <p className="text-xs mt-1">매매가 체결되면 포트폴리오가 자동으로 업데이트됩니다</p>
        </div>
      </div>
    </div>
  )
}
