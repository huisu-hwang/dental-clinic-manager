/**
 * Work Schedule Utility Functions
 * 병원 진료시간 ↔ 개인 스케줄 ↔ 근로계약서 변환 유틸리티
 */

import type { ClinicHours } from '@/types/clinic'
import type {
  WorkSchedule,
  DaySchedule,
  DayName,
} from '@/types/workSchedule'
import {
  DAY_OF_WEEK_TO_NAME,
  DEFAULT_WORK_SCHEDULE,
} from '@/types/workSchedule'

/**
 * 병원 진료시간을 개인 근무 스케줄로 변환
 * @param clinicHours - 병원의 요일별 진료시간 배열
 * @returns 개인 근무 스케줄 객체
 */
export function convertClinicHoursToWorkSchedule(clinicHours: ClinicHours[]): WorkSchedule {
  console.log('[WorkScheduleUtils] Converting clinic hours to work schedule:', clinicHours)

  const schedule: WorkSchedule = { ...DEFAULT_WORK_SCHEDULE }

  clinicHours.forEach((hours) => {
    const dayName: DayName = DAY_OF_WEEK_TO_NAME[hours.day_of_week]

    if (!dayName) {
      console.warn('[WorkScheduleUtils] Invalid day_of_week:', hours.day_of_week)
      return
    }

    if (hours.is_open) {
      schedule[dayName] = {
        start: hours.open_time || null,
        end: hours.close_time || null,
        breakStart: hours.break_start || null,
        breakEnd: hours.break_end || null,
        isWorking: true,
      }
    } else {
      schedule[dayName] = {
        start: null,
        end: null,
        breakStart: null,
        breakEnd: null,
        isWorking: false,
      }
    }
  })

  console.log('[WorkScheduleUtils] Converted work schedule:', schedule)
  return schedule
}

/**
 * 개인 근무 스케줄을 근로계약서 형식으로 변환
 * @param workSchedule - 개인 근무 스케줄
 * @returns 근로계약서용 데이터 { work_start_time, work_end_time, work_days_per_week, work_hours_detail }
 */
export function convertWorkScheduleToContractData(workSchedule: WorkSchedule): {
  work_start_time: string
  work_end_time: string
  work_days_per_week: number
  work_hours_detail: WorkSchedule
} {
  console.log('[WorkScheduleUtils] Converting work schedule to contract data:', workSchedule)

  const workingDays = Object.values(workSchedule).filter((day) => day.isWorking)
  const workDaysCount = workingDays.length

  // 가장 빠른 시작 시간과 가장 늦은 종료 시간 찾기
  let earliestStart = '23:59'
  let latestEnd = '00:00'

  workingDays.forEach((day) => {
    if (day.start && day.start < earliestStart) {
      earliestStart = day.start
    }
    if (day.end && day.end > latestEnd) {
      latestEnd = day.end
    }
  })

  // 근무일이 없으면 기본값 사용
  if (workDaysCount === 0) {
    earliestStart = '09:00'
    latestEnd = '18:00'
  }

  const result = {
    work_start_time: earliestStart,
    work_end_time: latestEnd,
    work_days_per_week: workDaysCount,
    work_hours_detail: workSchedule,
  }

  console.log('[WorkScheduleUtils] Converted contract data:', result)
  return result
}

/**
 * 근무 스케줄 유효성 검증
 * @param schedule - 검증할 근무 스케줄
 * @returns 에러 메시지 (유효하면 null)
 */
export function validateWorkSchedule(schedule: WorkSchedule): string | null {
  const days: DayName[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

  for (const day of days) {
    const daySchedule = schedule[day]

    if (!daySchedule) {
      return `${day} 스케줄이 없습니다.`
    }

    if (daySchedule.isWorking) {
      // 근무일인 경우 시작/종료 시간 필수
      if (!daySchedule.start || !daySchedule.end) {
        return `${day}: 근무일은 시작 시간과 종료 시간이 필요합니다.`
      }

      // 시작 < 종료 검증
      if (daySchedule.start >= daySchedule.end) {
        return `${day}: 시작 시간이 종료 시간보다 빠르거나 같습니다.`
      }

      // 점심시간 검증
      if (daySchedule.breakStart && daySchedule.breakEnd) {
        if (daySchedule.breakStart >= daySchedule.breakEnd) {
          return `${day}: 점심 시작 시간이 종료 시간보다 빠르거나 같습니다.`
        }

        // 점심시간이 근무시간 내에 있는지 확인
        if (
          daySchedule.breakStart < daySchedule.start ||
          daySchedule.breakEnd > daySchedule.end
        ) {
          return `${day}: 점심시간이 근무시간 범위를 벗어났습니다.`
        }
      }

      // 점심시간 둘 중 하나만 입력된 경우
      if (
        (daySchedule.breakStart && !daySchedule.breakEnd) ||
        (!daySchedule.breakStart && daySchedule.breakEnd)
      ) {
        return `${day}: 점심 시작과 종료 시간을 모두 입력하거나 비워주세요.`
      }
    }
  }

  return null
}

/**
 * 주당 총 근무시간 계산
 * @param schedule - 근무 스케줄
 * @returns 주당 총 근무시간 (시간 단위)
 */
export function calculateWeeklyWorkHours(schedule: WorkSchedule): number {
  let totalMinutes = 0

  Object.values(schedule).forEach((day) => {
    if (day.isWorking && day.start && day.end) {
      const [startHour, startMinute] = day.start.split(':').map(Number)
      const [endHour, endMinute] = day.end.split(':').map(Number)

      let dayMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute)

      // 점심시간 제외
      if (day.breakStart && day.breakEnd) {
        const [breakStartHour, breakStartMinute] = day.breakStart.split(':').map(Number)
        const [breakEndHour, breakEndMinute] = day.breakEnd.split(':').map(Number)

        const breakMinutes = (breakEndHour * 60 + breakEndMinute) - (breakStartHour * 60 + breakStartMinute)
        dayMinutes -= breakMinutes
      }

      totalMinutes += dayMinutes
    }
  })

  return Math.round((totalMinutes / 60) * 10) / 10 // 소수점 1자리
}

/**
 * 요일별 근무시간 포맷팅 (표시용)
 * @param daySchedule - 요일별 스케줄
 * @returns "09:00 ~ 18:00 (점심: 12:00 ~ 13:00)" 형식
 */
export function formatDaySchedule(daySchedule: DaySchedule): string {
  if (!daySchedule.isWorking) {
    return '휴무'
  }

  if (!daySchedule.start || !daySchedule.end) {
    return '미설정'
  }

  let result = `${daySchedule.start} ~ ${daySchedule.end}`

  if (daySchedule.breakStart && daySchedule.breakEnd) {
    result += ` (점심: ${daySchedule.breakStart} ~ ${daySchedule.breakEnd})`
  }

  return result
}

/**
 * 전체 근무 스케줄 포맷팅 (표시용)
 * @param schedule - 근무 스케줄
 * @returns 요일별 근무시간 문자열
 */
export function formatWorkSchedule(schedule: WorkSchedule): string {
  const days: { name: DayName; label: string }[] = [
    { name: 'monday', label: '월' },
    { name: 'tuesday', label: '화' },
    { name: 'wednesday', label: '수' },
    { name: 'thursday', label: '목' },
    { name: 'friday', label: '금' },
    { name: 'saturday', label: '토' },
    { name: 'sunday', label: '일' },
  ]

  return days
    .map((day) => {
      const daySchedule = schedule[day.name]
      const formatted = formatDaySchedule(daySchedule)
      return `${day.label}: ${formatted}`
    })
    .join('\n')
}
