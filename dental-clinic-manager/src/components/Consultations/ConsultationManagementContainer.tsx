'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight, Search, X, MessageSquare, AlertCircle, Check, Pencil, Save } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { createClient } from '@/lib/supabase/client'
import { applyClinicFilter } from '@/lib/clinicScope'
import type { ConsultLog } from '@/types'
import { appAlert } from '@/components/ui/AppDialog'

type StatusFilter = 'all' | 'confirmed' | 'unconfirmed' | 'undecided'

const STATUS_TO_FILTER: Record<NonNullable<ConsultLog['consult_status']>, Exclude<StatusFilter, 'all'>> = {
  O: 'confirmed',
  X: 'unconfirmed',
  '△': 'undecided',
}

const STATUS_LABEL: Record<NonNullable<ConsultLog['consult_status']>, string> = {
  O: '확정',
  X: '미확정',
  '△': '미결정',
}

const STATUS_ORDER: NonNullable<ConsultLog['consult_status']>[] = ['△', 'O', 'X']

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function formatYM(year: number, month: number) {
  return `${year}-${pad(month)}`
}

function getMonthRange(year: number, month: number) {
  const start = `${year}-${pad(month)}-01`
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 }
  const endExclusive = `${next.y}-${pad(next.m)}-01`
  return { start, endExclusive }
}

export default function ConsultationManagementContainer() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { hasPermission, isLoading: permLoading } = usePermissions()

  const today = useMemo(() => new Date(), [])
  const initialYear = parseInt(searchParams.get('year') || '', 10) || today.getFullYear()
  const initialMonth = parseInt(searchParams.get('month') || '', 10) || today.getMonth() + 1

  const [year, setYear] = useState<number>(initialYear)
  const [month, setMonth] = useState<number>(initialMonth)
  const [logs, setLogs] = useState<ConsultLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingText, setEditingText] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)

  const canManage = hasPermission('consult_manage')

  // URL 동기화 (year/month 변경 시 query string 갱신)
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('year', String(year))
    params.set('month', String(month))
    const next = `${pathname}?${params.toString()}`
    if (typeof window !== 'undefined' && `${pathname}?${searchParams.toString()}` !== next) {
      router.replace(next, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month])

  const loadLogs = useCallback(async () => {
    if (!user?.clinic_id) return
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { start, endExclusive } = getMonthRange(year, month)
      const query = supabase
        .from('consult_logs')
        .select('*')
        .gte('date', start)
        .lt('date', endExclusive)
        .order('date', { ascending: false })
        .order('id', { ascending: false })
      const { data, error: fetchError } = await applyClinicFilter(query, user.clinic_id)
      if (fetchError) throw fetchError
      setLogs((data ?? []) as ConsultLog[])
    } catch (e) {
      console.error('[ConsultationManagement] loadLogs error', e)
      setError(e instanceof Error ? e.message : '상담 기록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [user?.clinic_id, year, month])

  useEffect(() => {
    if (permLoading) return
    if (!hasPermission('consult_view')) return
    loadLogs()
    // hasPermission은 매 렌더 새 인스턴스가 생성되므로 deps에서 제외 (permLoading=false 시점에 한 번만 평가)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadLogs, permLoading])

  const counts = useMemo(() => {
    const c = { all: logs.length, confirmed: 0, unconfirmed: 0, undecided: 0 }
    for (const l of logs) {
      const k = STATUS_TO_FILTER[l.consult_status as keyof typeof STATUS_TO_FILTER]
      if (k) c[k]++
    }
    return c
  }, [logs])

  const filteredLogs = useMemo(() => {
    let result = logs
    if (filter !== 'all') {
      result = result.filter(
        (l) => STATUS_TO_FILTER[l.consult_status as keyof typeof STATUS_TO_FILTER] === filter,
      )
    }
    const q = search.trim().toLowerCase()
    if (q) {
      result = result.filter(
        (l) =>
          (l.patient_name || '').toLowerCase().includes(q) ||
          (l.consult_content || '').toLowerCase().includes(q),
      )
    }
    return result
  }, [logs, filter, search])

  const goPrevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1)
      setMonth(12)
    } else {
      setMonth((m) => m - 1)
    }
  }
  const goNextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1)
      setMonth(1)
    } else {
      setMonth((m) => m + 1)
    }
  }
  const goCurrentMonth = () => {
    setYear(today.getFullYear())
    setMonth(today.getMonth() + 1)
  }

  const cycleStatus = async (log: ConsultLog) => {
    if (!canManage || !log.id) return
    const current = (log.consult_status || '△') as NonNullable<ConsultLog['consult_status']>
    const idx = STATUS_ORDER.indexOf(current)
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length]
    setSavingId(log.id)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('consult_logs')
        .update({ consult_status: next })
        .eq('id', log.id)
      if (updateError) throw updateError
      setLogs((prev) =>
        prev.map((l) => (l.id === log.id ? { ...l, consult_status: next } : l)),
      )
    } catch (e) {
      console.error('[ConsultationManagement] update status error', e)
      await appAlert(e instanceof Error ? e.message : '상태 변경에 실패했습니다.')
    } finally {
      setSavingId(null)
    }
  }

  const startEditMemo = (log: ConsultLog) => {
    if (!canManage || !log.id) return
    setEditingId(log.id)
    setEditingText(log.remarks || '')
  }

  const cancelEditMemo = () => {
    setEditingId(null)
    setEditingText('')
  }

  const saveMemo = async (log: ConsultLog) => {
    if (!canManage || !log.id) return
    setSavingId(log.id)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('consult_logs')
        .update({ remarks: editingText })
        .eq('id', log.id)
      if (updateError) throw updateError
      setLogs((prev) => prev.map((l) => (l.id === log.id ? { ...l, remarks: editingText } : l)))
      setEditingId(null)
      setEditingText('')
    } catch (e) {
      console.error('[ConsultationManagement] save memo error', e)
      await appAlert(e instanceof Error ? e.message : '메모 저장에 실패했습니다.')
    } finally {
      setSavingId(null)
    }
  }

  if (permLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 border-4 border-at-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!hasPermission('consult_view')) {
    return (
      <div className="p-6">
        <div className="max-w-xl mx-auto text-center py-12 px-6 bg-white border border-at-border rounded-2xl">
          <AlertCircle className="w-10 h-10 text-at-warning mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-at-text mb-1">권한이 없습니다</h2>
          <p className="text-sm text-at-text-secondary">
            상담 관리 기능을 사용할 권한이 없습니다. 관리자에게 문의하세요.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 bg-white min-h-screen">
      {/* 헤더 + 월 선택 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-at-accent" />
          <h1 className="text-xl sm:text-2xl font-semibold text-at-text">상담 관리</h1>
        </div>
        <div className="flex items-center gap-1 bg-at-surface-alt rounded-xl p-1">
          <button
            onClick={goPrevMonth}
            className="p-1.5 rounded-lg hover:bg-white text-at-text-secondary"
            aria-label="이전 달"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-3 text-sm font-medium text-at-text min-w-[90px] text-center">
            {formatYM(year, month)}
          </span>
          <button
            onClick={goNextMonth}
            className="p-1.5 rounded-lg hover:bg-white text-at-text-secondary"
            aria-label="다음 달"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={goCurrentMonth}
            className="ml-1 px-2 py-1 text-xs font-medium text-at-accent hover:bg-white rounded-lg"
          >
            이번 달
          </button>
        </div>
      </div>

      {/* 상태 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
        <StatCard label="전체" value={counts.all} active={filter === 'all'} onClick={() => setFilter('all')} tone="neutral" />
        <StatCard label="확정" value={counts.confirmed} active={filter === 'confirmed'} onClick={() => setFilter('confirmed')} tone="success" />
        <StatCard label="미확정" value={counts.unconfirmed} active={filter === 'unconfirmed'} onClick={() => setFilter('unconfirmed')} tone="warning" />
        <StatCard label="미결정" value={counts.undecided} active={filter === 'undecided'} onClick={() => setFilter('undecided')} tone="info" />
      </div>

      {/* 검색 */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-at-text-weak" />
          <input
            type="text"
            placeholder="환자명 또는 상담내용 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-9 py-2 text-sm border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-at-text-weak hover:text-at-text rounded-full hover:bg-at-surface-hover"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <span className="text-xs text-at-text-weak">{filteredLogs.length}건</span>
      </div>

      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-3 bg-at-error-bg text-at-error rounded-xl text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {/* 테이블 */}
      <div className="border border-at-border rounded-2xl overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[800px]">
            <thead className="bg-at-surface-alt text-at-text sticky top-0 z-10">
              <tr>
                <th className="p-3 font-medium whitespace-nowrap w-24">날짜</th>
                <th className="p-3 font-medium whitespace-nowrap w-24">환자명</th>
                <th className="p-3 font-medium">상담내용</th>
                <th className="p-3 font-medium whitespace-nowrap w-24 text-center">상태</th>
                <th className="p-3 font-medium">메모</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center">
                    <div className="inline-block w-6 h-6 border-3 border-at-accent border-t-transparent rounded-full animate-spin" />
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-at-text-weak">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 text-at-text-weak/60" />
                    {logs.length === 0
                      ? `${formatYM(year, month)}에 등록된 상담 기록이 없습니다.`
                      : '조건에 맞는 상담이 없습니다.'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const status = (log.consult_status || '△') as NonNullable<ConsultLog['consult_status']>
                  const statusLabel = STATUS_LABEL[status]
                  const statusClass =
                    status === 'O'
                      ? 'bg-at-success-bg text-at-success'
                      : status === 'X'
                        ? 'bg-at-warning-bg text-at-warning'
                        : 'bg-at-surface-alt text-at-text-secondary'
                  const isSaving = savingId === log.id
                  const isEditing = editingId === log.id
                  return (
                    <tr key={log.id} className="border-b border-at-border last:border-0 hover:bg-at-surface-hover">
                      <td className="p-3 whitespace-nowrap text-at-text-secondary">{log.date}</td>
                      <td className="p-3 whitespace-nowrap font-medium">{log.patient_name}</td>
                      <td className="p-3 text-at-text-secondary">{log.consult_content}</td>
                      <td className="p-3 whitespace-nowrap text-center">
                        <button
                          onClick={() => cycleStatus(log)}
                          disabled={!canManage || isSaving}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${statusClass} ${
                            canManage ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                          } ${isSaving ? 'opacity-50' : ''}`}
                          title={canManage ? '클릭하여 상태 변경' : statusLabel}
                        >
                          {statusLabel}
                        </button>
                      </td>
                      <td className="p-3">
                        {isEditing ? (
                          <div className="flex items-start gap-1">
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              rows={2}
                              autoFocus
                              className="flex-1 px-2 py-1 text-sm border border-at-accent rounded-lg focus:ring-1 focus:ring-at-accent"
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
                                  <span className="block w-4 h-4 border-2 border-at-success border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Check className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                onClick={cancelEditMemo}
                                disabled={isSaving}
                                className="p-1 text-at-text-weak hover:bg-at-surface-hover rounded"
                                title="취소"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEditMemo(log)}
                            disabled={!canManage}
                            className={`group inline-flex items-start gap-1 text-left w-full ${
                              canManage ? 'cursor-text' : 'cursor-default'
                            }`}
                            title={canManage ? '클릭하여 메모 편집' : ''}
                          >
                            <span
                              className={`flex-1 ${log.remarks ? 'text-at-text-secondary' : 'text-at-text-weak italic'}`}
                            >
                              {log.remarks || (canManage ? '메모 추가...' : '-')}
                            </span>
                            {canManage && (
                              <Pencil className="w-3.5 h-3.5 text-at-text-weak opacity-0 group-hover:opacity-100 mt-0.5 flex-shrink-0" />
                            )}
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

      {/* 도움말 */}
      {canManage && filteredLogs.length > 0 && (
        <p className="mt-3 text-xs text-at-text-weak">
          상태 배지 또는 메모 영역을 클릭하면 인라인으로 수정할 수 있습니다.
        </p>
      )}
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number
  active: boolean
  onClick: () => void
  tone: 'neutral' | 'success' | 'warning' | 'info'
}

function StatCard({ label, value, active, onClick, tone }: StatCardProps) {
  const toneClass = {
    neutral: active ? 'bg-at-text text-white border-at-text' : 'border-at-border text-at-text',
    success: active ? 'bg-at-success text-white border-at-success' : 'border-at-border text-at-text',
    warning: active ? 'bg-at-warning text-white border-at-warning' : 'border-at-border text-at-text',
    info: active ? 'bg-at-accent text-white border-at-accent' : 'border-at-border text-at-text',
  }[tone]
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between gap-2 px-3 py-3 rounded-xl border-2 transition-colors text-left ${toneClass}`}
    >
      <span className="text-xs sm:text-sm font-medium">{label}</span>
      <span className="text-lg sm:text-xl font-bold">{value}</span>
    </button>
  )
}
