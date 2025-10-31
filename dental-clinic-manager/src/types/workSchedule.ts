/**
 * Work Schedule Types
 * 개인 근무 스케줄 관련 타입 정의
 */

// 요일 이름
export type DayName = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

// 요일별 근무 시간
export interface DaySchedule {
  start: string | null // HH:mm 형식
  end: string | null // HH:mm 형식
  breakStart: string | null // HH:mm 형식
  breakEnd: string | null // HH:mm 형식
  isWorking: boolean
}

// 주간 근무 스케줄
export interface WorkSchedule {
  monday: DaySchedule
  tuesday: DaySchedule
  wednesday: DaySchedule
  thursday: DaySchedule
  friday: DaySchedule
  saturday: DaySchedule
  sunday: DaySchedule
}

// 요일 한글명 매핑
export const DAY_NAMES_KO: Record<DayName, string> = {
  sunday: '일요일',
  monday: '월요일',
  tuesday: '화요일',
  wednesday: '수요일',
  thursday: '목요일',
  friday: '금요일',
  saturday: '토요일',
}

// 요일 영문명 매핑 (day_of_week 0-6 → 영문명)
export const DAY_OF_WEEK_TO_NAME: Record<number, DayName> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
}

// 기본 근무 스케줄
export const DEFAULT_WORK_SCHEDULE: WorkSchedule = {
  monday: { start: '09:00', end: '18:00', breakStart: '12:00', breakEnd: '13:00', isWorking: true },
  tuesday: { start: '09:00', end: '18:00', breakStart: '12:00', breakEnd: '13:00', isWorking: true },
  wednesday: { start: '09:00', end: '18:00', breakStart: '12:00', breakEnd: '13:00', isWorking: true },
  thursday: { start: '09:00', end: '18:00', breakStart: '12:00', breakEnd: '13:00', isWorking: true },
  friday: { start: '09:00', end: '18:00', breakStart: '12:00', breakEnd: '13:00', isWorking: true },
  saturday: { start: '09:00', end: '14:00', breakStart: null, breakEnd: null, isWorking: true },
  sunday: { start: null, end: null, breakStart: null, breakEnd: null, isWorking: false },
}
