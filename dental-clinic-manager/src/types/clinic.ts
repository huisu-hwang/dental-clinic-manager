/**
 * 병원 진료시간 및 휴진일 타입 정의
 */

export interface ClinicHours {
  id: string
  clinic_id: string
  day_of_week: number // 0=일요일, 1=월요일, ..., 6=토요일
  is_open: boolean
  open_time: string | null // "09:00" 형식
  close_time: string | null // "18:00" 형식
  break_start: string | null // "12:00" 형식
  break_end: string | null // "13:00" 형식
  created_at: string
  updated_at: string
}

export interface ClinicHoliday {
  id: string
  clinic_id: string
  holiday_date: string // "2025-01-01" 형식
  description: string | null
  created_at: string
}

// 요일 한글 매핑
export const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'] as const
export const DAY_NAMES_FULL = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'] as const

// 요일 타입
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

// 진료시간 입력용 타입 (UI에서 사용)
export interface ClinicHoursInput {
  day_of_week: DayOfWeek
  is_open: boolean
  open_time: string
  close_time: string
  break_start: string
  break_end: string
}

// 휴진일 입력용 타입
export interface ClinicHolidayInput {
  holiday_date: string
  description: string
}

// 기본 진료시간 설정
export const DEFAULT_CLINIC_HOURS: ClinicHoursInput[] = [
  { day_of_week: 0, is_open: false, open_time: '', close_time: '', break_start: '', break_end: '' }, // 일요일
  { day_of_week: 1, is_open: true, open_time: '09:00', close_time: '18:00', break_start: '12:00', break_end: '13:00' }, // 월요일
  { day_of_week: 2, is_open: true, open_time: '09:00', close_time: '18:00', break_start: '12:00', break_end: '13:00' }, // 화요일
  { day_of_week: 3, is_open: true, open_time: '09:00', close_time: '18:00', break_start: '12:00', break_end: '13:00' }, // 수요일
  { day_of_week: 4, is_open: true, open_time: '09:00', close_time: '18:00', break_start: '12:00', break_end: '13:00' }, // 목요일
  { day_of_week: 5, is_open: true, open_time: '09:00', close_time: '18:00', break_start: '12:00', break_end: '13:00' }, // 금요일
  { day_of_week: 6, is_open: true, open_time: '09:00', close_time: '14:00', break_start: '', break_end: '' }, // 토요일
]

// 시간 유효성 검증 함수
export function validateClinicHours(hours: ClinicHoursInput): string | null {
  if (!hours.is_open) {
    return null // 휴무일은 검증 안 함
  }

  if (!hours.open_time || !hours.close_time) {
    return '영업시간을 입력해주세요.'
  }

  if (hours.open_time >= hours.close_time) {
    return '종료시간은 시작시간보다 늦어야 합니다.'
  }

  if (hours.break_start && hours.break_end) {
    if (hours.break_start >= hours.break_end) {
      return '쉬는시간 종료는 시작시간보다 늦어야 합니다.'
    }

    if (hours.break_start < hours.open_time || hours.break_end > hours.close_time) {
      return '쉬는시간은 영업시간 내에 있어야 합니다.'
    }
  } else if (hours.break_start || hours.break_end) {
    return '쉬는시간 시작과 종료를 모두 입력해주세요.'
  }

  return null
}

// 시간 포맷 헬퍼 함수
export function formatTime(time: string | null): string {
  if (!time) return '-'
  return time
}

// 영업 시간 텍스트 생성
export function getBusinessHoursText(hours: ClinicHours): string {
  if (!hours.is_open) {
    return '휴무'
  }

  const open = formatTime(hours.open_time)
  const close = formatTime(hours.close_time)

  if (hours.break_start && hours.break_end) {
    return `${open} - ${close} (점심 ${formatTime(hours.break_start)} - ${formatTime(hours.break_end)})`
  }

  return `${open} - ${close}`
}
