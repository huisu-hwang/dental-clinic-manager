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
