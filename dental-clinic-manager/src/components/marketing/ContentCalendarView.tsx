'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowPathIcon,
  CheckCircleIcon,
  CalendarDaysIcon,
  SparklesIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import {
  TOPIC_CATEGORY_LABELS,
  type ContentCalendar,
  type ContentCalendarItem,
} from '@/types/marketing'
import CalendarItemCard from './CalendarItemCard'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

export default function ContentCalendarView() {
  const [calendars, setCalendars] = useState<(ContentCalendar & { content_calendar_items: ContentCalendarItem[] })[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState<string | null>(null)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())

  // ─── 데이터 로드 ───
  const loadCalendars = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/marketing/calendar', { cache: 'no-store' })
      if (!res.ok) throw new Error(`조회 실패 (${res.status})`)
      const json = await res.json()
      setCalendars(json.data || [])
      if (!selectedCalendarId && json.data?.length) {
        setSelectedCalendarId(json.data[0].id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [selectedCalendarId])

  useEffect(() => {
    loadCalendars()
  }, [loadCalendars])

  const selected = useMemo(
    () => calendars.find((c) => c.id === selectedCalendarId) || null,
    [calendars, selectedCalendarId]
  )

  // ─── 신규 캘린더 생성 ───
  const handleGenerate = async (offsetMonths: number = 0) => {
    if (generating) return
    setGenerating(true)
    setError(null)
    try {
      // offsetMonths=0(이번 달): 오늘부터 1달, offsetMonths>0: 그 달 1일부터
      const today = new Date()
      const target =
        offsetMonths === 0
          ? today
          : new Date(today.getFullYear(), today.getMonth() + offsetMonths, 1)
      const startDate = target.toISOString().split('T')[0]

      const res = await fetch('/api/marketing/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period: 'monthly',
          startDate,
          postsPerWeek: 5,
          skipWeekends: true,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `생성 실패 (${res.status})`)
      }
      const json = await res.json()
      await loadCalendars()
      if (json.data?.calendarId) setSelectedCalendarId(json.data.calendarId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '캘린더 생성 실패')
    } finally {
      setGenerating(false)
    }
  }

  // ─── 항목 수정 ───
  const handleItemUpdate = async (itemId: string, patch: Partial<ContentCalendarItem>) => {
    const res = await fetch('/api/marketing/calendar/items', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, action: 'modify', updates: patch }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error || '수정 실패')
    }
    await loadCalendars()
  }

  const handleApprove = async (itemId: string) => {
    const res = await fetch('/api/marketing/calendar/items', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, action: 'approve' }),
    })
    if (!res.ok) throw new Error('승인 실패')
    await loadCalendars()
  }

  const handleReject = async (itemId: string) => {
    const res = await fetch('/api/marketing/calendar/items', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, action: 'reject' }),
    })
    if (!res.ok) throw new Error('반려 실패')
    await loadCalendars()
  }

  const handleRegenerate = async (itemId: string) => {
    const res = await fetch('/api/marketing/calendar/items/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error || '재생성 실패')
    }
    await loadCalendars()
  }

  // ─── 항목 선택 토글 ───
  const handleToggleSelect = useCallback((itemId: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }, [])

  const handleClearSelection = useCallback(() => {
    setSelectedItems(new Set())
  }, [])

  // ─── 선택된 항목 일괄 작업 ───
  const handleBatchAction = async (action: 'batch_approve' | 'batch_reject' | 'batch_regenerate') => {
    if (selectedItems.size === 0 || bulkBusy) return
    setBulkBusy(action)
    try {
      if (action === 'batch_regenerate') {
        // 재생성은 순차 처리
        for (const itemId of selectedItems) {
          await handleRegenerate(itemId)
        }
      } else {
        const res = await fetch('/api/marketing/calendar/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            calendarId: selected?.id,
            action,
            itemIds: Array.from(selectedItems),
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || '일괄 작업 실패')
        }
      }
      setSelectedItems(new Set())
      await loadCalendars()
    } catch (e) {
      setError(e instanceof Error ? e.message : '일괄 작업 실패')
    } finally {
      setBulkBusy(null)
    }
  }

  // ─── 일괄 작업 ───
  const handleBulk = async (action: 'approve_all' | 'approve_non_review' | 'reject_all') => {
    if (!selected || bulkBusy) return
    setBulkBusy(action)
    try {
      const res = await fetch('/api/marketing/calendar/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarId: selected.id, action }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || '일괄 작업 실패')
      }
      await loadCalendars()
    } catch (e) {
      setError(e instanceof Error ? e.message : '일괄 작업 실패')
    } finally {
      setBulkBusy(null)
    }
  }

  // ─── 통계 ───
  const stats = useMemo(() => {
    if (!selected) return null
    const items = selected.content_calendar_items || []
    const byCategory: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    let needsReview = 0
    for (const it of items) {
      if (it.topic_category) byCategory[it.topic_category] = (byCategory[it.topic_category] || 0) + 1
      byStatus[it.status] = (byStatus[it.status] || 0) + 1
      if (it.needs_medical_review) needsReview++
    }
    return { total: items.length, byCategory, byStatus, needsReview }
  }, [selected])

  // ─── 월간 그리드 (날짜별 항목) ───
  // 선택된 캘린더 항목 + 같은 기간에 걸친 다른 캘린더의 항목(이미 생성/발행된 글)도 함께 표시
  const grid = useMemo(() => {
    if (!selected) return null

    const start = new Date(selected.period_start)
    const end = new Date(selected.period_end)
    const startStr = selected.period_start
    const endStr = selected.period_end

    type GridItem = ContentCalendarItem & { _foreign?: boolean }
    const collected: GridItem[] = []
    const seenIds = new Set<string>()
    for (const cal of calendars) {
      const isSelf = cal.id === selected.id
      for (const it of cal.content_calendar_items || []) {
        if (it.publish_date < startStr || it.publish_date > endStr) continue
        if (seenIds.has(it.id)) continue
        // 반려된 항목은 캘린더에서 숨김
        if (it.status === 'rejected') continue
        seenIds.add(it.id)
        collected.push(isSelf ? it : { ...it, _foreign: true })
      }
    }
    collected.sort((a, b) =>
      a.publish_date.localeCompare(b.publish_date) || a.publish_time.localeCompare(b.publish_time)
    )

    const byDate = new Map<string, GridItem[]>()
    for (const it of collected) {
      const list = byDate.get(it.publish_date) || []
      list.push(it)
      byDate.set(it.publish_date, list)
    }
    // 시작주 일요일로 보정
    const firstSunday = new Date(start)
    firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay())
    // 종료주 토요일로 보정
    const lastSaturday = new Date(end)
    lastSaturday.setDate(lastSaturday.getDate() + (6 - lastSaturday.getDay()))

    const cells: { date: string; inMonth: boolean; items: GridItem[] }[] = []
    const cur = new Date(firstSunday)
    while (cur <= lastSaturday) {
      const ds = cur.toISOString().split('T')[0]
      cells.push({
        date: ds,
        inMonth: cur >= start && cur <= end,
        items: byDate.get(ds) || [],
      })
      cur.setDate(cur.getDate() + 1)
    }
    return cells
  }, [selected, calendars])

  return (
    <div className="space-y-4">
      {/* 헤더 / 액션 */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <CalendarDaysIcon className="h-5 w-5 text-gray-700" />
          <h2 className="text-base font-bold text-gray-900">콘텐츠 캘린더</h2>
          <span className="text-xs text-gray-500">— AI가 한 달치 주제를 기획하고, 승인하면 자동 발행됩니다</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleGenerate(0)}
            disabled={generating}
            className="bg-emerald-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <SparklesIcon className={`h-4 w-4 ${generating ? 'animate-pulse' : ''}`} />
            {generating ? '생성 중...' : '이번 달 계획 생성'}
          </button>
          <button
            onClick={() => handleGenerate(1)}
            disabled={generating}
            className="bg-gray-100 text-gray-700 text-sm px-3 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            다음 달 계획
          </button>
          <button
            onClick={loadCalendars}
            disabled={loading}
            className="text-gray-500 hover:text-gray-700 p-1.5 rounded hover:bg-gray-100 disabled:opacity-50"
            title="새로고침"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">
          ⚠️ {error}
        </div>
      )}

      {/* 캘린더 목록 (드롭다운) */}
      {calendars.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">기간:</label>
          <select
            value={selectedCalendarId || ''}
            onChange={(e) => setSelectedCalendarId(e.target.value)}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            {calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.period_start} ~ {c.period_end} · {c.status}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 통계 패널 */}
      {selected && stats && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-[11px] text-gray-500">총 주제</div>
            <div className="text-lg font-bold text-gray-900">{stats.total}개</div>
          </div>
          <div>
            <div className="text-[11px] text-gray-500">승인 완료</div>
            <div className="text-lg font-bold text-emerald-600">{stats.byStatus.approved || 0}개</div>
          </div>
          <div>
            <div className="text-[11px] text-gray-500">발행 예정</div>
            <div className="text-lg font-bold text-violet-600">{stats.byStatus.scheduled || 0}개</div>
          </div>
          <div>
            <div className="text-[11px] text-gray-500">심의 필요</div>
            <div className="text-lg font-bold text-yellow-700">{stats.needsReview}개</div>
          </div>
          <div className="col-span-2 sm:col-span-4 flex flex-wrap gap-1.5 mt-1">
            {Object.entries(stats.byCategory).map(([cat, count]) => {
              const meta = TOPIC_CATEGORY_LABELS[cat as keyof typeof TOPIC_CATEGORY_LABELS]
              if (!meta) return null
              return (
                <span
                  key={cat}
                  className="text-[11px] bg-white border border-gray-200 px-2 py-0.5 rounded inline-flex items-center gap-1"
                >
                  <span>{meta.label}</span>
                  <span className="font-bold text-gray-700">{count}</span>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* 일괄 액션 */}
      {selected && (selected.content_calendar_items || []).some((i) => ['proposed', 'modified'].includes(i.status)) && (
        <div className="flex flex-wrap gap-2 items-center bg-amber-50 border border-amber-200 rounded-lg p-3">
          <span className="text-sm text-amber-800">⚡ 일괄 작업:</span>
          <button
            onClick={() => handleBulk('approve_all')}
            disabled={bulkBusy !== null}
            className="bg-emerald-600 text-white text-xs px-3 py-1 rounded hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <CheckCircleIcon className="h-3.5 w-3.5" />
            {bulkBusy === 'approve_all' ? '처리 중...' : '모두 승인'}
          </button>
          <button
            onClick={() => handleBulk('approve_non_review')}
            disabled={bulkBusy !== null}
            className="bg-emerald-50 text-emerald-700 text-xs px-3 py-1 rounded hover:bg-emerald-100 disabled:opacity-50"
          >
            {bulkBusy === 'approve_non_review' ? '처리 중...' : '심의 필요 제외 모두 승인'}
          </button>
          <button
            onClick={() => handleBulk('reject_all')}
            disabled={bulkBusy !== null}
            className="bg-gray-100 text-gray-700 text-xs px-3 py-1 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            {bulkBusy === 'reject_all' ? '처리 중...' : '모두 반려'}
          </button>
        </div>
      )}

      {/* 선택된 항목 일괄 작업 바 */}
      {selectedItems.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap gap-2 items-center bg-blue-50 border border-blue-300 rounded-lg p-3 shadow-sm">
          <span className="text-sm font-medium text-blue-800">
            {selectedItems.size}개 선택됨
          </span>
          <button
            onClick={() => handleBatchAction('batch_approve')}
            disabled={bulkBusy !== null}
            className="bg-emerald-600 text-white text-xs px-3 py-1.5 rounded hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <CheckCircleIcon className="h-3.5 w-3.5" />
            {bulkBusy === 'batch_approve' ? '처리 중...' : '선택 승인'}
          </button>
          <button
            onClick={() => handleBatchAction('batch_regenerate')}
            disabled={bulkBusy !== null}
            className="bg-violet-100 text-violet-700 text-xs px-3 py-1.5 rounded hover:bg-violet-200 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${bulkBusy === 'batch_regenerate' ? 'animate-spin' : ''}`} />
            {bulkBusy === 'batch_regenerate' ? '재생성 중...' : '선택 재생성'}
          </button>
          <button
            onClick={() => handleBatchAction('batch_reject')}
            disabled={bulkBusy !== null}
            className="bg-rose-100 text-rose-700 text-xs px-3 py-1.5 rounded hover:bg-rose-200 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <XCircleIcon className="h-3.5 w-3.5" />
            {bulkBusy === 'batch_reject' ? '처리 중...' : '선택 반려'}
          </button>
          <button
            onClick={handleClearSelection}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 ml-auto"
          >
            선택 해제
          </button>
        </div>
      )}

      {/* 빈 상태 */}
      {!loading && calendars.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <CalendarDaysIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">아직 생성된 캘린더가 없습니다.</p>
          <p className="text-xs mt-1">위의 &quot;이번 달 계획 생성&quot; 버튼을 눌러 시작하세요.</p>
        </div>
      )}

      {/* 월간 그리드 */}
      {selected && grid && (
        <div>
          <div className="grid grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded overflow-hidden">
            {WEEKDAY_LABELS.map((label, i) => (
              <div
                key={label}
                className={`bg-gray-50 text-center text-xs font-medium py-1.5 ${
                  i === 0 ? 'text-rose-600' : i === 6 ? 'text-blue-600' : 'text-gray-700'
                }`}
              >
                {label}
              </div>
            ))}
            {grid.map((cell) => {
              const date = new Date(cell.date)
              const day = date.getDate()
              const dow = date.getDay()
              return (
                <div
                  key={cell.date}
                  className={`bg-white min-h-[110px] p-1.5 ${cell.inMonth ? '' : 'opacity-40 bg-gray-50'}`}
                >
                  <div
                    className={`text-[11px] font-medium mb-1 ${
                      dow === 0 ? 'text-rose-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700'
                    }`}
                  >
                    {day}
                  </div>
                  <div className="space-y-1">
                    {cell.items.map((item) => {
                      const isForeign = (item as ContentCalendarItem & { _foreign?: boolean })._foreign
                      const noop = () => {}
                      return (
                        <div
                          key={item.id}
                          className={isForeign ? 'opacity-60' : ''}
                          title={isForeign ? '다른 캘린더의 항목 (읽기 전용)' : undefined}
                        >
                          <CalendarItemCard
                            item={item}
                            onApprove={isForeign ? noop : () => handleApprove(item.id)}
                            onReject={isForeign ? noop : () => handleReject(item.id)}
                            onUpdate={isForeign ? noop : (patch) => handleItemUpdate(item.id, patch)}
                            onRegenerate={isForeign ? noop : () => handleRegenerate(item.id)}
                            selected={selectedItems.has(item.id)}
                            onToggleSelect={isForeign ? undefined : handleToggleSelect}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
