'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Search, X, ArrowRight, Check, Pencil, ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { applyClinicFilter } from '@/lib/clinicScope'
import type { ConsultLog } from '@/types'
import { appAlert } from '@/components/ui/AppDialog'

type ConsultPeriod = 'day' | 'week' | 'month' | 'all'
type StatusFilter = 'all' | 'completed' | 'incomplete' | 'undecided'

const STATUS_ORDER: NonNullable<ConsultLog['consult_status']>[] = ['△', 'O', 'X']

interface ConsultLogsTabProps {
  /** 대시보드가 선택한 날짜 기준 상담 (day 모드일 때 사용) */
  consultLogs: ConsultLog[]
  onUpdateConsultStatus?: (consultId: number) => Promise<{ success?: boolean; error?: string }>
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function startOfWeekMonday(base: Date, weekOffset = 0): Date {
  const d = new Date(base)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + weekOffset * 7)
  const day = d.getDay() // 0=일, 1=월, ..., 6=토
  const diff = day === 0 ? -6 : 1 - day // 월요일로 이동
  d.setDate(d.getDate() + diff)
  return d
}

function startOfMonth(base: Date, monthOffset = 0): Date {
  const d = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1)
  return d
}

function endOfMonthExclusive(base: Date, monthOffset = 0): Date {
  return new Date(base.getFullYear(), base.getMonth() + monthOffset + 1, 1)
}

function calcRange(period: ConsultPeriod, offset: number): { start: string | null; endExclusive: string | null; label: string } {
  const today = new Date()
  if (period === 'all') return { start: null, endExclusive: null, label: '전체 기간' }
  if (period === 'week') {
    const start = startOfWeekMonday(today, offset)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    const endLabel = new Date(start)
    endLabel.setDate(endLabel.getDate() + 6)
    return { start: fmtDate(start), endExclusive: fmtDate(end), label: `${fmtDate(start)} ~ ${fmtDate(endLabel)}` }
  }
  if (period === 'month') {
    const start = startOfMonth(today, offset)
    const end = endOfMonthExclusive(today, offset)
    return { start: fmtDate(start), endExclusive: fmtDate(end), label: `${start.getFullYear()}-${pad(start.getMonth() + 1)}` }
  }
  // day: 대시보드 선택일 기준 (props 데이터 사용 — 라벨만 표시)
  return { start: null, endExclusive: null, label: '선택한 날짜' }
}

export default function ConsultLogsTab({ consultLogs, onUpdateConsultStatus }: ConsultLogsTabProps) {
  const { user } = useAuth()

  const [period, setPeriod] = useState<ConsultPeriod>('day')
  const [offset, setOffset] = useState(0)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

  const [fetchedLogs, setFetchedLogs] = useState<ConsultLog[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingText, setEditingText] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)
  const [recentlyUpdatedIds, setRecentlyUpdatedIds] = useState<Set<number>>(new Set())
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null)

  const range = useMemo(() => calcRange(period, offset), [period, offset])

  // 기간 변경 시 fetch (day는 props 사용)
  const loadLogs = useCallback(async () => {
    if (period === 'day') {
      setFetchedLogs(null)
      return
    }
    if (!user?.clinic_id) return
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      let query = supabase
        .from('consult_logs')
        .select('*')
        .order('date', { ascending: false })
        .order('id', { ascending: false })
      if (range.start && range.endExclusive) {
        query = query.gte('date', range.start).lt('date', range.endExclusive)
      }
      const { data, error: fetchError } = await applyClinicFilter(query, user.clinic_id)
      if (fetchError) throw fetchError
      setFetchedLogs((data ?? []) as ConsultLog[])
    } catch (e) {
      console.error('[ConsultLogsTab] fetch error', e)
      setError(e instanceof Error ? e.message : '상담 기록을 불러오지 못했습니다.')
      setFetchedLogs([])
    } finally {
      setLoading(false)
    }
  }, [period, range.start, range.endExclusive, user?.clinic_id])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  // 기간 변경 시 offset 리셋
  const changePeriod = (next: ConsultPeriod) => {
    setPeriod(next)
    setOffset(0)
  }

  const displayLogs: ConsultLog[] = fetchedLogs ?? consultLogs

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase()
    return displayLogs.filter((log) => {
      if (q) {
        const matchPatient = (log.patient_name || '').toLowerCase().includes(q)
        const matchContent = (log.consult_content || '').toLowerCase().includes(q)
        if (!matchPatient && !matchContent) return false
      }
      if (filter === 'all') return true
      if (filter === 'completed') return log.consult_status === 'O'
      if (filter === 'incomplete') return log.consult_status === 'X'
      if (filter === 'undecided') return log.consult_status === '△'
      return true
    })
  }, [displayLogs, filter, search])

  const counts = useMemo(() => {
    const c = { all: displayLogs.length, completed: 0, incomplete: 0, undecided: 0 }
    for (const l of displayLogs) {
      if (l.consult_status === 'O') c.completed++
      else if (l.consult_status === 'X') c.incomplete++
      else if (l.consult_status === '△') c.undecided++
    }
    return c
  }, [displayLogs])

  // 메모 편집
  const startEditMemo = (log: ConsultLog) => {
    if (!log.id) return
    setEditingId(log.id)
    setEditingText(log.remarks || '')
  }
  const cancelEditMemo = () => {
    setEditingId(null)
    setEditingText('')
  }
  const saveMemo = async (log: ConsultLog) => {
    if (!log.id) return
    setSavingId(log.id)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('consult_logs')
        .update({ remarks: editingText })
        .eq('id', log.id)
      if (updateError) throw updateError
      // 로컬 상태 업데이트
      const applyUpdate = (logs: ConsultLog[]) =>
        logs.map((l) => (l.id === log.id ? { ...l, remarks: editingText } : l))
      if (fetchedLogs) setFetchedLogs(applyUpdate(fetchedLogs))
      // props consultLogs는 부모 소유라 직접 갱신은 다음 refetch에 맡김
      setEditingId(null)
      setEditingText('')
    } catch (e) {
      console.error('[ConsultLogsTab] save memo error', e)
      await appAlert(e instanceof Error ? e.message : '메모 저장에 실패했습니다.')
    } finally {
      setSavingId(null)
    }
  }

  // 상태 토글 (미결정 → 확정 → 미확정 순환)
  const cycleStatus = async (log: ConsultLog) => {
    if (!log.id) return
    const current = (log.consult_status || '△') as NonNullable<ConsultLog['consult_status']>
    const idx = STATUS_ORDER.indexOf(current)
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]
    setStatusUpdatingId(log.id)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('consult_logs')
        .update({ consult_status: next })
        .eq('id', log.id)
      if (updateError) throw updateError
      if (fetchedLogs) {
        setFetchedLogs(fetchedLogs.map((l) => (l.id === log.id ? { ...l, consult_status: next } : l)))
      }
    } catch (e) {
      console.error('[ConsultLogsTab] toggle status error', e)
      await appAlert(e instanceof Error ? e.message : '상태 변경에 실패했습니다.')
    } finally {
      setStatusUpdatingId(null)
    }
  }

  // 기존 onUpdateConsultStatus 콜백 호환 (props 모드일 때 사용)
  const handleLegacyStatusUpdate = async (consultId: number) => {
    if (!onUpdateConsultStatus) return
    setStatusUpdatingId(consultId)
    try {
      const result = await onUpdateConsultStatus(consultId)
      if (result.success) {
        setRecentlyUpdatedIds((prev) => new Set(prev).add(consultId))
        setTimeout(() => {
          setRecentlyUpdatedIds((prev) => {
            const s = new Set(prev)
            s.delete(consultId)
            return s
          })
        }, 5000)
      } else if (result.error) {
        await appAlert(result.error)
      }
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const needsNav = period === 'week' || period === 'month'
  const periodLabel = range.label

  return (
    <div>
      {/* 기간 선택 + 네비게이션 */}
      <div className="flex flex-col gap-2 sm:gap-3 mb-3 sm:mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-at-surface-alt rounded-xl p-1">
            <PeriodButton active={period === 'day'} onClick={() => changePeriod('day')}>선택일</PeriodButton>
            <PeriodButton active={period === 'week'} onClick={() => changePeriod('week')}>주별</PeriodButton>
            <PeriodButton active={period === 'month'} onClick={() => changePeriod('month')}>월별</PeriodButton>
            <PeriodButton active={period === 'all'} onClick={() => changePeriod('all')}>전체</PeriodButton>
          </div>
          {needsNav && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setOffset((o) => o - 1)}
                className="p-1.5 rounded-lg hover:bg-at-surface-hover text-at-text-secondary border border-at-border"
                aria-label="이전"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 text-xs sm:text-sm font-medium text-at-text whitespace-nowrap min-w-[140px] sm:min-w-[180px] text-center">
                {periodLabel}
              </span>
              <button
                onClick={() => setOffset((o) => o + 1)}
                className="p-1.5 rounded-lg hover:bg-at-surface-hover text-at-text-secondary border border-at-border"
                aria-label="다음"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setOffset(0)}
                className="ml-1 px-2 py-1 text-xs font-medium text-at-accent hover:bg-at-surface-hover rounded-lg border border-at-border"
              >
                현재
              </button>
            </div>
          )}
          {period === 'all' && (
            <span className="text-xs text-at-text-weak">{periodLabel}</span>
          )}
        </div>

        {/* 상태 필터 */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0">
          <div className="flex gap-1 sm:gap-2 flex-wrap">
            <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')} tone="neutral">
              전체 ({counts.all})
            </FilterBtn>
            <FilterBtn active={filter === 'completed'} onClick={() => setFilter('completed')} tone="success">
              진행완료 ({counts.completed})
            </FilterBtn>
            <FilterBtn active={filter === 'incomplete'} onClick={() => setFilter('incomplete')} tone="warning">
              진행보류 ({counts.incomplete})
            </FilterBtn>
            <FilterBtn active={filter === 'undecided'} onClick={() => setFilter('undecided')} tone="warning">
              미결정 ({counts.undecided})
            </FilterBtn>
          </div>
        </div>

        {/* 검색 */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-at-text-weak" />
            <input
              type="text"
              placeholder="환자명 또는 상담내용 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 sm:pl-9 pr-8 py-1.5 sm:py-2 text-xs sm:text-sm border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-at-text-weak hover:text-at-text rounded-full hover:bg-at-surface-hover"
                title="검색어 지우기"
              >
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            )}
          </div>
          {search && (
            <span className="text-xs sm:text-sm text-at-text-weak">{filteredLogs.length}건 검색됨</span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-at-error-bg text-at-error rounded-xl text-sm">{error}</div>
      )}

      {/* 테이블 */}
      <div className="border border-at-border rounded-xl overflow-hidden overflow-x-auto">
        <div className="max-h-[calc(100vh-360px)] overflow-y-auto">
          <table className="w-full text-xs sm:text-sm text-left min-w-[800px]">
            <thead className="bg-at-surface-alt text-at-text sticky top-0 z-10">
              <tr>
                <th className="p-2 sm:p-3 font-medium whitespace-nowrap">날짜</th>
                <th className="p-2 sm:p-3 font-medium">환자명</th>
                <th className="p-2 sm:p-3 font-medium">상담내용</th>
                <th className="p-2 sm:p-3 font-medium whitespace-nowrap">진행여부</th>
                <th className="p-2 sm:p-3 font-medium">메모</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center">
                    <span className="inline-block w-6 h-6 border-2 border-at-accent border-t-transparent rounded-full animate-spin" />
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-at-text-weak">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 text-at-text-weak/60" />
                    {displayLogs.length === 0 ? '해당 기간에 상담 기록이 없습니다.' : '조건에 맞는 상담이 없습니다.'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const status = (log.consult_status || '△') as NonNullable<ConsultLog['consult_status']>
                  const isCompleted = status === 'O' || recentlyUpdatedIds.has(log.id!)
                  const isUndecided = status === '△' && !recentlyUpdatedIds.has(log.id!)
                  const badgeClass = isCompleted
                    ? 'bg-at-success-bg text-at-success'
                    : 'bg-at-warning-bg text-at-warning'
                  const label = isCompleted ? '진행완료' : isUndecided ? '미결정' : '진행보류'
                  const isEditingThis = editingId === log.id
                  const isSaving = savingId === log.id
                  const isStatusUpdating = statusUpdatingId === log.id

                  // 상태 토글 핸들러 선택: day 모드(=props)면 부모 콜백, 아니면 직접 갱신
                  const isPropsMode = period === 'day'
                  const handleStatusClick = () => {
                    if (isPropsMode) {
                      if (onUpdateConsultStatus && (status === 'X' || status === '△')) {
                        if (log.id) handleLegacyStatusUpdate(log.id)
                      }
                    } else {
                      cycleStatus(log)
                    }
                  }
                  const canToggleStatusInPropsMode = isPropsMode && onUpdateConsultStatus && (status === 'X' || status === '△') && !recentlyUpdatedIds.has(log.id!)

                  return (
                    <tr key={log.id} className="border-b border-at-border last:border-0 hover:bg-at-surface-hover">
                      <td className="p-2 sm:p-3 whitespace-nowrap">{log.date}</td>
                      <td className="p-2 sm:p-3 font-medium">{log.patient_name}</td>
                      <td className="p-2 sm:p-3 text-at-text-secondary">{log.consult_content}</td>
                      <td className="p-2 sm:p-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-xs font-medium ${badgeClass}`}>
                            {label}
                          </span>
                          {isPropsMode ? (
                            canToggleStatusInPropsMode ? (
                              <button
                                onClick={handleStatusClick}
                                disabled={statusUpdatingId !== null}
                                className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 text-xs font-medium rounded transition-colors
                                  ${isStatusUpdating
                                    ? 'bg-at-surface-alt text-at-text-weak cursor-wait'
                                    : 'bg-at-accent-light text-at-accent hover:bg-at-tag border border-at-border'
                                  }`}
                                title="진행으로 변경"
                              >
                                {isStatusUpdating ? (
                                  <span className="animate-spin w-3 h-3 border-2 border-at-accent border-t-transparent rounded-full" />
                                ) : (
                                  <>
                                    <ArrowRight className="w-3 h-3" />
                                    <span className="hidden sm:inline">변경</span>
                                  </>
                                )}
                              </button>
                            ) : recentlyUpdatedIds.has(log.id!) ? (
                              <span className="inline-flex items-center gap-1 text-at-success text-xs">
                                <Check className="w-3.5 h-3.5" />
                              </span>
                            ) : null
                          ) : (
                            <button
                              onClick={handleStatusClick}
                              disabled={isStatusUpdating}
                              className="px-1.5 py-0.5 text-xs text-at-text-weak hover:text-at-accent hover:bg-at-surface-alt rounded border border-at-border"
                              title="상태 순환 변경 (미결정→완료→보류)"
                            >
                              {isStatusUpdating ? (
                                <span className="inline-block animate-spin w-3 h-3 border-2 border-at-accent border-t-transparent rounded-full" />
                              ) : (
                                '변경'
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="p-2 sm:p-3">
                        {isEditingThis ? (
                          <div className="flex items-start gap-1">
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              rows={2}
                              autoFocus
                              className="flex-1 px-2 py-1 text-xs sm:text-sm border border-at-accent rounded-lg focus:ring-1 focus:ring-at-accent"
                              placeholder="메모 입력..."
                            />
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => saveMemo(log)}
                                disabled={isSaving}
                                className="p-1 text-at-success hover:bg-at-success-bg rounded disabled:opacity-50"
                                title="저장"
                              >
                                {isSaving ? (
                                  <span className="block w-3.5 h-3.5 border-2 border-at-success border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                onClick={cancelEditMemo}
                                disabled={isSaving}
                                className="p-1 text-at-text-weak hover:bg-at-surface-hover rounded"
                                title="취소"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditMemo(log)}
                            className="group inline-flex items-start gap-1 text-left w-full cursor-text"
                            title="클릭하여 메모 편집"
                          >
                            <span className={`flex-1 ${log.remarks ? 'text-at-text-secondary' : 'text-at-text-weak italic'}`}>
                              {log.remarks || '메모 추가...'}
                            </span>
                            <Pencil className="w-3 h-3 text-at-text-weak opacity-0 group-hover:opacity-100 mt-1 flex-shrink-0" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-2 text-xs text-at-text-weak">
        진행여부 배지 옆 "변경" 버튼으로 상태를, 메모 영역 클릭으로 메모를 인라인 수정할 수 있습니다.
      </p>
    </div>
  )
}

function PeriodButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
        active ? 'bg-white text-at-text shadow-sm' : 'text-at-text-secondary hover:bg-white/60'
      }`}
    >
      {children}
    </button>
  )
}

function FilterBtn({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean
  onClick: () => void
  tone: 'neutral' | 'success' | 'warning'
  children: React.ReactNode
}) {
  const activeClass = {
    neutral: 'bg-at-accent text-white',
    success: 'bg-at-success text-white',
    warning: 'bg-at-warning text-white',
  }[tone]
  return (
    <button
      onClick={onClick}
      className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-xl transition-colors ${
        active ? activeClass : 'bg-at-surface-alt text-at-text-secondary hover:bg-at-surface-hover'
      }`}
    >
      {children}
    </button>
  )
}
