'use client'

import React, { useMemo } from 'react'
import { CalendarOff } from 'lucide-react'
import type { ScheduleEvent } from './types'
import ScheduleDateGroup from './ScheduleDateGroup'

interface MonthViewProps {
  events: ScheduleEvent[]
  loading: boolean
  todayIso: string
  rangeStart: string
  onItemClick: (event: ScheduleEvent) => void
}

// 윈도우 내 첫 등장일에 한 번만 등록 (연속 일정을 단일 항목으로 표시)
function groupByDate(events: ScheduleEvent[], rangeStart: string): Map<string, ScheduleEvent[]> {
  const map = new Map<string, ScheduleEvent[]>()
  for (const ev of events) {
    const placement = ev.startDate < rangeStart ? rangeStart : ev.startDate
    const list = map.get(placement) || []
    list.push(ev)
    map.set(placement, list)
  }
  return map
}

export default function MonthView({ events, loading, todayIso, rangeStart, onItemClick }: MonthViewProps) {
  const groups = useMemo(() => groupByDate(events, rangeStart), [events, rangeStart])

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
