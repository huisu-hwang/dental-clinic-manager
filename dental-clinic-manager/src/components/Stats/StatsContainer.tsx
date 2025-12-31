'use client'

import { useState } from 'react'
import { BarChart3, Gift, Star, ChevronDown, ChevronUp } from 'lucide-react'
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

// 카테고리별 선물 카드 컴포넌트
const CategoryGiftCard = ({
  categoryName,
  data,
  isExpanded,
  onToggle
}: {
  categoryName: string
  data: { gifts: Record<string, number>; total: number; color: string }
  isExpanded: boolean
  onToggle: () => void
}) => {
  const giftEntries = Object.entries(data.gifts)
  const hasMultipleGifts = giftEntries.length > 1

  return (
    <div
      className="rounded-lg p-4 border-2 transition-all"
      style={{
        borderColor: data.color,
        backgroundColor: `${data.color}10`
      }}
    >
      <div
        className={`flex items-center justify-between ${hasMultipleGifts ? 'cursor-pointer' : ''}`}
        onClick={hasMultipleGifts ? onToggle : undefined}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: data.color }}
          />
          <span className="text-sm font-medium text-slate-700">{categoryName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold" style={{ color: data.color }}>
            {data.total}
          </span>
          <span className="text-xs text-slate-500">개</span>
          {hasMultipleGifts && (
            isExpanded ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )
          )}
        </div>
      </div>

      {/* 확장된 선물 상세 목록 */}
      {isExpanded && hasMultipleGifts && (
        <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
          {giftEntries.map(([giftName, count]) => (
            <div key={giftName} className="flex justify-between items-center text-sm">
              <span className="text-slate-600">{giftName}</span>
              <span className="font-medium text-slate-700">{count}개</span>
            </div>
          ))}
        </div>
      )}

      {/* 단일 선물인 경우 선물명 표시 */}
      {!hasMultipleGifts && giftEntries.length === 1 && (
        <div className="mt-1 text-xs text-slate-500">{giftEntries[0][0]}</div>
      )}
    </div>
  )
}

export default function StatsContainer({ stats }: StatsContainerProps) {
  console.log('Stats received:', stats)

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryName)) {
        next.delete(categoryName)
      } else {
        next.add(categoryName)
      }
      return next
    })
  }

  const categoryEntries = Object.entries(stats.giftCountsByCategory || {})
  const totalGiftCount = Object.values(stats.giftCounts || {}).reduce((sum, count) => sum + count, 0)

  return (
    <div className="space-y-6">
      {/* 주요 업무 통계 */}
      <div>
        <SectionHeader number={1} title="주요 업무 통계" icon={BarChart3} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
          <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
            <div className="text-xs font-medium text-teal-600 uppercase tracking-wider">총 선물</div>
            <div className="text-2xl font-bold text-teal-700 mt-1">{totalGiftCount}</div>
            <div className="text-xs text-slate-500 mt-1">개</div>
          </div>
        </div>
      </div>

      {/* 리뷰 통계 */}
      <div>
        <SectionHeader number={2} title="리뷰 통계" icon={Star} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="text-xs font-medium text-green-600 uppercase tracking-wider">네이버 리뷰</div>
            <div className="text-2xl font-bold text-green-700 mt-1">{stats.naver_review_count || 0}</div>
            <div className="text-xs text-slate-500 mt-1">건</div>
          </div>
          <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
            <div className="text-xs font-medium text-indigo-600 uppercase tracking-wider">구환 선물</div>
            <div className="text-2xl font-bold text-indigo-700 mt-1">{stats.returningPatientGiftCount || 0}</div>
            <div className="text-xs text-slate-500 mt-1">개</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
            <div className="text-xs font-medium text-amber-600 uppercase tracking-wider">리뷰/구환선물 비율</div>
            <div className="text-2xl font-bold text-amber-700 mt-1">{stats.reviewToReturningGiftRate || 0}%</div>
            <div className="text-xs text-slate-500 mt-1">
              {stats.returningPatientGiftCount > 0
                ? `${stats.naver_review_count} / ${stats.returningPatientGiftCount}`
                : '구환 선물 없음'}
            </div>
          </div>
        </div>
      </div>

      {/* 카테고리별 선물 증정 통계 */}
      <div>
        <SectionHeader number={3} title="카테고리별 선물 통계" icon={Gift} />
        {categoryEntries.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categoryEntries.map(([categoryName, data]) => (
              <CategoryGiftCard
                key={categoryName}
                categoryName={categoryName}
                data={data}
                isExpanded={expandedCategories.has(categoryName)}
                onToggle={() => toggleCategory(categoryName)}
              />
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
