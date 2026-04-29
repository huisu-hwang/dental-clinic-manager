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
