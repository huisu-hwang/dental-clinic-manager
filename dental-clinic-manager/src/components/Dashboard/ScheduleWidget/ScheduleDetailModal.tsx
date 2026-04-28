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
            <div
              className="prose prose-sm max-w-none text-at-text-secondary whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(detail.content || '') }}
            />
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
