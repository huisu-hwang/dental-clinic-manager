export type DayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface DayOperatingHour {
  enabled: boolean
  startTime: string | null
  endTime: string | null
  breakStart: string | null
  breakEnd: string | null
  note: string | null
}

export type OperatingHours = Record<DayKey, DayOperatingHour>
