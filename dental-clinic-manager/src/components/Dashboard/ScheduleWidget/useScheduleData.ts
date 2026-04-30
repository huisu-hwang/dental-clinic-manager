'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { announcementService } from '@/lib/bulletinService'
import {
  getKoreanPublicHolidays,
  getClinicDesignatedHolidays,
  getClinicHolidaySettings,
} from '@/lib/holidayService'
import type { Announcement } from '@/types/bulletin'
import type { ScheduleEvent, ViewType, DateRange, ScheduleBadgeKind } from './types'
import { extractDateRangeFromContent } from './scheduleParser'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function getRangeForView(viewType: ViewType, anchor: Date): DateRange {
  const today = new Date(anchor)
  today.setHours(0, 0, 0, 0)

  if (viewType === 'today') {
    const iso = formatLocalDate(today)
    return { start: iso, end: iso }
  }

  if (viewType === 'week') {
    const dayOfWeek = today.getDay() // 0=일, 1=월
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(today)
    monday.setDate(today.getDate() + mondayOffset)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return { start: formatLocalDate(monday), end: formatLocalDate(sunday) }
  }

  // month
  const first = new Date(today.getFullYear(), today.getMonth(), 1)
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  return { start: formatLocalDate(first), end: formatLocalDate(last) }
}

function rangeOverlaps(rangeStart: string, rangeEnd: string, eventStart: string, eventEnd: string): boolean {
  return eventStart <= rangeEnd && eventEnd >= rangeStart
}

function announcementBadge(category: Announcement['category']): ScheduleBadgeKind {
  if (category === 'holiday') return 'holiday_announcement'
  return 'schedule'
}

function priorityWeight(ev: ScheduleEvent): number {
  // 0: 휴무, 1: 중요/고정, 2: 일반
  if (
    ev.source === 'clinic_holiday' ||
    ev.source === 'public_holiday' ||
    ev.badgeKind === 'holiday_announcement'
  ) return 0
  if (ev.isPinned || ev.isImportant) return 1
  return 2
}

function sortEvents(events: ScheduleEvent[]): ScheduleEvent[] {
  return [...events].sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate)
    const pa = priorityWeight(a)
    const pb = priorityWeight(b)
    if (pa !== pb) return pa - pb
    return a.title.localeCompare(b.title, 'ko')
  })
}

function dedupeByDateAndTitle(events: ScheduleEvent[]): ScheduleEvent[] {
  const seen = new Set<string>()
  const result: ScheduleEvent[] = []
  for (const ev of events) {
    const key = `${ev.startDate}|${ev.endDate}|${ev.title}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(ev)
  }
  return result
}

function nextDayIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// 같은 source/title을 가진 연속 단일일(또는 인접 기간) 이벤트를 단일 기간 이벤트로 병합.
// holidayService가 clinic 휴무 기간을 개별 일짜로 펼쳐 반환하므로, 위젯에서 다시 합쳐서 보여준다.
function mergeConsecutiveSameTitle(events: ScheduleEvent[]): ScheduleEvent[] {
  const sorted = [...events].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const result: ScheduleEvent[] = []
  for (const ev of sorted) {
    const last = result[result.length - 1]
    if (
      last &&
      last.source === ev.source &&
      last.title === ev.title &&
      last.badgeKind === ev.badgeKind &&
      (last.endDate === ev.startDate || nextDayIso(last.endDate) === ev.startDate)
    ) {
      last.endDate = ev.endDate > last.endDate ? ev.endDate : last.endDate
      continue
    }
    result.push({ ...ev })
  }
  return result
}

interface UseScheduleDataResult {
  events: ScheduleEvent[]
  loading: boolean
  error: string | null
  range: DateRange
}

export function useScheduleData(
  clinicId: string | null,
  viewType: ViewType,
  anchor: Date
): UseScheduleDataResult {
  const range = useMemo(() => getRangeForView(viewType, anchor), [viewType, anchor])
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!clinicId) {
      setEvents([])
      setLoading(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller

    const today = new Date()

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const startYear = parseInt(range.start.substring(0, 4), 10)
        const endYear = parseInt(range.end.substring(0, 4), 10)

        const [annResult, settingsResult, designatedResults] = await Promise.all([
          announcementService.getAnnouncements({ limit: 200 }),
          getClinicHolidaySettings(clinicId!),
          (async () => {
            const out: Array<{ date: string; description: string | null }> = []
            for (let y = startYear; y <= endYear; y++) {
              const r = await getClinicDesignatedHolidays(clinicId!, y)
              if (r.success && r.holidays) out.push(...r.holidays)
            }
            return out
          })(),
        ])

        if (controller.signal.aborted) return

        const settings = settingsResult.success ? settingsResult.settings : undefined

        // 1) 공지사항 → 정규화
        const annEvents: ScheduleEvent[] = []
        const announcements = annResult.data || []
        for (const a of announcements) {
          if (a.category !== 'schedule' && a.category !== 'holiday') continue

          let startDate = a.start_date || ''
          let endDate = a.end_date || a.start_date || ''
          if (!startDate) {
            const parsed = extractDateRangeFromContent(a.content || '', today)
            if (!parsed) continue
            startDate = parsed.startDate
            endDate = parsed.endDate
          }

          if (!rangeOverlaps(range.start, range.end, startDate, endDate)) continue

          annEvents.push({
            id: `announcement-${a.id}`,
            source: 'announcement',
            startDate,
            endDate,
            title: a.title,
            badgeKind: announcementBadge(a.category),
            isPinned: a.is_pinned,
            isImportant: a.is_important,
            announcementId: a.id,
          })
        }

        // 2) 병원 지정 휴무일 → 윈도우 내 필터
        const clinicHolidayEvents: ScheduleEvent[] = []
        for (const h of designatedResults) {
          if (h.date < range.start || h.date > range.end) continue
          clinicHolidayEvents.push({
            id: `clinic-${h.date}`,
            source: 'clinic_holiday',
            startDate: h.date,
            endDate: h.date,
            title: h.description || '병원 휴무',
            badgeKind: 'clinic_holiday',
          })
        }

        // 3) 법정 공휴일 → 설정에 따라 포함
        const publicHolidayEvents: ScheduleEvent[] = []
        if (settings?.use_public_holidays) {
          const includeSubstitute = settings.use_substitute_holidays
          for (let y = startYear; y <= endYear; y++) {
            const yearHolidays = getKoreanPublicHolidays(y, includeSubstitute)
            for (const h of yearHolidays) {
              if (h.date < range.start || h.date > range.end) continue
              publicHolidayEvents.push({
                id: `public-${h.date}-${h.name}`,
                source: 'public_holiday',
                startDate: h.date,
                endDate: h.date,
                title: h.name,
                badgeKind: 'public_holiday',
              })
            }
          }
        }

        const merged = sortEvents(
          mergeConsecutiveSameTitle(
            dedupeByDateAndTitle([...annEvents, ...clinicHolidayEvents, ...publicHolidayEvents])
          )
        )

        if (!controller.signal.aborted) {
          setEvents(merged)
        }
      } catch (e: any) {
        if (!controller.signal.aborted) {
          console.warn('[useScheduleData] load failed:', e)
          setError(e?.message || 'load failed')
          setEvents([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    load()
    return () => controller.abort()
  }, [clinicId, range.start, range.end])

  return { events, loading, error, range }
}
