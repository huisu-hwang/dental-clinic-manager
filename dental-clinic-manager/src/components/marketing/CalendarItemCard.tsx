'use client'

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import type { ContentCalendarItem, CalendarItemStatus } from '@/types/marketing'

interface Props {
  item: ContentCalendarItem
  onOpenDetail: (id: string) => void
  selected?: boolean
  onToggleSelect?: (id: string) => void
}

const STRIPE_COLOR: Record<CalendarItemStatus, string> = {
  proposed: 'bg-at-border',
  modified: 'bg-at-border',
  rejected: 'bg-at-border',
  approved: 'bg-at-accent',
  generating: 'bg-amber-400',
  publishing: 'bg-amber-400',
  review: 'bg-violet-500',
  scheduled: 'bg-cyan-500',
  published: 'bg-emerald-500',
  failed: 'bg-at-error',
}

export default function CalendarItemCard({
  item,
  onOpenDetail,
  selected,
  onToggleSelect,
}: Props) {
  const isLocked = ['scheduled', 'publishing', 'published'].includes(item.status)
  const stripe = STRIPE_COLOR[item.status] || 'bg-at-border'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenDetail(item.id)
        }
      }}
      className={`relative overflow-hidden border rounded-xl bg-at-surface transition-colors duration-150 cursor-pointer pl-2 pr-2 py-2 ${
        selected
          ? 'border-at-accent ring-1 ring-at-accent/40 bg-at-accent-light/30'
          : 'border-at-border hover:bg-at-surface-hover'
      }`}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-0 bottom-0 w-1 ${stripe}`}
      />

      <div className="flex items-start gap-1.5 pl-1">
        {onToggleSelect && !isLocked && (
          <input
            type="checkbox"
            checked={selected || false}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelect(item.id)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-at-border text-at-accent focus:ring-at-accent cursor-pointer shrink-0"
            aria-label="항목 선택"
          />
        )}

        <div className="min-w-0 flex-1">
          <h4 className="text-[13px] font-semibold text-at-text leading-snug line-clamp-2">
            {item.title}
          </h4>
          {item.topic && (
            <p className="text-[11px] text-at-text-secondary mt-0.5 line-clamp-1">
              {item.topic}
            </p>
          )}
          {item.keyword && (
            <p className="text-[11px] text-at-text-weak mt-0.5 truncate">
              🔎 {item.keyword}
            </p>
          )}
          {item.needs_medical_review && (
            <span className="mt-1 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-at-warning-bg text-at-warning font-medium">
              <ExclamationTriangleIcon className="h-3 w-3" />
              심의
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
