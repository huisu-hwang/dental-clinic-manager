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
