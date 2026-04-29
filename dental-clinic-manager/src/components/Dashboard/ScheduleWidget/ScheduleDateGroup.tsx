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
