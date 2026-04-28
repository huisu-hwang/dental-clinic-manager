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
