'use client'

import { useState, useMemo } from 'react'
import { BarChart3, Gift, Star, ChevronDown, ChevronUp, X } from 'lucide-react'
import type { Stats, ConsultLog, GiftLog, GiftInventory, GiftCategory, DailyReport } from '@/types'

interface StatsContainerProps {
  stats: Stats
  consultLogs?: ConsultLog[]
  giftLogs?: GiftLog[]
  giftInventory?: GiftInventory[]
  giftCategories?: GiftCategory[]
  dailyReports?: DailyReport[]
  startDate?: Date
  endDate?: Date
}

type ModalItem =
  | { kind: 'consult'; data: ConsultLog[] }
  | { kind: 'gift'; data: GiftLog[] }
  | { kind: 'recall'; data: Array<{ date: string; names: string }> }

interface ModalState {
  title: string
  item: ModalItem
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

// 상담 목록 컴포넌트
const ConsultList = ({ logs }: { logs: ConsultLog[] }) => {
  if (logs.length === 0) {
    return <p className="text-center text-slate-500 py-8">상담 기록이 없습니다.</p>
  }
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-slate-50 text-left">
          <th className="px-3 py-2 font-medium text-slate-600 whitespace-nowrap">날짜</th>
          <th className="px-3 py-2 font-medium text-slate-600 whitespace-nowrap">환자명</th>
          <th className="px-3 py-2 font-medium text-slate-600">상담내용</th>
          <th className="px-3 py-2 font-medium text-slate-600 whitespace-nowrap">진행</th>
          <th className="px-3 py-2 font-medium text-slate-600">비고</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((log, idx) => (
          <tr key={log.id ?? idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
            <td className="px-3 py-2 whitespace-nowrap text-slate-600">{log.date}</td>
            <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800">{log.patient_name}</td>
            <td className="px-3 py-2 text-slate-700">{log.consult_content}</td>
            <td className="px-3 py-2 whitespace-nowrap">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${log.consult_status === 'O' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                {log.consult_status}
              </span>
            </td>
            <td className="px-3 py-2 text-slate-500">{log.remarks}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// 선물 목록 컴포넌트
const GiftList = ({ logs }: { logs: GiftLog[] }) => {
  if (logs.length === 0) {
    return <p className="text-center text-slate-500 py-8">선물 기록이 없습니다.</p>
  }
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-slate-50 text-left">
          <th className="px-3 py-2 font-medium text-slate-600 whitespace-nowrap">날짜</th>
          <th className="px-3 py-2 font-medium text-slate-600 whitespace-nowrap">환자명</th>
          <th className="px-3 py-2 font-medium text-slate-600 whitespace-nowrap">선물종류</th>
          <th className="px-3 py-2 font-medium text-slate-600 whitespace-nowrap">수량</th>
          <th className="px-3 py-2 font-medium text-slate-600 whitespace-nowrap">리뷰</th>
          <th className="px-3 py-2 font-medium text-slate-600">비고</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((log, idx) => (
          <tr key={log.id ?? idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
            <td className="px-3 py-2 whitespace-nowrap text-slate-600">{log.date}</td>
            <td className="px-3 py-2 whitespace-nowrap font-medium text-slate-800">{log.patient_name}</td>
            <td className="px-3 py-2 whitespace-nowrap text-slate-700">{log.gift_type}</td>
            <td className="px-3 py-2 whitespace-nowrap text-slate-700">{log.quantity}</td>
            <td className="px-3 py-2 whitespace-nowrap">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${log.naver_review === 'O' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                {log.naver_review}
              </span>
            </td>
            <td className="px-3 py-2 text-slate-500">{log.notes}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// 리콜 예약 목록 컴포넌트
const RecallList = ({ data }: { data: Array<{ date: string; names: string }> }) => {
  if (data.length === 0) {
    return <p className="text-center text-slate-500 py-8">리콜 예약 기록이 없습니다.</p>
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-slate-50 text-left">
          <th className="px-3 py-2 font-medium text-slate-600 whitespace-nowrap">날짜</th>
          <th className="px-3 py-2 font-medium text-slate-600">예약 환자</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row, idx) => (
          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
            <td className="px-3 py-2 whitespace-nowrap text-slate-600">{row.date}</td>
            <td className="px-3 py-2 text-slate-800">{row.names}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// 상세 모달 컴포넌트
const DetailModal = ({ modal, onClose }: { modal: ModalState; onClose: () => void }) => {
  const count = modal.item.data.length
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">{modal.title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 바디 */}
        <div className="flex-1 overflow-auto px-2 py-2">
          {modal.item.kind === 'consult' ? (
            <ConsultList logs={modal.item.data} />
          ) : modal.item.kind === 'recall' ? (
            <RecallList data={modal.item.data} />
          ) : (
            <GiftList logs={modal.item.data} />
          )}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t border-slate-200 text-right">
          <span className="text-sm text-slate-500">총 {count}건</span>
        </div>
      </div>
    </div>
  )
}

// 카테고리별 선물 카드 컴포넌트 (리뷰 통계 카드와 동일한 UI)
const CategoryGiftCard = ({
  categoryName,
  data,
  isExpanded,
  onToggle,
  onShowList
}: {
  categoryName: string
  data: { gifts: Record<string, number>; total: number; color: string }
  isExpanded: boolean
  onToggle: () => void
  onShowList: () => void
}) => {
  const giftEntries = Object.entries(data.gifts)
  const hasMultipleGifts = giftEntries.length > 1

  return (
    <div
      className="rounded-lg p-4 border cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all"
      style={{ backgroundColor: `${data.color}15`, borderColor: `${data.color}60` }}
      onClick={onShowList}
    >
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium uppercase tracking-wider" style={{ color: data.color }}>
          {categoryName}
        </div>
        <span className="text-xs font-medium" style={{ color: data.color }}>상세 →</span>
      </div>
      <div className="text-2xl font-bold mt-1" style={{ color: data.color }}>{data.total}<span className="text-sm font-medium ml-0.5" style={{ color: data.color }}>개</span></div>
      <div className="flex items-center justify-between mt-1">
        <div />
        {hasMultipleGifts && (
          <button
            onClick={e => { e.stopPropagation(); onToggle() }}
            className="p-0.5 rounded hover:bg-slate-100 transition-colors"
            aria-label={isExpanded ? '접기' : '펼치기'}
          >
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>
        )}
      </div>

      {/* 단일 선물인 경우 선물명 표시 */}
      {!hasMultipleGifts && giftEntries.length === 1 && (
        <div className="mt-1 text-xs text-slate-500">{giftEntries[0][0]}</div>
      )}

      {/* 확장된 선물 상세 목록 */}
      {isExpanded && hasMultipleGifts && (
        <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5">
          {giftEntries.map(([giftName, count]) => (
            <div key={giftName} className="flex justify-between items-center text-xs">
              <span className="text-slate-600">{giftName}</span>
              <span className="font-medium text-slate-700">{count}개</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function StatsContainer({
  stats,
  consultLogs,
  giftLogs,
  giftInventory,
  giftCategories,
  dailyReports,
  startDate,
  endDate
}: StatsContainerProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<ModalState | null>(null)

  const toggleCategory = (categoryName: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryName)) { next.delete(categoryName) } else { next.add(categoryName) }
      return next
    })
  }

  // 선물 이름 -> 카테고리 ID 맵
  const giftToCategoryMap = useMemo(() => {
    const map = new Map<string, number | null>()
    giftInventory?.forEach(item => { map.set(item.name, item.category_id ?? null) })
    return map
  }, [giftInventory])

  // 구환 관련 카테고리 ID 집합
  const returningPatientCategoryIds = useMemo(() => {
    const ids = new Set<number>()
    giftCategories?.forEach(cat => {
      if (['구환', '치료 완료', '기존환자'].some(kw => cat.name.includes(kw))) {
        ids.add(cat.id)
      }
    })
    return ids
  }, [giftCategories])

  // 카테고리 이름 -> ID 맵
  const categoryNameToId = useMemo(() => {
    const map = new Map<string, number>()
    giftCategories?.forEach(cat => { map.set(cat.name, cat.id) })
    return map
  }, [giftCategories])

  // 날짜 범위로 필터링된 상담 로그
  const filteredConsultLogs = useMemo(() => {
    if (!consultLogs) return []
    if (!startDate || !endDate) return consultLogs
    return consultLogs.filter(log => {
      const d = new Date(log.date + 'T00:00:00')
      return d >= startDate && d <= endDate
    })
  }, [consultLogs, startDate, endDate])

  // 날짜 범위로 필터링된 선물 로그
  const filteredGiftLogs = useMemo(() => {
    if (!giftLogs) return []
    if (!startDate || !endDate) return giftLogs
    return giftLogs.filter(log => {
      const d = new Date(log.date + 'T00:00:00')
      return d >= startDate && d <= endDate
    })
  }, [giftLogs, startDate, endDate])

  // 날짜 범위로 필터링된 일일보고서
  const filteredDailyReports = useMemo(() => {
    if (!dailyReports) return []
    if (!startDate || !endDate) return dailyReports
    return dailyReports.filter(r => {
      const d = new Date(r.date + 'T00:00:00')
      return d >= startDate && d <= endDate
    })
  }, [dailyReports, startDate, endDate])

  // 모달 열기 핸들러
  const openConsultProceedModal = () => {
    const data = filteredConsultLogs.filter(log => log.consult_status === 'O')
    setModal({ title: `상담 진행 목록 (${data.length}건)`, item: { kind: 'consult', data } })
  }

  const openRecallModal = () => {
    const data = filteredDailyReports
      .filter(r => r.recall_booking_count > 0 && r.recall_booking_names)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(r => ({ date: r.date, names: r.recall_booking_names! }))
    setModal({ title: `리콜 예약 목록 (총 ${stats.recall_booking_count}건)`, item: { kind: 'recall', data } })
  }

  const openNaverReviewModal = () => {
    const data = filteredGiftLogs.filter(g => g.naver_review === 'O')
    setModal({ title: `네이버 리뷰 목록 (${data.length}건)`, item: { kind: 'gift', data } })
  }

  const openReturningGiftModal = () => {
    const data = filteredGiftLogs.filter(g => {
      const catId = giftToCategoryMap.get(g.gift_type)
      return catId != null && returningPatientCategoryIds.has(catId)
    })
    setModal({ title: `구환 선물 목록 (${data.length}건)`, item: { kind: 'gift', data } })
  }

  const openCategoryGiftModal = (categoryName: string) => {
    const catId = categoryNameToId.get(categoryName)
    const data = filteredGiftLogs.filter(g => {
      if (catId == null) return false
      return giftToCategoryMap.get(g.gift_type) === catId
    })
    setModal({ title: `${categoryName} 목록 (${data.length}건)`, item: { kind: 'gift', data } })
  }

  const categoryEntries = Object.entries(stats.giftCountsByCategory || {})
  const totalGiftCount = Object.values(stats.giftCounts || {}).reduce((sum, count) => sum + count, 0)

  return (
    <div className="space-y-6">
      {/* 주요 업무 통계 */}
      <div>
        <SectionHeader number={1} title="주요 업무 통계" icon={BarChart3} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 상담 진행률 카드 (클릭 → 진행된 상담 목록) */}
          <div
            className="bg-blue-50 rounded-lg p-4 border border-blue-200 cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all"
            onClick={openConsultProceedModal}
          >
            <div className="flex items-start justify-between">
              <div className="text-xs font-medium text-blue-600 uppercase tracking-wider">상담 진행률</div>
              <span className="text-xs text-blue-400 font-medium">상세 →</span>
            </div>
            <div className="text-2xl font-bold text-blue-700 mt-1">{stats.consultProceedRate || 0}%</div>
            <div className="text-xs text-slate-500 mt-1">({stats.consult_proceed} / {stats.totalConsults})</div>
          </div>
          {/* 리콜 예약률 카드 (클릭 → 리콜 예약 환자 목록) */}
          <div
            className="bg-purple-50 rounded-lg p-4 border border-purple-200 cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all"
            onClick={openRecallModal}
          >
            <div className="flex items-start justify-between">
              <div className="text-xs font-medium text-purple-600 uppercase tracking-wider">리콜 예약률</div>
              <span className="text-xs text-purple-400 font-medium">상세 →</span>
            </div>
            <div className="text-2xl font-bold text-purple-700 mt-1">{stats.recallSuccessRate || 0}%</div>
            <div className="text-xs text-slate-500 mt-1">({stats.recall_booking_count} / {stats.recall_count})</div>
          </div>
          {/* 총 선물 카드 */}
          <div className="bg-teal-50 rounded-lg p-4 border border-teal-200">
            <div className="text-xs font-medium text-teal-600 uppercase tracking-wider">총 선물</div>
            <div className="text-2xl font-bold text-teal-700 mt-1">{totalGiftCount}<span className="text-sm font-medium ml-0.5">개</span></div>
          </div>
        </div>
      </div>

      {/* 리뷰 통계 */}
      <div>
        <SectionHeader number={2} title="리뷰 통계" icon={Star} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 네이버 리뷰 카드 */}
          <div
            className="bg-green-50 rounded-lg p-4 border border-green-200 cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all relative"
            onClick={openNaverReviewModal}
          >
            <div className="flex items-start justify-between">
              <div className="text-xs font-medium text-green-600 uppercase tracking-wider">네이버 리뷰</div>
              <span className="text-xs text-green-400 font-medium">상세 →</span>
            </div>
            <div className="text-2xl font-bold text-green-700 mt-1">{stats.naver_review_count || 0}<span className="text-sm font-medium ml-0.5">건</span></div>
          </div>
          {/* 구환 선물 카드 */}
          <div
            className="bg-indigo-50 rounded-lg p-4 border border-indigo-200 cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all relative"
            onClick={openReturningGiftModal}
          >
            <div className="flex items-start justify-between">
              <div className="text-xs font-medium text-indigo-600 uppercase tracking-wider">구환 선물</div>
              <span className="text-xs text-indigo-400 font-medium">상세 →</span>
            </div>
            <div className="text-2xl font-bold text-indigo-700 mt-1">{stats.returningPatientGiftCount || 0}<span className="text-sm font-medium ml-0.5">개</span></div>
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
                onShowList={() => openCategoryGiftModal(categoryName)}
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

      {/* 상세 모달 */}
      {modal && <DetailModal modal={modal} onClose={() => setModal(null)} />}
    </div>
  )
}
