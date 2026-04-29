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
