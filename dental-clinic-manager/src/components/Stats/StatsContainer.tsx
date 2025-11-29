'use client'

import { BarChart3, Gift } from 'lucide-react'
import StatCard from '@/components/ui/StatCard'
import type { Stats } from '@/types'

interface StatsContainerProps {
  stats: Stats
}

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
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* 블루 그라데이션 헤더 */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">통계</h2>
            <p className="text-blue-100 text-sm">Statistics Overview</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* 주요 업무 통계 */}
        <div>
          <SectionHeader number={1} title="주요 업무 통계" icon={BarChart3} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="네이버 리뷰 수" value={stats.naver_review_count || 0} unit="건" />
            <StatCard title="총 상담" value={stats.totalConsults || 0} unit="건" />
            <StatCard title="상담 진행률" value={stats.consultProceedRate || 0} unit="%" />
            <StatCard title="리콜 예약률" value={stats.recallSuccessRate || 0} unit="%" />
          </div>
        </div>

        {/* 선물 증정 통계 */}
        <div>
          <SectionHeader number={2} title="선물 증정 통계" icon={Gift} />
          {Object.keys(stats.giftCounts).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(stats.giftCounts).map(([gift, count]) => (
                <StatCard key={gift} title={gift} value={count} unit="개" />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg">
              해당 기간에 선물 증정 기록이 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
