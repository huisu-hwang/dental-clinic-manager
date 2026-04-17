'use client'

import { useState, useEffect } from 'react'
import { FileText, MessageSquare, Gift, Package, ArrowRight, Check, Search, X, Banknote } from 'lucide-react'
import type { DailyReport, ConsultLog, GiftLog, InventoryLog, CashRegisterLog } from '@/types'
import SpecialNotesHistory from './SpecialNotesHistory'
import { appConfirm, appAlert } from '@/components/ui/AppDialog'

interface LogsSectionProps {
  dailyReports: DailyReport[]
  consultLogs: ConsultLog[]
  giftLogs: GiftLog[]
  inventoryLogs: InventoryLog[]
  cashRegisterLogs: CashRegisterLog[]
  onDeleteReport: (date: string) => void
  onRecalculateStats?: (date: string) => void
  onUpdateConsultStatus?: (consultId: number) => Promise<{ success?: boolean; error?: string }>
  canDelete: boolean
}

type TabKey = 'daily' | 'consult' | 'gift' | 'inventory' | 'cash' | 'notes'

const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'daily',     label: '일일 보고',   icon: FileText },
  { key: 'consult',   label: '상담 기록',   icon: MessageSquare },
  { key: 'gift',      label: '선물/리뷰',   icon: Gift },
  { key: 'inventory', label: '재고 기록',   icon: Package },
  { key: 'cash',      label: '현금 출납',   icon: Banknote },
  { key: 'notes',     label: '특이사항',    icon: FileText },
]

export default function LogsSection({
  dailyReports,
  consultLogs,
  giftLogs,
  inventoryLogs,
  cashRegisterLogs,
  onDeleteReport,
  onRecalculateStats,
  onUpdateConsultStatus,
  canDelete
}: LogsSectionProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('daily')
  const [consultFilter, setConsultFilter] = useState<'all' | 'completed' | 'incomplete'>('all')
  const [consultSearch, setConsultSearch] = useState('')
  const [giftSort, setGiftSort] = useState<'default' | 'type' | 'date'>('default')
  const [giftSearch, setGiftSearch] = useState('')
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState<Set<number>>(new Set())

  // URL 해시가 #consult-logs인 경우 상담 탭으로 전환
  useEffect(() => {
    const handleHashScroll = () => {
      if (typeof window !== 'undefined' && window.location.hash === '#consult-logs') {
        setActiveTab('consult')
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
    handleHashScroll()
    window.addEventListener('hashchange', handleHashScroll)
    return () => window.removeEventListener('hashchange', handleHashScroll)
  }, [])

  const handleUpdateStatus = async (consultId: number) => {
    if (!onUpdateConsultStatus || updatingId !== null) return
    setUpdatingId(consultId)
    try {
      const result = await onUpdateConsultStatus(consultId)
      if (result.success) {
        setRecentlyUpdatedIds(prev => new Set(prev).add(consultId))
        setTimeout(() => {
          setRecentlyUpdatedIds(prev => {
            const newSet = new Set(prev)
            newSet.delete(consultId)
            return newSet
          })
        }, 5000)
      } else if (result.error) {
        await appAlert(result.error)
      }
    } catch {
      await appAlert('상태 변경 중 오류가 발생했습니다.')
    } finally {
      setUpdatingId(null)
    }
  }

  const filteredConsultLogs = consultLogs.filter(log => {
    const searchTerm = consultSearch.trim().toLowerCase()
    if (searchTerm && !log.patient_name.toLowerCase().includes(searchTerm)) return false
    if (consultFilter === 'all') return true
    if (consultFilter === 'completed') return log.consult_status === 'O'
    if (consultFilter === 'incomplete') return log.consult_status === 'X'
    return true
  })

  const filteredGiftLogs = giftLogs.filter(log => {
    const searchTerm = giftSearch.trim().toLowerCase()
    if (searchTerm) {
      const matchesPatientName = log.patient_name.toLowerCase().includes(searchTerm)
      const matchesNotes = log.notes?.toLowerCase().includes(searchTerm) || false
      if (!matchesPatientName && !matchesNotes) return false
    }
    return true
  })

  const sortedGiftLogs = [...filteredGiftLogs].sort((a, b) => {
    if (giftSort === 'type') return a.gift_type.localeCompare(b.gift_type)
    if (giftSort === 'date') return b.date.localeCompare(a.date)
    return 0
  })

  return (
    <div className="space-y-6">
      {/* 서브탭 */}
      <div className="flex flex-wrap gap-2 pb-4 border-b border-at-border">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all ${
              activeTab === key
                ? 'bg-at-accent-light text-at-accent'
                : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
            }`}
          >
            <Icon className="w-4 h-4 mr-2" />
            {label}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}

      {/* 1. 일일 보고 종합 기록 */}
      {activeTab === 'daily' && (
        <div className="border border-at-border rounded-xl overflow-hidden overflow-x-auto">
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
            <table className="w-full text-xs sm:text-sm text-left min-w-[600px]">
              <thead className="bg-at-surface-alt text-at-text sticky top-0 z-10">
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
                  <tr key={report.id} className="border-b border-at-border hover:bg-at-surface-hover">
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
                            className="text-at-accent hover:text-at-accent text-xs px-1.5 sm:px-2 py-1 border border-at-accent rounded-lg hover:bg-at-accent-light"
                            title="상담 통계 재계산"
                          >
                            재계산
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={async () => {
                              if (await appConfirm(`${report.date}의 모든 기록을 삭제하시겠습니까? 재고는 복구되지 않습니다.`)) {
                                onDeleteReport(report.date)
                              }
                            }}
                            className="text-at-error hover:text-at-error text-xs px-1.5 sm:px-2 py-1 border border-at-border rounded-lg hover:bg-at-error-bg"
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
      )}

      {/* 2. 상담 상세 기록 */}
      {activeTab === 'consult' && (
        <div>
          <div className="flex flex-col gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0">
              <div className="flex gap-1 sm:gap-2 flex-wrap">
                <button
                  onClick={() => setConsultFilter('all')}
                  className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-xl transition-colors ${
                    consultFilter === 'all'
                      ? 'bg-at-accent text-white'
                      : 'bg-at-surface-alt text-at-text-secondary hover:bg-at-surface-hover'
                  }`}
                >
                  전체 ({consultLogs.length})
                </button>
                <button
                  onClick={() => setConsultFilter('completed')}
                  className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-xl transition-colors ${
                    consultFilter === 'completed'
                      ? 'bg-at-success text-white'
                      : 'bg-at-surface-alt text-at-text-secondary hover:bg-at-surface-hover'
                  }`}
                >
                  진행완료 ({consultLogs.filter(log => log.consult_status === 'O').length})
                </button>
                <button
                  onClick={() => setConsultFilter('incomplete')}
                  className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-xl transition-colors ${
                    consultFilter === 'incomplete'
                      ? 'bg-at-warning text-white'
                      : 'bg-at-surface-alt text-at-text-secondary hover:bg-at-surface-hover'
                  }`}
                >
                  진행보류 ({consultLogs.filter(log => log.consult_status === 'X').length})
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-at-text-weak" />
                <input
                  type="text"
                  placeholder="환자명 검색..."
                  value={consultSearch}
                  onChange={(e) => setConsultSearch(e.target.value)}
                  className="w-full pl-8 sm:pl-9 pr-8 py-1.5 sm:py-2 text-xs sm:text-sm border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors"
                />
                {consultSearch && (
                  <button
                    onClick={() => setConsultSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-at-text-weak hover:text-at-text rounded-full hover:bg-at-surface-hover"
                    title="검색어 지우기"
                  >
                    <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                )}
              </div>
              {consultSearch && (
                <span className="text-xs sm:text-sm text-at-text-weak">
                  {filteredConsultLogs.length}건 검색됨
                </span>
              )}
            </div>
          </div>
          <div className="border border-at-border rounded-xl overflow-hidden overflow-x-auto">
            <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
              <table className="w-full text-xs sm:text-sm text-left min-w-[700px]">
                <thead className="bg-at-surface-alt text-at-text sticky top-0 z-10">
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
                    <tr key={log.id} className="border-b border-at-border hover:bg-at-surface-hover">
                      <td className="p-2 sm:p-3 whitespace-nowrap">{log.date}</td>
                      <td className="p-2 sm:p-3">{log.patient_name}</td>
                      <td className="p-2 sm:p-3">{log.consult_content}</td>
                      <td className="p-2 sm:p-3 whitespace-nowrap">
                        <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-xs font-medium ${
                          log.consult_status === 'O' || recentlyUpdatedIds.has(log.id!)
                            ? 'bg-at-success-bg text-at-success'
                            : 'bg-at-warning-bg text-at-warning'
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
                                  ? 'bg-at-surface-alt text-at-text-weak cursor-wait'
                                  : 'bg-at-accent-light text-at-accent hover:bg-at-tag border border-at-border'
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
                            <span className="inline-flex items-center gap-1 text-at-success text-xs">
                              <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              <span className="hidden sm:inline">변경완료</span>
                            </span>
                          ) : (
                            <span className="text-at-text-weak text-xs">-</span>
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
      )}

      {/* 3. 선물 증정 및 리뷰 상세 기록 */}
      {activeTab === 'gift' && (
        <div>
          <div className="flex flex-col gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0">
              <div className="flex gap-1 sm:gap-2 flex-wrap">
                <button
                  onClick={() => setGiftSort('default')}
                  className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-xl transition-colors ${
                    giftSort === 'default'
                      ? 'bg-at-accent text-white'
                      : 'bg-at-surface-alt text-at-text-secondary hover:bg-at-surface-hover'
                  }`}
                >
                  기본순
                </button>
                <button
                  onClick={() => setGiftSort('type')}
                  className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-xl transition-colors ${
                    giftSort === 'type'
                      ? 'bg-purple-600 text-white'
                      : 'bg-at-surface-alt text-at-text-secondary hover:bg-at-surface-hover'
                  }`}
                >
                  선물종류순
                </button>
                <button
                  onClick={() => setGiftSort('date')}
                  className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-xl transition-colors ${
                    giftSort === 'date'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-at-surface-alt text-at-text-secondary hover:bg-at-surface-hover'
                  }`}
                >
                  최신순
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-at-text-weak" />
                <input
                  type="text"
                  placeholder="환자명/비고 검색..."
                  value={giftSearch}
                  onChange={(e) => setGiftSearch(e.target.value)}
                  className="w-full pl-8 sm:pl-9 pr-8 py-1.5 sm:py-2 text-xs sm:text-sm border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors"
                />
                {giftSearch && (
                  <button
                    onClick={() => setGiftSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-at-text-weak hover:text-at-text rounded-full hover:bg-at-surface-hover"
                    title="검색어 지우기"
                  >
                    <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                )}
              </div>
              {giftSearch && (
                <span className="text-xs sm:text-sm text-at-text-weak">
                  {filteredGiftLogs.length}건 검색됨
                </span>
              )}
            </div>
          </div>
          <div className="border border-at-border rounded-xl overflow-hidden overflow-x-auto">
            <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
              <table className="w-full text-xs sm:text-sm text-left min-w-[500px]">
                <thead className="bg-at-surface-alt text-at-text sticky top-0 z-10">
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
                    <tr key={log.id} className="border-b border-at-border hover:bg-at-surface-hover">
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
      )}

      {/* 4. 선물 재고 입출고 기록 */}
      {activeTab === 'inventory' && (
        <div className="border border-at-border rounded-xl overflow-hidden overflow-x-auto">
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
            <table className="w-full text-xs sm:text-sm text-left min-w-[500px]">
              <thead className="bg-at-surface-alt text-at-text sticky top-0 z-10">
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
                  <tr key={log.id} className="border-b border-at-border hover:bg-at-surface-hover">
                    <td className="p-2 sm:p-3">
                      {new Date(log.timestamp).toLocaleString('ko-KR')}
                    </td>
                    <td className="p-2 sm:p-3">{log.name}</td>
                    <td className="p-2 sm:p-3">{log.reason}</td>
                    <td className="p-2 sm:p-3 font-mono text-center">
                      <span className={log.change > 0 ? 'text-at-success' : 'text-at-error'}>
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
      )}

      {/* 5. 현금 출납 기록 */}
      {activeTab === 'cash' && (
        <div className="border border-at-border rounded-xl overflow-hidden overflow-x-auto">
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
            <table className="w-full text-xs sm:text-sm text-left min-w-[700px]">
              <thead className="bg-at-surface-alt text-at-text sticky top-0 z-10">
                <tr>
                  <th className="p-2 sm:p-3 font-medium whitespace-nowrap">날짜</th>
                  <th className="p-2 sm:p-3 font-medium text-right whitespace-nowrap bg-orange-50">전일 이월액</th>
                  <th className="p-2 sm:p-3 font-medium text-right whitespace-nowrap bg-at-accent-light">금일 잔액</th>
                  <th className="p-2 sm:p-3 font-medium text-right whitespace-nowrap">차액</th>
                  <th className="p-2 sm:p-3 font-medium">비고</th>
                </tr>
              </thead>
              <tbody>
                {cashRegisterLogs.map(log => {
                  const difference = log.balance_difference
                  return (
                    <tr key={log.id} className="border-b border-at-border hover:bg-at-surface-hover">
                      <td className="p-2 sm:p-3 whitespace-nowrap">{log.date}</td>
                      <td className="p-2 sm:p-3 text-right font-mono whitespace-nowrap bg-orange-50/50">
                        {new Intl.NumberFormat('ko-KR').format(log.previous_balance || 0)}원
                      </td>
                      <td className="p-2 sm:p-3 text-right font-mono whitespace-nowrap bg-at-accent-light/50">
                        {new Intl.NumberFormat('ko-KR').format(log.current_balance || 0)}원
                      </td>
                      <td className={`p-2 sm:p-3 text-right font-mono whitespace-nowrap ${
                        difference > 0 ? 'text-at-success' :
                        difference < 0 ? 'text-at-error' : 'text-at-text-secondary'
                      }`}>
                        {difference > 0 ? '+' : ''}{new Intl.NumberFormat('ko-KR').format(difference)}원
                      </td>
                      <td className="p-2 sm:p-3 max-w-[200px] truncate" title={log.notes || ''}>
                        {log.notes || '-'}
                      </td>
                    </tr>
                  )
                })}
                {cashRegisterLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-at-text-weak">
                      현금 출납 기록이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. 기타 특이사항 기록 */}
      {activeTab === 'notes' && (
        <div>
          <SpecialNotesHistory />
        </div>
      )}
    </div>
  )
}
