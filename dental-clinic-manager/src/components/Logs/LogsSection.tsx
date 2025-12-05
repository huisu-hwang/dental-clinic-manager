'use client'

import { useState } from 'react'
import { FileText, MessageSquare, Gift, Package, ArrowRight, Check, Search, X } from 'lucide-react'
import type { DailyReport, ConsultLog, GiftLog, InventoryLog } from '@/types'
import SpecialNotesHistory from './SpecialNotesHistory'

interface LogsSectionProps {
  dailyReports: DailyReport[]
  consultLogs: ConsultLog[]
  giftLogs: GiftLog[]
  inventoryLogs: InventoryLog[]
  onDeleteReport: (date: string) => void
  onRecalculateStats?: (date: string) => void
  onUpdateConsultStatus?: (consultId: number) => Promise<{ success?: boolean; error?: string }>
  canDelete: boolean
}

const SectionHeader = ({ number, title, icon: Icon }: { number: number; title: string; icon: React.ElementType }) => (
  <div className="flex items-center space-x-2 sm:space-x-3 pb-2 sm:pb-3 mb-3 sm:mb-4 border-b border-slate-200">
    <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 text-blue-600">
      <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
    </div>
    <h3 className="text-sm sm:text-base font-semibold text-slate-800">
      <span className="text-blue-600 mr-1">{number}.</span>
      {title}
    </h3>
  </div>
)

export default function LogsSection({
  dailyReports,
  consultLogs,
  giftLogs,
  inventoryLogs,
  onDeleteReport,
  onRecalculateStats,
  onUpdateConsultStatus,
  canDelete
}: LogsSectionProps) {
  const [consultFilter, setConsultFilter] = useState<'all' | 'completed' | 'incomplete'>('all')
  const [consultSearch, setConsultSearch] = useState('')  // 환자명 검색
  const [giftSort, setGiftSort] = useState<'default' | 'type' | 'date'>('default')
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState<Set<number>>(new Set())

  const handleUpdateStatus = async (consultId: number) => {
    if (!onUpdateConsultStatus || updatingId !== null) return

    setUpdatingId(consultId)
    try {
      const result = await onUpdateConsultStatus(consultId)
      if (result.success) {
        setRecentlyUpdatedIds(prev => new Set(prev).add(consultId))
        // 5초 후 체크 아이콘 제거
        setTimeout(() => {
          setRecentlyUpdatedIds(prev => {
            const newSet = new Set(prev)
            newSet.delete(consultId)
            return newSet
          })
        }, 5000)
      } else if (result.error) {
        alert(result.error)
      }
    } catch (error) {
      alert('상태 변경 중 오류가 발생했습니다.')
    } finally {
      setUpdatingId(null)
    }
  }

  const filteredConsultLogs = consultLogs.filter(log => {
    // 환자명 검색 필터
    const searchTerm = consultSearch.trim().toLowerCase()
    if (searchTerm && !log.patient_name.toLowerCase().includes(searchTerm)) {
      return false
    }
    // 진행 상태 필터
    if (consultFilter === 'all') return true
    if (consultFilter === 'completed') return log.consult_status === 'O'
    if (consultFilter === 'incomplete') return log.consult_status === 'X'
    return true
  })

  const sortedGiftLogs = [...giftLogs].sort((a, b) => {
    if (giftSort === 'type') {
      return a.gift_type.localeCompare(b.gift_type)
    }
    if (giftSort === 'date') {
      return b.date.localeCompare(a.date)
    }
    return 0
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* 블루 그라데이션 헤더 */}
      <div className="sticky top-14 z-10 bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">상세 기록</h2>
            <p className="text-blue-100 text-xs sm:text-sm hidden sm:block">Detailed Logs</p>
          </div>
        </div>
      </div>

      {/* 콘텐츠 영역 */}
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* 일일 보고 종합 기록 */}
        <div>
          <SectionHeader number={1} title="일일 보고 종합 기록" icon={FileText} />
          <div className="border border-slate-200 rounded-lg overflow-hidden overflow-x-auto">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-xs sm:text-sm text-left min-w-[600px]">
                <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10">
                  <tr>
                    <th className="p-2 sm:p-3 font-medium">날짜</th>
                    <th className="p-2 sm:p-3 font-medium">네이버 리뷰 수</th>
                    <th className="p-2 sm:p-3 font-medium">상담 진행</th>
                    <th className="p-2 sm:p-3 font-medium">상담 보류</th>
                    <th className="p-2 sm:p-3 font-medium">리콜 수</th>
                    <th className="p-2 sm:p-3 font-medium">예약 수</th>
                    <th className="p-2 sm:p-3 font-medium">사용</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyReports.map(report => (
                    <tr key={report.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-2 sm:p-3">{report.date}</td>
                      <td className="p-2 sm:p-3">{report.naver_review_count}</td>
                      <td className="p-2 sm:p-3">{report.consult_proceed}</td>
                      <td className="p-2 sm:p-3">{report.consult_hold}</td>
                      <td className="p-2 sm:p-3">{report.recall_count}</td>
                      <td className="p-2 sm:p-3">{report.recall_booking_count}</td>
                      <td className="p-2 sm:p-3">
                        <div className="flex gap-1">
                          {onRecalculateStats && (
                            <button
                              onClick={() => onRecalculateStats(report.date)}
                              className="text-blue-500 hover:text-blue-700 text-xs px-1.5 sm:px-2 py-1 border border-blue-200 rounded hover:bg-blue-50"
                              title="상담 통계 재계산"
                            >
                              재계산
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => {
                                if (confirm(`${report.date}의 모든 기록을 삭제하시겠습니까? 재고는 복구되지 않습니다.`)) {
                                  onDeleteReport(report.date)
                                }
                              }}
                              className="text-red-500 hover:text-red-700 text-xs px-1.5 sm:px-2 py-1 border border-red-200 rounded hover:bg-red-50"
                              title="전체 기록 삭제"
                            >
                              삭제
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 상담 상세 기록 */}
        <div>
          <div className="flex flex-col gap-2 sm:gap-3 pb-2 sm:pb-3 mb-3 sm:mb-4 border-b border-slate-200">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 text-blue-600">
                  <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-slate-800">
                  <span className="text-blue-600 mr-1">2.</span>
                  상담 상세 기록
                </h3>
              </div>
              <div className="flex gap-1 sm:gap-2 flex-wrap">
                <button
                  onClick={() => setConsultFilter('all')}
                  className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md transition-colors ${
                    consultFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  전체 ({consultLogs.length})
                </button>
                <button
                  onClick={() => setConsultFilter('completed')}
                  className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md transition-colors ${
                    consultFilter === 'completed'
                      ? 'bg-green-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  진행완료 ({consultLogs.filter(log => log.consult_status === 'O').length})
                </button>
                <button
                  onClick={() => setConsultFilter('incomplete')}
                  className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md transition-colors ${
                    consultFilter === 'incomplete'
                      ? 'bg-orange-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  진행보류 ({consultLogs.filter(log => log.consult_status === 'X').length})
                </button>
              </div>
            </div>
            {/* 환자명 검색 */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="환자명 검색..."
                  value={consultSearch}
                  onChange={(e) => setConsultSearch(e.target.value)}
                  className="w-full pl-8 sm:pl-9 pr-8 py-1.5 sm:py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
                {consultSearch && (
                  <button
                    onClick={() => setConsultSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                    title="검색어 지우기"
                  >
                    <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                )}
              </div>
              {consultSearch && (
                <span className="text-xs sm:text-sm text-slate-500">
                  {filteredConsultLogs.length}건 검색됨
                </span>
              )}
            </div>
          </div>
          <div className="border border-slate-200 rounded-lg overflow-hidden overflow-x-auto">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-xs sm:text-sm text-left min-w-[700px]">
                <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10">
                  <tr>
                    <th className="p-2 sm:p-3 font-medium whitespace-nowrap">날짜</th>
                    <th className="p-2 sm:p-3 font-medium">환자명</th>
                    <th className="p-2 sm:p-3 font-medium">상담내용</th>
                    <th className="p-2 sm:p-3 font-medium whitespace-nowrap">진행여부</th>
                    <th className="p-2 sm:p-3 font-medium">참고사항</th>
                    {onUpdateConsultStatus && <th className="p-2 sm:p-3 font-medium text-center whitespace-nowrap">상태변경</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredConsultLogs.map(log => (
                    <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-2 sm:p-3 whitespace-nowrap">{log.date}</td>
                      <td className="p-2 sm:p-3">{log.patient_name}</td>
                      <td className="p-2 sm:p-3">{log.consult_content}</td>
                      <td className="p-2 sm:p-3 whitespace-nowrap">
                        <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-xs font-medium ${
                          log.consult_status === 'O' || recentlyUpdatedIds.has(log.id!)
                            ? 'bg-green-100 text-green-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {log.consult_status === 'O' || recentlyUpdatedIds.has(log.id!) ? '진행완료' : '진행보류'}
                        </span>
                      </td>
                      <td className="p-2 sm:p-3">{log.remarks}</td>
                      {onUpdateConsultStatus && (
                        <td className="p-2 sm:p-3 text-center">
                          {log.consult_status === 'X' && !recentlyUpdatedIds.has(log.id!) ? (
                            <button
                              onClick={() => log.id && handleUpdateStatus(log.id)}
                              disabled={updatingId !== null}
                              className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 text-xs font-medium rounded transition-colors
                                ${updatingId === log.id
                                  ? 'bg-gray-100 text-gray-400 cursor-wait'
                                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                                }`}
                              title="진행으로 변경"
                            >
                              {updatingId === log.id ? (
                                <>
                                  <span className="animate-spin w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full"></span>
                                  <span className="hidden sm:inline">변경중...</span>
                                </>
                              ) : (
                                <>
                                  <ArrowRight className="w-3 h-3" />
                                  <span className="hidden sm:inline">진행으로 변경</span>
                                </>
                              )}
                            </button>
                          ) : recentlyUpdatedIds.has(log.id!) ? (
                            <span className="inline-flex items-center gap-1 text-green-600 text-xs">
                              <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              <span className="hidden sm:inline">변경완료</span>
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 선물 증정 및 리뷰 상세 기록 */}
        <div>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0 pb-2 sm:pb-3 mb-3 sm:mb-4 border-b border-slate-200">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 text-blue-600">
                <Gift className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <h3 className="text-sm sm:text-base font-semibold text-slate-800">
                <span className="text-blue-600 mr-1">3.</span>
                선물 증정 및 리뷰 상세 기록
              </h3>
            </div>
            <div className="flex gap-1 sm:gap-2 flex-wrap">
              <button
                onClick={() => setGiftSort('default')}
                className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md transition-colors ${
                  giftSort === 'default'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                기본순
              </button>
              <button
                onClick={() => setGiftSort('type')}
                className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md transition-colors ${
                  giftSort === 'type'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                선물종류순
              </button>
              <button
                onClick={() => setGiftSort('date')}
                className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md transition-colors ${
                  giftSort === 'date'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                최신순
              </button>
            </div>
          </div>
          <div className="border border-slate-200 rounded-lg overflow-hidden overflow-x-auto">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-xs sm:text-sm text-left min-w-[500px]">
                <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10">
                  <tr>
                    <th className="p-2 sm:p-3 font-medium whitespace-nowrap">날짜</th>
                    <th className="p-2 sm:p-3 font-medium">환자명</th>
                    <th className="p-2 sm:p-3 font-medium whitespace-nowrap">선물 종류</th>
                    <th className="p-2 sm:p-3 font-medium whitespace-nowrap">수량</th>
                    <th className="p-2 sm:p-3 font-medium whitespace-nowrap">네이버 리뷰</th>
                    <th className="p-2 sm:p-3 font-medium">비고</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedGiftLogs.map(log => (
                    <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-2 sm:p-3 whitespace-nowrap">{log.date}</td>
                      <td className="p-2 sm:p-3">{log.patient_name}</td>
                      <td className="p-2 sm:p-3 whitespace-nowrap">{log.gift_type}</td>
                      <td className="p-2 sm:p-3 text-center whitespace-nowrap">1개</td>
                      <td className="p-2 sm:p-3 whitespace-nowrap">{log.naver_review}</td>
                      <td className="p-2 sm:p-3">{log.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 선물 재고 입출고 기록 */}
        <div>
          <SectionHeader number={4} title="선물 재고 입출고 기록" icon={Package} />
          <div className="border border-slate-200 rounded-lg overflow-hidden overflow-x-auto">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-xs sm:text-sm text-left min-w-[500px]">
                <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10">
                  <tr>
                    <th className="p-2 sm:p-3 font-medium">일시</th>
                    <th className="p-2 sm:p-3 font-medium">선물명</th>
                    <th className="p-2 sm:p-3 font-medium">내용</th>
                    <th className="p-2 sm:p-3 font-medium">수량 변경</th>
                    <th className="p-2 sm:p-3 font-medium">최종 재고</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryLogs.map(log => (
                    <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-2 sm:p-3">
                        {new Date(log.timestamp).toLocaleString('ko-KR')}
                      </td>
                      <td className="p-2 sm:p-3">{log.name}</td>
                      <td className="p-2 sm:p-3">{log.reason}</td>
                      <td className="p-2 sm:p-3 font-mono text-center">
                        <span className={log.change > 0 ? 'text-green-600' : 'text-red-600'}>
                          {log.change > 0 ? `+${log.change}` : log.change}
                        </span>
                      </td>
                      <td className="p-2 sm:p-3 font-mono text-center">{log.new_stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 기타 특이사항 기록 */}
        <div>
          <SectionHeader number={5} title="기타 특이사항 기록" icon={FileText} />
          <SpecialNotesHistory />
        </div>
      </div>
    </div>
  )
}
