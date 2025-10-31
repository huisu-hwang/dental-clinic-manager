import { DayKey, DayOperatingHour, OperatingHours } from '@/types/clinic'

export const dayOrder: Array<{ key: DayKey; label: string; shortLabel: string }> = [
  { key: 'monday', label: '월요일', shortLabel: '월' },
  { key: 'tuesday', label: '화요일', shortLabel: '화' },
  { key: 'wednesday', label: '수요일', shortLabel: '수' },
  { key: 'thursday', label: '목요일', shortLabel: '목' },
  { key: 'friday', label: '금요일', shortLabel: '금' },
  { key: 'saturday', label: '토요일', shortLabel: '토' },
  { key: 'sunday', label: '일요일', shortLabel: '일' }
]

const defaultEnabledDays: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

export const createDefaultOperatingHours = (): OperatingHours => {
  return dayOrder.reduce((acc, { key }) => {
    const enabled = defaultEnabledDays.includes(key)

    acc[key] = {
      enabled,
      startTime: null,
      endTime: null,
      breakStart: null,
      breakEnd: null,
      note: enabled ? null : '휴무'
    }

    return acc
  }, {} as OperatingHours)
}

export const mergeOperatingHours = (hours: unknown): OperatingHours => {
  const defaults = createDefaultOperatingHours()

  if (!hours || typeof hours !== 'object') {
    return defaults
  }

  dayOrder.forEach(({ key }) => {
    const entry = (hours as Record<string, Partial<DayOperatingHour>>)[key]

    if (entry && typeof entry === 'object') {
      defaults[key] = {
        enabled: typeof entry.enabled === 'boolean' ? entry.enabled : defaults[key].enabled,
        startTime: entry.startTime ?? defaults[key].startTime,
        endTime: entry.endTime ?? defaults[key].endTime,
        breakStart: entry.breakStart ?? defaults[key].breakStart,
        breakEnd: entry.breakEnd ?? defaults[key].breakEnd,
        note: entry.note ?? defaults[key].note
      }
    }
  })

  return defaults
}

export const prepareOperatingHoursForSave = (hours: OperatingHours): OperatingHours => {
  const prepared = createDefaultOperatingHours()

  dayOrder.forEach(({ key }) => {
    const entry = hours[key]
    prepared[key] = {
      enabled: !!entry?.enabled,
      startTime: entry?.startTime ?? null,
      endTime: entry?.endTime ?? null,
      breakStart: entry?.breakStart ?? null,
      breakEnd: entry?.breakEnd ?? null,
      note: entry?.note ?? (entry?.enabled ? null : '휴무')
    }
  })

  return prepared
}

export const formatOperatingRange = (entry: DayOperatingHour): string => {
  if (!entry.enabled) {
    return '휴무'
  }

  if (entry.startTime && entry.endTime) {
    return `${entry.startTime} ~ ${entry.endTime}`
  }

  return '미설정'
}

export const formatBreakRange = (entry: DayOperatingHour): string => {
  if (!entry.enabled) {
    return '-'
  }

  if (entry.breakStart && entry.breakEnd) {
    return `${entry.breakStart} ~ ${entry.breakEnd}`
  }

  return '없음'
}

export const summarizeOperatingHours = (hours: OperatingHours): string[] => {
  return dayOrder.map(({ key, label }) => {
    const entry = hours[key]
    let summary = `${label}: ${formatOperatingRange(entry)}`

    if (entry.enabled && entry.breakStart && entry.breakEnd) {
      summary += ` (점심 ${entry.breakStart} ~ ${entry.breakEnd})`
    }

    if (entry.note && entry.note.trim().length > 0 && entry.note.trim() !== '휴무') {
      summary += ` - ${entry.note.trim()}`
    }

    return summary
  })
}

export const hasConfiguredOperatingHours = (hours: OperatingHours): boolean => {
  return dayOrder.some(({ key }) => {
    const entry = hours[key]
    return entry.enabled && !!entry.startTime && !!entry.endTime
  })
}
