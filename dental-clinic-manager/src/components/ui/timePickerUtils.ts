// src/components/ui/timePickerUtils.ts

/**
 * "HH:mm" 24시간 → 한국식 12시간 표시 ("오전 9:30").
 * 빈 문자열이면 빈 문자열 반환.
 */
export function formatTo12Hour(value: string): string {
  if (!value) return ''
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return ''
  const hour = parseInt(match[1], 10)
  const minute = match[2]
  if (hour < 0 || hour > 23 || parseInt(minute, 10) < 0 || parseInt(minute, 10) > 59) return ''
  const period = hour < 12 ? '오전' : '오후'
  let displayHour = hour % 12
  if (displayHour === 0) displayHour = 12
  return `${period} ${displayHour}:${minute}`
}

/**
 * 자유 입력 → "HH:mm" 24시간 정규화. 실패 시 null 반환.
 * 허용: "9:30", "09:30", "14:00", "오전 9:30", "오후 2:30", "오전9:30"
 */
export function parseTimeInput(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // 24시간 형식: 9:30, 09:30, 14:00
  const time24 = trimmed.match(/^(\d{1,2}):(\d{1,2})$/)
  if (time24) {
    const h = parseInt(time24[1], 10)
    const m = parseInt(time24[2], 10)
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
    return null
  }

  // 한국식 12시간: "오전 9:30", "오후 2:30", "오전9:30"
  const time12 = trimmed.match(/^(오전|오후)\s*(\d{1,2}):(\d{1,2})$/)
  if (time12) {
    const period = time12[1]
    let h = parseInt(time12[2], 10)
    const m = parseInt(time12[3], 10)
    if (h < 1 || h > 12 || m < 0 || m > 59) return null
    if (period === '오전') {
      if (h === 12) h = 0
    } else {
      if (h !== 12) h += 12
    }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  return null
}

export interface TimeChip {
  value: string  // "HH:mm" 24시간
  label: string  // "9:30" 12시간 표시 (탭 안에서는 오전/오후 자명하므로 period 생략)
}

/**
 * 탭 ('am' | 'pm')에 해당하는 시간 칩 배열 생성.
 */
export function generateChips(
  tab: 'am' | 'pm',
  step: 15 | 30 | 60,
  minHour: number,
  maxHour: number
): TimeChip[] {
  if (!Number.isFinite(step) || step <= 0) return []
  const startHour = tab === 'am' ? Math.max(0, minHour) : Math.max(12, minHour)
  const endHour = tab === 'am' ? Math.min(11, maxHour) : Math.min(23, maxHour)
  if (startHour > endHour) return []

  const chips: TimeChip[] = []
  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += step) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      let displayHour = h % 12
      if (displayHour === 0) displayHour = 12
      const label = `${displayHour}:${String(m).padStart(2, '0')}`
      chips.push({ value, label })
    }
  }
  return chips
}

/**
 * value가 비어있지 않으면 그 시(hour) 기준으로 'am'/'pm' 결정.
 * 비어있으면 현재 시각 기준.
 */
export function getDefaultTab(value: string): 'am' | 'pm' {
  if (value) {
    const match = value.match(/^(\d{1,2}):/)
    if (match) {
      const h = parseInt(match[1], 10)
      if (h >= 0 && h <= 11) return 'am'
      if (h >= 12 && h <= 23) return 'pm'
    }
  }
  const nowHour = new Date().getHours()
  return nowHour < 12 ? 'am' : 'pm'
}
