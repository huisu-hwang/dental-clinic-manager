# 대시보드 병원 일정 위젯 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드 홈에 오늘/주간/월간 탭을 가진 "병원 일정" 위젯을 추가하여, 게시판의 일정·휴무 공지와 병원·법정 공휴일을 한곳에서 확인할 수 있게 한다.

**Architecture:** 새 컴포넌트 `src/components/Dashboard/ScheduleWidget/`을 만들어 `DashboardHome.tsx`의 좌측 메인 칼럼 최상단에 삽입한다. 데이터는 `useScheduleData` 훅 내부에서 `announcementService` + `holidayService`를 병렬 호출 → 정규화 머지 → 정렬한다. 본문 미리보기는 새 메서드 `getAnnouncementPreview`(조회수 미증가)로 lazy 로드하며, XSS 방어는 기존 `sanitizeHtml` 유틸을 재사용한다.

**Tech Stack:** Next.js 15 / React 19 / TypeScript / Tailwind / shadcn(Card, Dialog) / lucide-react / Supabase / DOMPurify(`@/utils/sanitize`).

**Spec:** [docs/superpowers/specs/2026-04-29-dashboard-schedule-widget-design.md](../specs/2026-04-29-dashboard-schedule-widget-design.md)

---

## File Structure

**New files:**
- `src/components/Dashboard/ScheduleWidget/index.tsx` — 메인 카드 + 탭 컨테이너
- `src/components/Dashboard/ScheduleWidget/types.ts` — 정규화 타입 (`ScheduleEvent`, `ViewType`, `ScheduleBadgeKind`)
- `src/components/Dashboard/ScheduleWidget/scheduleParser.ts` — 본문 날짜 추출 (pure)
- `src/components/Dashboard/ScheduleWidget/useScheduleData.ts` — 3개 소스 병렬 페치 + 머지 + 정렬
- `src/components/Dashboard/ScheduleWidget/ScheduleItem.tsx` — 한 줄 일정 표시
- `src/components/Dashboard/ScheduleWidget/ScheduleDateGroup.tsx` — 날짜별 그룹 헤더 + 항목들
- `src/components/Dashboard/ScheduleWidget/TodayView.tsx` — 오늘 탭 콘텐츠
- `src/components/Dashboard/ScheduleWidget/WeekView.tsx` — 주간 탭 콘텐츠
- `src/components/Dashboard/ScheduleWidget/MonthView.tsx` — 월간 탭 콘텐츠
- `src/components/Dashboard/ScheduleWidget/ScheduleDetailModal.tsx` — 클릭 시 본문 미리보기

**Modified files:**
- `src/lib/bulletinService.ts` — `getAnnouncementPreview(id)` 메서드 추가 (조회수 미증가 버전)
- `src/components/Dashboard/DashboardHome.tsx` — 좌측 메인 칼럼 최상단(오늘의 현황 위)에 `<ScheduleWidget />` 삽입

---

## Conventions

- 파일 인용: `src/...` 절대 경로
- 빌드 명령: `npm run build` (앱 루트 `dental-clinic-manager/dental-clinic-manager/`)
- 개발 서버: `npm run dev`
- 테스트 계정: `whitedc0902@gmail.com` / `ghkdgmltn81!`
- Git: 각 task 완료마다 develop 브랜치에 커밋 (push는 모든 task 끝낸 후 한 번)
- TDD가 가능한 환경이 아니므로(테스트 프레임워크 미설치) 각 task는 "코드 작성 → 빌드 검증 → 커밋" 사이클로 진행한다. 단위 검증이 필요한 순수함수(`scheduleParser`)는 Task 13의 통합 검증에서 동작 확인으로 갈음한다.

---

## Task 1: announcementService에 미리보기용 조회 메서드 추가

**Why:** 기존 `getAnnouncement(id)`는 자동으로 조회수 증가 RPC(`increment_announcement_view_count`)를 호출한다. spec에 따르면 미리보기 모달은 조회수를 늘리지 말아야 하므로, 별도 메서드가 필요하다.

**Files:**
- Modify: `src/lib/bulletinService.ts` (announcementService 객체 안, `getAnnouncement` 바로 아래에 추가)

- [ ] **Step 1: 메서드 추가**

`src/lib/bulletinService.ts`의 `announcementService = {` 블록 안, `getAnnouncement` 메서드 정의 직후에 다음을 추가한다 (line 200 직후, `createAnnouncement` 직전):

```typescript
  /**
   * 공지사항 상세 조회 — 조회수 미증가 (대시보드 미리보기용)
   */
  async getAnnouncementPreview(id: string): Promise<{ data: Announcement | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('announcements')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      // author 이름 조회 (조회수 증가 RPC는 호출하지 않음)
      const nameMap = await getUserNames(supabase, [data.author_id])

      return {
        data: {
          ...data,
          author_name: nameMap[data.author_id] || '알 수 없음',
        },
        error: null,
      }
    } catch (error) {
      console.error('[announcementService.getAnnouncementPreview] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },
```

- [ ] **Step 2: 빌드 검증**

```bash
cd dental-clinic-manager && npm run build
```

Expected: 빌드 성공 (타입 에러 없음)

- [ ] **Step 3: 커밋**

```bash
git add src/lib/bulletinService.ts
git commit -m "feat(bulletin): add getAnnouncementPreview for view-count-safe lookup"
```

---

## Task 2: 정규화 타입 정의

**Files:**
- Create: `src/components/Dashboard/ScheduleWidget/types.ts`

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p src/components/Dashboard/ScheduleWidget
```

- [ ] **Step 2: types.ts 작성**

`src/components/Dashboard/ScheduleWidget/types.ts`:

```typescript
export type ViewType = 'today' | 'week' | 'month'

export type ScheduleSource = 'announcement' | 'clinic_holiday' | 'public_holiday'

export type ScheduleBadgeKind = 'clinic_holiday' | 'public_holiday' | 'schedule' | 'holiday_announcement'

export interface ScheduleEvent {
  id: string
  source: ScheduleSource
  startDate: string
  endDate: string
  title: string
  badgeKind: ScheduleBadgeKind
  isPinned?: boolean
  isImportant?: boolean
  announcementId?: string
}

export interface DateRange {
  start: string
  end: string
}
```

- [ ] **Step 3: 빌드 검증**

```bash
cd dental-clinic-manager && npm run build
```

Expected: 성공

- [ ] **Step 4: 커밋**

```bash
git add src/components/Dashboard/ScheduleWidget/types.ts
git commit -m "feat(schedule-widget): define ScheduleEvent normalized types"
```

---

## Task 3: 본문 날짜 추출 유틸 (scheduleParser)

**Why:** 공지사항의 `start_date`/`end_date`가 비어 있을 때 본문(`content`) 첫 매치에서 한국식·기간 표현 날짜를 추출한다.

**Files:**
- Create: `src/components/Dashboard/ScheduleWidget/scheduleParser.ts`

- [ ] **Step 1: scheduleParser.ts 작성**

```typescript
/**
 * 공지사항 본문에서 날짜/기간을 추출하는 순수 유틸.
 * - start_date/end_date가 비어 있는 공지에 한해 호출.
 * - 본문의 "첫 매치"만 반환 (다중 날짜 언급 시 가장 앞 매치를 일정 시작으로 간주).
 * - 연도 생략 시 currentYear 기본; 추출 결과가 currentDate 기준 6개월 이전이면 다음 해로 보정.
 */

export interface ParsedRange {
  startDate: string
  endDate: string
}

const RE_FULL_DATE = /(\d{4})[-./년]\s?(\d{1,2})[-./월]\s?(\d{1,2})\s?일?/
const RE_SHORT_DATE = /(\d{1,2})\s?월\s?(\d{1,2})\s?일/
const RE_RANGE_SEPARATOR = /^\s*[~\-–]\s*/

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function buildIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(`${year}-${pad2(month)}-${pad2(day)}T00:00:00`)
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null
  }
  return `${year}-${pad2(month)}-${pad2(day)}`
}

interface RawDate {
  year?: number
  month: number
  day: number
}

interface MatchResult {
  raw: RawDate
  matchStartAbs: number
  matchEndAbs: number
}

function matchSingleAt(text: string, fromIndex: number): MatchResult | null {
  const slice = text.slice(fromIndex)
  const fullMatch = slice.match(RE_FULL_DATE)
  const shortMatch = slice.match(RE_SHORT_DATE)

  const candidates: Array<{ idx: number; len: number; raw: RawDate }> = []
  if (fullMatch && fullMatch.index !== undefined) {
    candidates.push({
      idx: fullMatch.index,
      len: fullMatch[0].length,
      raw: {
        year: parseInt(fullMatch[1], 10),
        month: parseInt(fullMatch[2], 10),
        day: parseInt(fullMatch[3], 10),
      },
    })
  }
  if (shortMatch && shortMatch.index !== undefined) {
    candidates.push({
      idx: shortMatch.index,
      len: shortMatch[0].length,
      raw: {
        month: parseInt(shortMatch[1], 10),
        day: parseInt(shortMatch[2], 10),
      },
    })
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.idx - b.idx)
  const chosen = candidates[0]
  return {
    raw: chosen.raw,
    matchStartAbs: fromIndex + chosen.idx,
    matchEndAbs: fromIndex + chosen.idx + chosen.len,
  }
}

function resolveYear(raw: RawDate, today: Date): number {
  if (raw.year !== undefined) return raw.year
  const currentYear = today.getFullYear()
  const candidate = buildIso(currentYear, raw.month, raw.day)
  if (!candidate) return currentYear
  const candidateDate = new Date(`${candidate}T00:00:00`)
  const sixMonthsAgo = new Date(today)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  if (candidateDate < sixMonthsAgo) return currentYear + 1
  return currentYear
}

/**
 * content에서 첫 매치를 추출한다.
 * 기간 표현(`A ~ B`)이면 startDate, endDate 모두 반환.
 * 단일이면 startDate === endDate.
 * 추출 실패 시 null.
 */
export function extractDateRangeFromContent(content: string, today: Date = new Date()): ParsedRange | null {
  if (!content) return null
  const text = content.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')

  const first = matchSingleAt(text, 0)
  if (!first) return null

  const startYear = resolveYear(first.raw, today)
  const startIso = buildIso(startYear, first.raw.month, first.raw.day)
  if (!startIso) return null

  const remainder = text.slice(first.matchEndAbs)
  const sepMatch = remainder.match(RE_RANGE_SEPARATOR)
  if (sepMatch) {
    const afterSep = first.matchEndAbs + sepMatch[0].length
    const second = matchSingleAt(text, afterSep)
    if (second && second.matchStartAbs === afterSep) {
      const endYear = second.raw.year ?? startYear
      const endIso = buildIso(endYear, second.raw.month, second.raw.day)
      if (endIso && endIso >= startIso) {
        return { startDate: startIso, endDate: endIso }
      }
    }
  }

  return { startDate: startIso, endDate: startIso }
}
```

- [ ] **Step 2: 빌드 검증**

```bash
cd dental-clinic-manager && npm run build
```

Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add src/components/Dashboard/ScheduleWidget/scheduleParser.ts
git commit -m "feat(schedule-widget): add scheduleParser for content-based date extraction"
```

---

## Task 4: 데이터 페치 훅 (useScheduleData)

**Files:**
- Create: `src/components/Dashboard/ScheduleWidget/useScheduleData.ts`

- [ ] **Step 1: useScheduleData.ts 작성**

```typescript
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
          dedupeByDateAndTitle([...annEvents, ...clinicHolidayEvents, ...publicHolidayEvents])
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
```

- [ ] **Step 2: 빌드 검증**

```bash
cd dental-clinic-manager && npm run build
```

Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add src/components/Dashboard/ScheduleWidget/useScheduleData.ts
git commit -m "feat(schedule-widget): add useScheduleData hook for parallel fetch+merge"
```

---

## Task 5: ScheduleItem 컴포넌트

**Files:**
- Create: `src/components/Dashboard/ScheduleWidget/ScheduleItem.tsx`

- [ ] **Step 1: ScheduleItem.tsx 작성**

```typescript
'use client'

import React from 'react'
import { Pin, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ScheduleEvent, ScheduleBadgeKind } from './types'

interface BadgeStyle {
  label: string
  className: string
}

const BADGE_STYLES: Record<ScheduleBadgeKind, BadgeStyle> = {
  clinic_holiday: { label: '휴무', className: 'bg-red-50 text-red-700' },
  public_holiday: { label: '공휴일', className: 'bg-amber-50 text-amber-700' },
  schedule: { label: '일정', className: 'bg-at-accent-tag text-at-accent' },
  holiday_announcement: { label: '휴무공지', className: 'bg-red-50 text-red-700' },
}

function formatRangeSuffix(startDate: string, endDate: string): string {
  if (startDate === endDate) return ''
  const [, sm, sd] = startDate.split('-')
  const [, em, ed] = endDate.split('-')
  return ` (${parseInt(sm, 10)}.${parseInt(sd, 10)}~${parseInt(em, 10)}.${parseInt(ed, 10)})`
}

interface ScheduleItemProps {
  event: ScheduleEvent
  onClick?: (event: ScheduleEvent) => void
}

export default function ScheduleItem({ event, onClick }: ScheduleItemProps) {
  const badge = BADGE_STYLES[event.badgeKind]
  const isClickable = event.source === 'announcement' && !!onClick
  const suffix = formatRangeSuffix(event.startDate, event.endDate)

  return (
    <button
      type="button"
      onClick={isClickable ? () => onClick!(event) : undefined}
      disabled={!isClickable}
      aria-label={`${badge.label} 일정: ${event.title}`}
      className={cn(
        'flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-left',
        isClickable
          ? 'cursor-pointer hover:bg-at-surface-hover'
          : 'cursor-default'
      )}
    >
      <span
        className={cn(
          'shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium tracking-[0.07px]',
          badge.className
        )}
      >
        {badge.label}
      </span>
      <span className="flex-1 text-sm text-at-text truncate tracking-[0.08px]">
        {event.title}
        {suffix && <span className="text-at-text-weak">{suffix}</span>}
      </span>
      {event.isPinned && <Pin className="w-3.5 h-3.5 text-at-accent shrink-0" />}
      {event.isImportant && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />}
    </button>
  )
}
```

- [ ] **Step 2: 빌드 검증**

```bash
cd dental-clinic-manager && npm run build
```

Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add src/components/Dashboard/ScheduleWidget/ScheduleItem.tsx
git commit -m "feat(schedule-widget): add ScheduleItem row component with badges"
```

---

## Task 6: ScheduleDateGroup 컴포넌트 (주간/월간 그룹 헤더)

**Files:**
- Create: `src/components/Dashboard/ScheduleWidget/ScheduleDateGroup.tsx`

- [ ] **Step 1: ScheduleDateGroup.tsx 작성**

```typescript
'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import type { ScheduleEvent } from './types'
import ScheduleItem from './ScheduleItem'

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function formatGroupHeader(dateIso: string): { label: string; dayOfWeek: number } {
  const d = new Date(`${dateIso}T12:00:00`)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const dow = d.getDay()
  return {
    label: `${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')} (${DOW_LABELS[dow]})`,
    dayOfWeek: dow,
  }
}

interface ScheduleDateGroupProps {
  date: string
  events: ScheduleEvent[]
  todayIso: string
  onItemClick: (event: ScheduleEvent) => void
}

export default function ScheduleDateGroup({ date, events, todayIso, onItemClick }: ScheduleDateGroupProps) {
  const { label, dayOfWeek } = formatGroupHeader(date)
  const isToday = date === todayIso
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  return (
    <div className="space-y-1">
      <div
        className={cn(
          'text-xs font-semibold tracking-[0.07px] flex items-center gap-2 px-2',
          isToday ? 'text-at-accent' : isWeekend ? 'text-red-600' : 'text-at-text'
        )}
      >
        <span>{label}</span>
        {isToday && <span className="w-1.5 h-1.5 rounded-full bg-at-accent" />}
      </div>
      <div className="space-y-0.5">
        {events.map(ev => (
          <ScheduleItem key={ev.id} event={ev} onClick={onItemClick} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 검증**

```bash
cd dental-clinic-manager && npm run build
```

Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add src/components/Dashboard/ScheduleWidget/ScheduleDateGroup.tsx
git commit -m "feat(schedule-widget): add ScheduleDateGroup for week/month grouping"
```

---

## Task 7: TodayView 컴포넌트

**Files:**
- Create: `src/components/Dashboard/ScheduleWidget/TodayView.tsx`

- [ ] **Step 1: TodayView.tsx 작성**

```typescript
'use client'

import React from 'react'
import { Building2, CalendarOff } from 'lucide-react'
import type { ScheduleEvent } from './types'
import ScheduleItem from './ScheduleItem'

interface TodayViewProps {
  events: ScheduleEvent[]
  loading: boolean
  todayIso: string
  onItemClick: (event: ScheduleEvent) => void
}

function isHolidayEvent(ev: ScheduleEvent): boolean {
  return (
    ev.source === 'clinic_holiday' ||
    ev.source === 'public_holiday' ||
    ev.badgeKind === 'holiday_announcement'
  )
}

export default function TodayView({ events, loading, todayIso, onItemClick }: TodayViewProps) {
  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-6 h-6 border-4 border-at-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // 오늘에 해당하는 휴무 (range가 today만 포함하는 단일일)
  const todayHoliday = events.find(
    ev => isHolidayEvent(ev) && ev.startDate <= todayIso && ev.endDate >= todayIso
  )

  const otherEvents = events.filter(ev => !(todayHoliday && ev.id === todayHoliday.id))

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-at-text-secondary gap-2">
        <CalendarOff className="w-8 h-8 text-at-text-weak" />
        <p className="text-sm tracking-[0.08px]">오늘 등록된 일정이 없습니다</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {todayHoliday && (
        <div className="flex items-center gap-2 bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-lg">
          <Building2 className="w-4 h-4 shrink-0" />
          <span className="text-sm font-semibold tracking-[0.08px]">
            오늘 휴무 — {todayHoliday.title}
          </span>
        </div>
      )}
      <div className="space-y-0.5">
        {otherEvents.map(ev => (
          <ScheduleItem key={ev.id} event={ev} onClick={onItemClick} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 검증**

```bash
cd dental-clinic-manager && npm run build
```

Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add src/components/Dashboard/ScheduleWidget/TodayView.tsx
git commit -m "feat(schedule-widget): add TodayView with holiday banner"
```

---

## Task 8: WeekView 컴포넌트

**Files:**
- Create: `src/components/Dashboard/ScheduleWidget/WeekView.tsx`

- [ ] **Step 1: WeekView.tsx 작성**

```typescript
'use client'

import React, { useMemo } from 'react'
import { CalendarOff } from 'lucide-react'
import type { ScheduleEvent } from './types'
import ScheduleDateGroup from './ScheduleDateGroup'

interface WeekViewProps {
  events: ScheduleEvent[]
  loading: boolean
  todayIso: string
  onItemClick: (event: ScheduleEvent) => void
}

function expandEventToDates(ev: ScheduleEvent): string[] {
  const dates: string[] = []
  const start = new Date(`${ev.startDate}T00:00:00`)
  const end = new Date(`${ev.endDate}T00:00:00`)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dy = String(d.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${dy}`)
  }
  return dates
}

function groupByDate(events: ScheduleEvent[]): Map<string, ScheduleEvent[]> {
  const map = new Map<string, ScheduleEvent[]>()
  for (const ev of events) {
    const dates = expandEventToDates(ev)
    for (const d of dates) {
      const list = map.get(d) || []
      list.push(ev)
      map.set(d, list)
    }
  }
  return map
}

export default function WeekView({ events, loading, todayIso, onItemClick }: WeekViewProps) {
  const groups = useMemo(() => groupByDate(events), [events])

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-6 h-6 border-4 border-at-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (groups.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-at-text-secondary gap-2">
        <CalendarOff className="w-8 h-8 text-at-text-weak" />
        <p className="text-sm tracking-[0.08px]">이번 주 등록된 일정이 없습니다</p>
      </div>
    )
  }

  const sortedDates = Array.from(groups.keys()).sort()

  return (
    <div className="space-y-3">
      {sortedDates.map(date => (
        <ScheduleDateGroup
          key={date}
          date={date}
          events={groups.get(date)!}
          todayIso={todayIso}
          onItemClick={onItemClick}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 빌드 검증**

```bash
cd dental-clinic-manager && npm run build
```

Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add src/components/Dashboard/ScheduleWidget/WeekView.tsx
git commit -m "feat(schedule-widget): add WeekView with per-day grouping"
```

---

## Task 9: MonthView 컴포넌트

**Files:**
- Create: `src/components/Dashboard/ScheduleWidget/MonthView.tsx`

- [ ] **Step 1: MonthView.tsx 작성**

```typescript
'use client'

import React, { useMemo } from 'react'
import { CalendarOff } from 'lucide-react'
import type { ScheduleEvent } from './types'
import ScheduleDateGroup from './ScheduleDateGroup'

interface MonthViewProps {
  events: ScheduleEvent[]
  loading: boolean
  todayIso: string
  onItemClick: (event: ScheduleEvent) => void
}

function expandEventToDates(ev: ScheduleEvent): string[] {
  const dates: string[] = []
  const start = new Date(`${ev.startDate}T00:00:00`)
  const end = new Date(`${ev.endDate}T00:00:00`)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dy = String(d.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${dy}`)
  }
  return dates
}

function groupByDate(events: ScheduleEvent[]): Map<string, ScheduleEvent[]> {
  const map = new Map<string, ScheduleEvent[]>()
  for (const ev of events) {
    const dates = expandEventToDates(ev)
    for (const d of dates) {
      const list = map.get(d) || []
      list.push(ev)
      map.set(d, list)
    }
  }
  return map
}

export default function MonthView({ events, loading, todayIso, onItemClick }: MonthViewProps) {
  const groups = useMemo(() => groupByDate(events), [events])

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-6 h-6 border-4 border-at-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (groups.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-at-text-secondary gap-2">
        <CalendarOff className="w-8 h-8 text-at-text-weak" />
        <p className="text-sm tracking-[0.08px]">이번 달 등록된 일정이 없습니다</p>
      </div>
    )
  }

  const sortedDates = Array.from(groups.keys()).sort()

  return (
    <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
      {sortedDates.map(date => (
        <ScheduleDateGroup
          key={date}
          date={date}
          events={groups.get(date)!}
          todayIso={todayIso}
          onItemClick={onItemClick}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: 빌드 검증**

```bash
cd dental-clinic-manager && npm run build
```

Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add src/components/Dashboard/ScheduleWidget/MonthView.tsx
git commit -m "feat(schedule-widget): add MonthView with scrollable per-day list"
```

---

## Task 10: ScheduleDetailModal 컴포넌트

**Why:** 공지사항 미리보기 모달. 본문 sanitize 렌더링은 기존 [src/components/Bulletin/AnnouncementDetail.tsx](../../../src/components/Bulletin/AnnouncementDetail.tsx) line 131~134의 패턴을 그대로 동일하게 사용한다 (즉, `sanitizeHtml`로 처리한 HTML을 동일한 방식으로 prop에 주입). 새로운 sanitize 로직은 추가하지 않는다.

**Files:**
- Create: `src/components/Dashboard/ScheduleWidget/ScheduleDetailModal.tsx`
- Reference (필독): `src/components/Bulletin/AnnouncementDetail.tsx` line 131~134 (sanitize 사용 패턴)

- [ ] **Step 1: 참조 패턴 확인**

먼저 `src/components/Bulletin/AnnouncementDetail.tsx`의 line 131~134를 직접 열어 본문 렌더링 코드를 확인한다. 그 정확히 같은 JSX 구조 (`className="prose prose-sm max-w-none text-at-text-secondary whitespace-pre-wrap"`와 sanitize된 HTML 주입)를 모달의 본문 영역에서 그대로 복사해서 사용해야 한다.

- [ ] **Step 2: ScheduleDetailModal.tsx 작성 — 본문 영역을 제외한 골격**

다음 코드를 작성하되, `// PASTE_BODY_RENDER_HERE` 주석 위치에는 Step 1에서 확인한 정확한 4줄 패턴을 그대로 복사 붙여넣기 한다 (className과 sanitizeHtml 호출 인자만 `detail.content || ''`으로 맞춤).

```typescript
'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { CalendarRange, UserCircle2, Pin, Star } from 'lucide-react'
import { announcementService } from '@/lib/bulletinService'
import type { Announcement } from '@/types/bulletin'
import { sanitizeHtml } from '@/utils/sanitize'
import type { ScheduleEvent } from './types'
import { cn } from '@/lib/utils'

interface ScheduleDetailModalProps {
  event: ScheduleEvent | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatDateRangeLabel(startDate: string, endDate: string): string {
  if (startDate === endDate) return startDate.replace(/-/g, '.')
  return `${startDate.replace(/-/g, '.')} ~ ${endDate.replace(/-/g, '.')}`
}

function formatCreatedAt(iso: string | undefined): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${m}.${day} 작성`
  } catch {
    return ''
  }
}

export default function ScheduleDetailModal({ event, open, onOpenChange }: ScheduleDetailModalProps) {
  const router = useRouter()
  const [detail, setDetail] = useState<Announcement | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !event?.announcementId) {
      setDetail(null)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    announcementService
      .getAnnouncementPreview(event.announcementId)
      .then(result => {
        if (cancelled) return
        if (result.error || !result.data) {
          setError(result.error || '본문을 불러올 수 없습니다')
          setDetail(null)
        } else {
          setDetail(result.data)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, event?.announcementId])

  const handleNavigate = () => {
    if (!event?.announcementId) return
    onOpenChange(false)
    router.push(`/dashboard/bulletin?id=${event.announcementId}`)
  }

  const badgeLabel = event?.badgeKind === 'holiday_announcement' ? '휴무공지' : '일정'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base text-at-text">
            <span className="px-1.5 py-0.5 rounded bg-at-accent-tag text-at-accent text-xs font-medium">
              {badgeLabel}
            </span>
            <span className="flex-1 truncate">{event?.title}</span>
            {event?.isPinned && <Pin className="w-4 h-4 text-at-accent shrink-0" />}
            {event?.isImportant && <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-3 text-xs text-at-text-secondary mt-1">
              <span className="flex items-center gap-1">
                <CalendarRange className="w-3.5 h-3.5" />
                {event && formatDateRangeLabel(event.startDate, event.endDate)}
              </span>
              {detail?.author_name && (
                <span className="flex items-center gap-1">
                  <UserCircle2 className="w-3.5 h-3.5" />
                  {detail.author_name}
                </span>
              )}
              {detail?.created_at && (
                <span>· {formatCreatedAt(detail.created_at)}</span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className={cn('mt-2 max-h-[60vh] overflow-y-auto', loading && 'opacity-60')}>
          {loading && (
            <div className="space-y-2 py-4">
              <div className="h-4 bg-at-surface-alt rounded animate-pulse" />
              <div className="h-4 bg-at-surface-alt rounded animate-pulse w-5/6" />
              <div className="h-4 bg-at-surface-alt rounded animate-pulse w-4/6" />
            </div>
          )}
          {!loading && error && (
            <p className="text-sm text-at-error py-4 text-center">{error}</p>
          )}
          {!loading && detail && (
            // PASTE_BODY_RENDER_HERE — AnnouncementDetail.tsx:131-134 동일 패턴 복사
            // (sanitizeHtml(detail.content || '')로 인자만 변경)
            null
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button onClick={handleNavigate} disabled={!event?.announcementId}>
            게시판에서 보기 →
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: PASTE_BODY_RENDER_HERE 자리에 sanitize 본문 렌더 4줄 삽입**

`src/components/Bulletin/AnnouncementDetail.tsx`의 line 131~134에서 본문 렌더링 4줄(div + className + sanitize HTML 주입 prop)을 그대로 복사하여, 위 골격의 `// PASTE_BODY_RENDER_HERE` 주석과 그 아래의 `null` 식을 대체한다. `sanitizeHtml` 인자만 `detail.content || ''`로 맞춘다.

이 단계 완료 후 파일에 plain `null` 표현식이 남아 있으면 안 된다.

- [ ] **Step 4: 빌드 검증**

```bash
cd dental-clinic-manager && npm run build
```

Expected: 성공. 만약 `Dialog`/`DialogHeader`/`DialogFooter`/`DialogDescription` 중 일부가 export되지 않았다면 `src/components/ui/dialog.tsx`를 열어 정확한 export 이름을 확인하고 import를 조정한다.

- [ ] **Step 5: 커밋**

```bash
git add src/components/Dashboard/ScheduleWidget/ScheduleDetailModal.tsx
git commit -m "feat(schedule-widget): add ScheduleDetailModal with sanitized preview"
```

---

## Task 11: ScheduleWidget 메인 (탭 컨테이너)

**Files:**
- Create: `src/components/Dashboard/ScheduleWidget/index.tsx`

- [ ] **Step 1: index.tsx 작성**

```typescript
'use client'

import React, { useMemo, useState } from 'react'
import { Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import type { ScheduleEvent, ViewType } from './types'
import { useScheduleData } from './useScheduleData'
import TodayView from './TodayView'
import WeekView from './WeekView'
import MonthView from './MonthView'
import ScheduleDetailModal from './ScheduleDetailModal'

const TAB_LABELS: Array<{ key: ViewType; label: string; shortLabel: string }> = [
  { key: 'today', label: '오늘', shortLabel: '오늘' },
  { key: 'week', label: '이번 주', shortLabel: '주간' },
  { key: 'month', label: '이번 달', shortLabel: '월간' },
]

function todayIsoSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default function ScheduleWidget() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<ViewType>('today')
  const [modalEvent, setModalEvent] = useState<ScheduleEvent | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const todayIso = useMemo(() => todayIsoSeoul(), [])
  const anchorDate = useMemo(() => new Date(`${todayIso}T00:00:00`), [todayIso])

  const { events, loading } = useScheduleData(user?.clinic_id ?? null, activeTab, anchorDate)

  const handleItemClick = (ev: ScheduleEvent) => {
    if (ev.source !== 'announcement' || !ev.announcementId) return
    setModalEvent(ev)
    setModalOpen(true)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-at-text tracking-[0.08px]">
            <Calendar className="w-4 h-4 text-at-accent" />
            병원 일정
          </CardTitle>
          <div
            role="tablist"
            aria-label="기간 선택"
            className="flex items-center gap-1 bg-at-surface-alt rounded-xl p-1"
          >
            {TAB_LABELS.map(tab => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-medium transition-colors tracking-[0.07px]',
                  activeTab === tab.key
                    ? 'bg-at-accent text-white shadow-sm'
                    : 'text-at-text-secondary hover:bg-at-surface-hover'
                )}
              >
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {activeTab === 'today' && (
          <TodayView events={events} loading={loading} todayIso={todayIso} onItemClick={handleItemClick} />
        )}
        {activeTab === 'week' && (
          <WeekView events={events} loading={loading} todayIso={todayIso} onItemClick={handleItemClick} />
        )}
        {activeTab === 'month' && (
          <MonthView events={events} loading={loading} todayIso={todayIso} onItemClick={handleItemClick} />
        )}
      </CardContent>
      <ScheduleDetailModal event={modalEvent} open={modalOpen} onOpenChange={setModalOpen} />
    </Card>
  )
}
```

- [ ] **Step 2: 빌드 검증**

```bash
cd dental-clinic-manager && npm run build
```

Expected: 성공

- [ ] **Step 3: 커밋**

```bash
git add src/components/Dashboard/ScheduleWidget/index.tsx
git commit -m "feat(schedule-widget): add main tabbed container with modal wiring"
```

---

## Task 12: DashboardHome에 위젯 통합

**Why:** 사용자 합의(Q1 — 상단 첫 줄). 좌측 메인 칼럼의 최상단(`오늘의 현황` 위)에 삽입한다.

**Files:**
- Modify: `src/components/Dashboard/DashboardHome.tsx`

- [ ] **Step 1: import 추가**

`src/components/Dashboard/DashboardHome.tsx`의 import 섹션 (약 line 29 `import MyTasksSection from './MyTasksSection'` 바로 아래)에 추가:

```typescript
import ScheduleWidget from './ScheduleWidget'
```

- [ ] **Step 2: 위젯 삽입**

`src/components/Dashboard/DashboardHome.tsx`에서 좌측 메인 칼럼(`<div className="flex-1 space-y-4 sm:space-y-5">`, line 554) 안의 첫 번째 자식인 `{/* 오늘의 현황 */}` 주석 바로 위에 다음을 삽입:

```tsx
            {/* 병원 일정 */}
            <ScheduleWidget />

```

즉 변경 후 구조:

```tsx
          {/* 왼쪽: 메인 콘텐츠 */}
          <div className="flex-1 space-y-4 sm:space-y-5">
            {/* 병원 일정 */}
            <ScheduleWidget />

            {/* 오늘의 현황 */}
            <div>
              ...
```

기존 위젯들의 코드/스타일은 절대 변경하지 않는다.

- [ ] **Step 3: 빌드 검증**

```bash
cd dental-clinic-manager && npm run build
```

Expected: 성공

- [ ] **Step 4: 커밋**

```bash
git add src/components/Dashboard/DashboardHome.tsx
git commit -m "feat(dashboard): mount ScheduleWidget at top of main column"
```

---

## Task 13: 통합 검증 (Chrome DevTools MCP)

**Why:** CLAUDE.md의 "구현-테스트-수정-푸시 사이클" 규칙. 빌드만 통과해서는 안 되며 실제 기능을 브라우저에서 확인해야 한다.

**Files:** (검증만, 수정 없음)

- [ ] **Step 1: dev 서버 시작 (백그라운드)**

```bash
cd dental-clinic-manager && npm run dev
```

서버가 `http://localhost:3000`에서 응답하는지 확인.

- [ ] **Step 2: Chrome DevTools MCP — 로그인**

`mcp__chrome-devtools__navigate_page`로 `http://localhost:3000`로 이동, 테스트 계정(`whitedc0902@gmail.com` / `ghkdgmltn81!`)으로 로그인.

- [ ] **Step 3: 대시보드 위젯 표시 확인**

`mcp__chrome-devtools__take_snapshot`으로 대시보드 화면 캡처. 다음을 검증:

- [ ] 좌측 메인 칼럼 최상단에 "병원 일정" 카드가 보인다
- [ ] 카드 헤더에 `Calendar` 아이콘 + "병원 일정" 텍스트 + 탭 3개(`오늘 / 이번 주 / 이번 달`)가 보인다
- [ ] 활성 탭이 `오늘`이고 강조 스타일이 적용되어 있다
- [ ] 데이터가 있으면 일정 항목이 보이고, 없으면 빈 상태 메시지("오늘 등록된 일정이 없습니다")가 보인다

- [ ] **Step 4: 탭 전환 동작 확인**

`mcp__chrome-devtools__click`으로 "이번 주" 탭 클릭 → snapshot. 다음을 검증:

- [ ] "이번 주" 탭이 활성화된다
- [ ] 콘텐츠 영역이 주간 뷰(날짜 그룹 리스트)로 전환된다
- [ ] 오늘 날짜 그룹 헤더가 액센트 색상이다
- [ ] 토/일 그룹 헤더가 빨간색이다 (해당 날짜 일정이 있는 경우)

"이번 달" 탭 클릭 → 월간 뷰로 전환. 동일한 그룹 형식 + 스크롤 가능 여부 확인.

- [ ] **Step 5: 모달 동작 확인**

`오늘` 또는 `주간` 탭에서 공지사항 항목(배지가 `일정` 또는 `휴무공지`)을 클릭 → snapshot. 다음을 검증:

- [ ] Dialog 모달이 열린다
- [ ] 제목, 기간, 작성자/작성일이 표시된다
- [ ] 본문이 sanitize된 HTML로 렌더링된다 (`<script>` 등이 실행되지 않음)
- [ ] 페치 중 스켈레톤이 잠시 보였다 사라진다
- [ ] "닫기" 버튼 클릭 → 모달 닫힘
- [ ] "게시판에서 보기" 버튼 클릭 → `/dashboard/bulletin?id=...`로 라우팅

- [ ] **Step 6: 휴무일 클릭 비활성 확인**

휴무일 항목(배지 `휴무` 또는 `공휴일`)을 클릭 시도. 모달이 열리지 않고 hover/click 효과가 없어야 한다.

- [ ] **Step 7: 콘솔 에러 + 조회수 미증가 확인**

`mcp__chrome-devtools__list_console_messages` (types: error)로 콘솔 에러 0건임을 확인.

`mcp__chrome-devtools__list_network_requests`로 다음을 확인:

- [ ] `announcements` 테이블 쿼리가 발생함
- [ ] `clinic_holidays` 테이블 쿼리가 발생함
- [ ] `clinic_holiday_settings` 쿼리가 발생함
- [ ] 모달 열 때 `announcements` SELECT는 발생하지만, `increment_announcement_view_count` RPC는 호출되지 않음 (게시판 페이지로 이동했을 때만 호출)

- [ ] **Step 8: 실패 시 대응**

위 검증 중 실패 항목이 있으면:
1. 콘솔 에러/네트워크 응답에서 원인 파악
2. 해당 task의 코드를 수정
3. dev 서버 재시작 (필요 시) → Step 2부터 재실행
4. 정상 동작 확인까지 반복

CLAUDE.md 규칙에 따라 실패한 채로 두지 말고 반드시 성공할 때까지 수정-검증을 반복한다.

---

## Task 14: 모든 커밋 검토 + 최종 푸시

- [ ] **Step 1: 변경 사항 검토**

```bash
git log develop..HEAD --oneline
```

Expected: Task 1~12 각각의 커밋이 모두 보인다.

```bash
git diff origin/develop..HEAD --stat
```

Expected: 새 파일 10개(ScheduleWidget/* + index.tsx) + bulletinService.ts + DashboardHome.tsx만 변경되어 있다.

- [ ] **Step 2: 최종 빌드 + lint**

```bash
cd dental-clinic-manager && npm run build && npm run lint
```

Expected: 모두 성공. 경고가 있으면 ScheduleWidget 관련만 수정 (다른 기존 경고는 손대지 않음).

- [ ] **Step 3: develop 브랜치에 푸시**

```bash
git push origin develop
```

푸시 실패 시 `git pull --rebase origin develop` 후 재시도. CLAUDE.md 규칙에 따라 성공할 때까지 반복.

- [ ] **Step 4: 작업 로그 기록 (선택)**

`.claude/WORK_LOG.md`가 존재하면 다음 형식으로 기록:

```markdown
## 2026-04-29 [기능 개발] 대시보드 병원 일정 위젯

**키워드:** #dashboard #schedule #bulletin #holiday

### 📋 작업 내용
- 대시보드 홈 좌측 메인 칼럼 최상단에 "병원 일정" 카드 위젯 추가
- 오늘/주간/월간 3개 탭 + 공지사항(schedule/holiday) + 병원 휴무일 + 법정 공휴일 통합 표시
- 본문 날짜 추출(scheduleParser) 지원
- 공지사항 클릭 → 본문 미리보기 모달 (조회수 미증가)

### ✅ 해결 방법
- announcementService에 getAnnouncementPreview 메서드 추가
- ScheduleWidget 디렉토리에 10개 컴포넌트/유틸 분리

### 🧪 테스트 결과
- 빌드 성공, lint 통과
- Chrome DevTools MCP로 탭 전환/모달/라우팅 동작 검증
- 콘솔 에러 0건, 미리보기 모달은 조회수 증가 RPC 미호출 확인

---
```

---

## Self-Review 체크리스트

작성 후 다음을 확인:

1. **Spec coverage**
   - [x] §2 위치: Task 12에서 DashboardHome 좌측 메인 칼럼 최상단 삽입
   - [x] §3 컴포넌트 구조: Task 2~11에서 모든 파일 생성
   - [x] §4.1 데이터 소스 3종: Task 4 useScheduleData
   - [x] §4.2 본문 날짜 추출: Task 3 scheduleParser
   - [x] §4.3 정규화 타입: Task 2 types.ts
   - [x] §4.4 조회 범위: Task 4의 getRangeForView
   - [x] §4.5 정렬 규칙: Task 4의 sortEvents
   - [x] §4.6 페치 전략: Task 4의 AbortController + Promise.all
   - [x] §5.1 카드 헤더 + 탭: Task 11 index.tsx
   - [x] §5.2 오늘 탭 + 휴무 배너: Task 7 TodayView
   - [x] §5.3 주간 탭: Task 8 WeekView
   - [x] §5.4 월간 탭 (스크롤): Task 9 MonthView
   - [x] §5.5 ScheduleItem (배지 4종): Task 5
   - [x] §6 모달 (sanitize, 조회수 미증가, 라우팅): Task 1 + Task 10
   - [x] §7 디자인 토큰: 모든 컴포넌트가 at-* 토큰 사용
   - [x] §8 엣지 케이스: useScheduleData에서 dedupe + 에러 처리

2. **Placeholder scan**: 모든 코드 블록은 실제 코드. Task 10 Step 3는 명시적으로 기존 파일의 4줄 패턴을 복사하라는 지시이므로 placeholder가 아니라 reference-by-pattern.

3. **Type consistency**:
   - `ScheduleEvent` 필드명 (id, source, startDate, endDate, title, badgeKind, isPinned, isImportant, announcementId)이 Task 2~11 전체에서 일관됨.
   - `ViewType`이 `'today' | 'week' | 'month'`로 일관.
   - 메서드명 `getAnnouncementPreview`가 Task 1과 Task 10에서 동일.

4. **Ambiguity**:
   - 본문 첫 매치만 사용하는 규칙 명시
   - 조회수 증가 회피를 위한 별도 메서드 분리
   - clinic_holidays 테이블이 기간형이지만 `getClinicDesignatedHolidays`가 이미 펼쳐 반환하는 것을 그대로 사용
