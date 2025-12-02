'use client'

import { BarChart3, Gift } from 'lucide-react'
import type { Stats } from '@/types'

interface StatsContainerProps {
  stats: Stats
}

// 섹션 헤더 컴포넌트
const SectionHeader = ({ number, title, icon: Icon }: { number: number; title: string; icon: React.ElementType }) => (
  <div className="flex items-center space-x-3 pb-3 mb-4 border-b border-slate-200">
    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600">
      <Icon className="w-4 h-4" />
    </div>
    <h3 className="text-base font-semibold text-slate-800">
      <span className="text-blue-600 mr-1">{number}.</span>
      {title}
    </h3>
  </div>
)

export default function StatsContainer({ stats }: StatsContainerProps) {
  console.log('Stats received:', stats)

  return (
    <div className="space-y-6">
      {/* 주요 업무 통계 */}
      <div>
        <SectionHeader number={1} title="주요 업무 통계" icon={BarChart3} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="text-xs font-medium text-green-600 uppercase tracking-wider">네이버 리뷰</div>
            <div className="text-2xl font-bold text-green-700 mt-1">{stats.naver_review_count || 0}</div>
            <div className="text-xs text-slate-500 mt-1">건</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="text-xs font-medium text-blue-600 uppercase tracking-wider">총 상담</div>
            <div className="text-2xl font-bold text-blue-700 mt-1">{stats.totalConsults || 0}</div>
            <div className="text-xs text-slate-500 mt-1">건</div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <div className="text-xs font-medium text-yellow-600 uppercase tracking-wider">상담 진행률</div>
            <div className="text-2xl font-bold text-yellow-700 mt-1">{stats.consultProceedRate || 0}%</div>
            <div className="text-xs text-slate-500 mt-1">진행/전체</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <div className="text-xs font-medium text-purple-600 uppercase tracking-wider">리콜 예약률</div>
            <div className="text-2xl font-bold text-purple-700 mt-1">{stats.recallSuccessRate || 0}%</div>
            <div className="text-xs text-slate-500 mt-1">예약/리콜</div>
          </div>
        </div>
      </div>

      {/* 선물 증정 통계 */}
      <div>
        <SectionHeader number={2} title="선물 증정 통계" icon={Gift} />
        {Object.keys(stats.giftCounts).length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(stats.giftCounts).map(([gift, count]) => (
              <div key={gift} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="text-xs font-medium text-slate-600 uppercase tracking-wider">{gift}</div>
                <div className="text-2xl font-bold text-slate-700 mt-1">{count}</div>
                <div className="text-xs text-slate-500 mt-1">개</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
            <Gift className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 mb-2">선택한 기간의 선물 증정 기록이 없습니다.</p>
            <p className="text-sm text-slate-500">선물 증정 기록이 있으면 자동으로 표시됩니다.</p>
          </div>
        )}
      </div>
    </div>
  )
}
