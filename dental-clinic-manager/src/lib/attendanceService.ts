// ============================================
// 출퇴근 관리 서비스
// Attendance Management Service
// ============================================

import { createClient } from './supabase/client'
import { getBranches } from './branchService'
import type {
  AttendanceQRCode,
  QRCodeGenerateInput,
  QRCodeValidationRequest,
  QRCodeValidationResult,
  CheckInRequest,
  CheckOutRequest,
  AttendanceCheckResponse,
  AttendanceRecord,
  AttendanceFilter,
  AttendanceRecordsResponse,
  AttendanceStatistics,
  TeamAttendanceStatus,
  AttendanceEditRequest,
  AttendanceStatus,
} from '@/types/attendance'
import type { ClinicBranch } from '@/types/branch'
import type { WorkSchedule, DayName } from '@/types/workSchedule'
import { DEFAULT_WORK_SCHEDULE, DAY_OF_WEEK_TO_NAME } from '@/types/workSchedule'

/**
 * 한국 시간대 기준 오늘 날짜 반환 (YYYY-MM-DD 형식)
 * toISOString()은 UTC를 반환하므로 한국 시간(UTC+9)에서 오전 0시~8시59분에는
 * 전날 날짜가 반환되는 문제를 해결
 */
function getKoreanDateString(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

/**
 * 한국 시간대 기준 현재 시간 반환 (HH:MM:SS 형식)
 */
function getKoreanTimeString(date: Date = new Date()): string {
  return date.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

/**
 * 지각 여부 및 지각 시간 계산
 * @param checkInTime 출근 시간 (ISO 8601 형식)
 * @param scheduledStart 예정 출근 시간 (HH:MM:SS 형식)
 * @returns { isLate: boolean, lateMinutes: number, status: 'present' | 'late' }
 */
function calculateLateStatus(
  checkInTime: string,
  scheduledStart: string | undefined
): { isLate: boolean; lateMinutes: number; status: 'present' | 'late' } {
  const toleranceMinutes = 0 // 허용 범위 없음 - 1분이라도 늦으면 지각

  // 예정 출근 시간이 없으면 정상 출근으로 처리
  if (!scheduledStart) {
    return { isLate: false, lateMinutes: 0, status: 'present' }
  }

  // 출근 시간을 한국 시간으로 변환 (HH:MM:SS 형식)
  const checkInDate = new Date(checkInTime)
  const actualStartTime = getKoreanTimeString(checkInDate)

  // 시간 문자열을 분 단위로 변환
  const timeToMinutes = (timeStr: string): number => {
    const parts = timeStr.split(':')
    const hours = parseInt(parts[0], 10)
    const minutes = parseInt(parts[1], 10)
    return hours * 60 + minutes
  }

  const actualMinutes = timeToMinutes(actualStartTime)
  const scheduledMinutes = timeToMinutes(scheduledStart)

  // 지각 계산 (허용 범위 초과 시)
  const lateMinutes = actualMinutes - scheduledMinutes - toleranceMinutes

  if (lateMinutes > 0) {
    return {
      isLate: true,
      lateMinutes: actualMinutes - scheduledMinutes, // 실제 지각 시간 (허용 범위 제외하지 않음)
      status: 'late'
    }
  }

  return { isLate: false, lateMinutes: 0, status: 'present' }
}

/**
 * 날짜 문자열(YYYY-MM-DD)에서 로컬 시간대 기준 요일 반환
 * new Date("YYYY-MM-DD")는 UTC로 해석되어 시간대에 따라 요일이 달라질 수 있음
 */
function getDayOfWeekFromDateString(dateString: string): number {
  const [year, month, day] = dateString.split('-').map(Number)
  const localDate = new Date(year, month - 1, day) // 로컬 시간대 자정
  return localDate.getDay()
}

/**
 * 유효 기간(일수) 계산 함수
 */
function calculateValidityDays(validity_type?: string, validity_days?: number): number {
  switch (validity_type) {
    case 'daily':
      return 1
    case 'weekly':
      return 7
    case 'monthly':
      return 30
    case 'custom':
      return validity_days && validity_days > 0 ? validity_days : 1
    default:
      return 1 // 기본값: 1일
  }
}

/**
 * 직원 근무 스케줄 기반 해당 월의 소정 근로일수 계산
 * @param year 연도
 * @param month 월
 * @param workSchedule 직원 근무 스케줄 (없으면 기본 스케줄 사용)
 */
function getScheduledWorkDaysFromSchedule(
  year: number,
  month: number,
  workSchedule?: WorkSchedule
): number {
  const schedule = workSchedule || DEFAULT_WORK_SCHEDULE
  const daysInMonth = new Date(year, month, 0).getDate()
  let workDays = 0

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day)
    const dayOfWeek = date.getDay()
    const dayName = DAY_OF_WEEK_TO_NAME[dayOfWeek]

    // 해당 요일이 근무일인지 확인
    if (schedule[dayName]?.isWorking) {
      workDays++
    }
  }

  return workDays
}

/**
 * 직원별 근태 통계 계산 (직원 근무 스케줄 기반)
 * - 근무일: 직원 근무 스케줄 기반 해당 월의 총 근무해야 하는 일수
 * - 출근일: 출근 기록이 있는 일수 (present, late, early_leave)
 * - 결근일: 근무일 - 출근일 - 연차사용일
 */
function calculateAttendanceStatsFromRecords(
  records: AttendanceRecord[],
  totalWorkDays: number
): {
  presentDays: number
  absentDays: number
  leaveDays: number
  holidayDays: number
  lateCount: number
  totalLateMinutes: number
  earlyLeaveCount: number
  totalEarlyLeaveMinutes: number
  overtimeCount: number
  totalOvertimeMinutes: number
  totalWorkMinutes: number
} {
  // 출근 기록이 있는 날짜 집합 (중복 방지)
  const presentDates = new Set<string>()
  const leaveDates = new Set<string>()

  let holidayDays = 0
  let lateCount = 0
  let totalLateMinutes = 0
  let earlyLeaveCount = 0
  let totalEarlyLeaveMinutes = 0
  let overtimeCount = 0
  let totalOvertimeMinutes = 0
  let totalWorkMinutes = 0

  for (const record of records) {
    const recordDate = record.work_date

    switch (record.status) {
      case 'present':
        if (!presentDates.has(recordDate)) {
          presentDates.add(recordDate)
        }
        break
      case 'late':
        if (!presentDates.has(recordDate)) {
          presentDates.add(recordDate)
        }
        lateCount++
        totalLateMinutes += record.late_minutes || 0
        break
      case 'early_leave':
        if (!presentDates.has(recordDate)) {
          presentDates.add(recordDate)
        }
        earlyLeaveCount++
        totalEarlyLeaveMinutes += record.early_leave_minutes || 0
        break
      case 'leave':
        if (!leaveDates.has(recordDate)) {
          leaveDates.add(recordDate)
        }
        break
      case 'holiday':
        holidayDays++
        break
    }

    // 초과근무 집계
    if (record.overtime_minutes && record.overtime_minutes > 0) {
      overtimeCount++
      totalOvertimeMinutes += record.overtime_minutes
    }

    // 총 근무 시간 집계
    totalWorkMinutes += record.total_work_minutes || 0
  }

  const presentDays = presentDates.size
  const leaveDays = leaveDates.size

  // 유급 연차 사용일 (허용 범위 내, 기본 15일)
  const allowedAnnualLeave = 15
  const paidLeaveDays = Math.min(leaveDays, allowedAnnualLeave)

  // 결근일 = 근무일 - 출근일 - 유급연차사용일
  // 이렇게 하면 무단결근 + 연차초과가 결근일에 포함됨
  const absentDays = Math.max(0, totalWorkDays - presentDays - paidLeaveDays)

  return {
    presentDays,
    absentDays,
    leaveDays,
    holidayDays,
    lateCount,
    totalLateMinutes,
    earlyLeaveCount,
    totalEarlyLeaveMinutes,
    overtimeCount,
    totalOvertimeMinutes,
    totalWorkMinutes
  }
}

/**
 * QR 코드 생성 함수
 * 병원별로 QR 코드를 생성합니다. 유효 기간을 사용자가 지정할 수 있습니다.
 */
export async function generateDailyQRCode(
  input: QRCodeGenerateInput
): Promise<{ success: boolean; qrCode?: AttendanceQRCode; error?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const {
      clinic_id,
      branch_id,
      latitude,
      longitude,
      radius_meters = 100,
      validity_type = 'daily',
      validity_days: customValidityDays,
      force_regenerate = false
    } = input

    // 오늘 날짜
    const today = getKoreanDateString()

    // 유효 기간 계산
    const validityDays = calculateValidityDays(validity_type, customValidityDays)

    // 종료 날짜 계산
    const validUntilDate = new Date()
    validUntilDate.setDate(validUntilDate.getDate() + validityDays - 1)
    const validUntil = validUntilDate.toISOString().split('T')[0]

    // 만료 시간 계산 (종료 날짜의 다음 날 00:00)
    const expiresAtDate = new Date(validUntilDate)
    expiresAtDate.setDate(expiresAtDate.getDate() + 1)
    expiresAtDate.setHours(0, 0, 0, 0)
    const expiresAt = expiresAtDate.toISOString()

    // 현재 유효한 QR 코드가 있는지 확인 (오늘이 유효 기간 내에 있는 코드)
    let existingQRQuery = supabase
      .from('attendance_qr_codes')
      .select('*')
      .eq('clinic_id', clinic_id)
      .eq('is_active', true)
      .lte('valid_date', today) // 시작일이 오늘 이전이거나 오늘

    // branch_id 조건 추가 (하위 호환성 유지)
    if (branch_id) {
      existingQRQuery = existingQRQuery.eq('branch_id', branch_id)
    } else {
      existingQRQuery = existingQRQuery.is('branch_id', null)
    }

    const { data: existingQRList, error: checkError } = await existingQRQuery

    // 유효한 기존 QR 코드 찾기
    if (existingQRList && existingQRList.length > 0) {
      for (const existingQR of existingQRList) {
        const qrValidUntil = existingQR.valid_until || existingQR.valid_date
        if (qrValidUntil >= today) {
          // 강제 재생성 옵션인 경우 기존 QR 코드를 비활성화
          if (force_regenerate) {
            await supabase
              .from('attendance_qr_codes')
              .update({ is_active: false })
              .eq('id', existingQR.id)
            // 기존 코드 비활성화 후 새 코드 생성으로 진행
            break
          }
          // 유효한 QR 코드가 있으면 반환
          const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
          if (!existingQR.qr_code.startsWith('http')) {
            existingQR.qr_code = `${baseUrl}/qr/${existingQR.qr_code}`
          }
          return { success: true, qrCode: existingQR as AttendanceQRCode }
        }
      }
    }

    // 새 QR 코드 생성 (URL 기반 - 핸드폰 카메라 직접 스캔 가능)
    const uuid = crypto.randomUUID()
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const qrCodeValue = `${baseUrl}/qr/${uuid}`

    // QR 코드 저장
    const { data: newQR, error: insertError } = await supabase
      .from('attendance_qr_codes')
      .insert({
        clinic_id,
        branch_id, // 지점 ID 포함
        qr_code: uuid, // UUID만 저장 (URL은 프론트엔드에서 동적 생성)
        valid_date: today,
        valid_until: validUntil,
        validity_type,
        validity_days: validityDays,
        latitude,
        longitude,
        radius_meters,
        is_active: true,
        expires_at: expiresAt,
      })
      .select()
      .single()

    // 반환 시 전체 URL로 변환
    if (newQR) {
      newQR.qr_code = qrCodeValue
    }

    if (insertError) {
      console.error('[generateDailyQRCode] Error:', insertError)
      return { success: false, error: insertError.message }
    }

    return { success: true, qrCode: newQR as AttendanceQRCode }
  } catch (error: any) {
    console.error('[generateDailyQRCode] Unexpected error:', error)
    return { success: false, error: error.message || 'Failed to generate QR code' }
  }
}

/**
 * QR 코드 조회 함수
 * 오늘 유효한 QR 코드를 조회합니다 (유효 기간 범위 내)
 */
export async function getQRCodeForToday(
  clinicId: string,
  branchId?: string
): Promise<{ success: boolean; qrCode?: AttendanceQRCode; error?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const today = getKoreanDateString()

    // 오늘이 유효 기간 내에 있는 QR 코드 조회
    let query = supabase
      .from('attendance_qr_codes')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .lte('valid_date', today) // 시작일이 오늘 이전이거나 오늘
      .order('created_at', { ascending: false })

    // branch_id 조건 추가 (하위 호환성 유지)
    if (branchId) {
      query = query.eq('branch_id', branchId)
    } else {
      query = query.is('branch_id', null)
    }

    const { data: qrList, error } = await query

    if (error) {
      console.error('[getQRCodeForToday] Query error:', error)
      return { success: false, error: error.message }
    }

    if (!qrList || qrList.length === 0) {
      return { success: false, error: 'QR code not found' }
    }

    // 유효 기간 내의 QR 코드 찾기
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

    for (const qr of qrList) {
      const validUntil = qr.valid_until || qr.valid_date
      if (validUntil >= today) {
        // qr_code가 이미 URL 형식이 아니면 변환
        if (!qr.qr_code.startsWith('http')) {
          qr.qr_code = `${baseUrl}/qr/${qr.qr_code}`
        }
        return { success: true, qrCode: qr as AttendanceQRCode }
      }
    }

    return { success: false, error: 'No valid QR code found for today' }
  } catch (error: any) {
    console.error('[getQRCodeForToday] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 위치 거리 계산 함수 (Haversine 공식)
 * 두 좌표 간의 거리를 미터 단위로 계산합니다.
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3 // 지구 반지름 (미터)
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // 미터 단위
}

/**
 * GPS 좌표로 가장 가까운 지점 찾기
 * @param clinicId 병원 ID
 * @param latitude 사용자 위도
 * @param longitude 사용자 경도
 * @returns 가장 가까운 지점 정보 또는 null
 */
async function findNearestBranch(
  clinicId: string,
  latitude: number,
  longitude: number
): Promise<{
  branch: ClinicBranch
  distance: number
  withinRadius: boolean
} | null> {
  // 1. 모든 활성 지점 조회
  const result = await getBranches({
    clinic_id: clinicId,
    is_active: true,
  })

  if (!result.success || !result.branches) {
    console.log('[findNearestBranch] Failed to load branches:', result.error)
    return null
  }

  // 2. 위치 정보가 있는 지점만 필터링
  const branchesWithLocation = result.branches.filter(
    (b) => b.latitude && b.longitude
  )

  if (branchesWithLocation.length === 0) {
    console.log('[findNearestBranch] No branches with location data')
    return null
  }

  console.log('[findNearestBranch] Found branches with location:', branchesWithLocation.length)

  // 3. 각 지점과의 거리 계산
  const distances = branchesWithLocation.map((branch) => ({
    branch,
    distance: calculateDistance(
      latitude,
      longitude,
      branch.latitude!,
      branch.longitude!
    ),
  }))

  // 4. 가장 가까운 지점 선택
  distances.sort((a, b) => a.distance - b.distance)
  const nearest = distances[0]

  console.log('[findNearestBranch] Nearest branch:', {
    name: nearest.branch.branch_name,
    distance: Math.round(nearest.distance),
    radius: nearest.branch.attendance_radius_meters,
  })

  return {
    branch: nearest.branch,
    distance: Math.round(nearest.distance),
    withinRadius: nearest.distance <= nearest.branch.attendance_radius_meters,
  }
}

/**
 * QR 코드 검증 함수
 * QR 코드의 유효성과 위치를 검증합니다.
 */
export async function validateQRCode(
  request: QRCodeValidationRequest
): Promise<QRCodeValidationResult> {
  const supabase = createClient()
  if (!supabase) {
    return { is_valid: false, error_message: 'Database connection not available' }
  }

  try {
    let { qr_code } = request
    const { latitude, longitude } = request

    // URL에서 UUID 추출 (예: https://domain.com/qr/uuid → uuid)
    if (qr_code.includes('/qr/')) {
      const parts = qr_code.split('/qr/')
      qr_code = parts[parts.length - 1]
    }

    // QR 코드 조회
    const { data: qrData, error: qrError } = await supabase
      .from('attendance_qr_codes')
      .select('*')
      .eq('qr_code', qr_code)
      .eq('is_active', true)
      .single()

    if (qrError || !qrData) {
      console.error('[validateQRCode] QR code not found or inactive:', qrError)
      return { is_valid: false, error_message: 'QR 코드를 찾을 수 없거나 비활성화되었습니다. QR 코드가 올바른지 확인하거나 관리자에게 문의해주세요.' }
    }

    const qrCode = qrData as AttendanceQRCode

    // 날짜 검증 (유효 기간 범위 확인)
    const today = getKoreanDateString()
    const validFrom = qrCode.valid_date
    const validUntil = qrCode.valid_until || qrCode.valid_date // valid_until이 없으면 당일만 유효

    if (today < validFrom || today > validUntil) {
      return {
        is_valid: false,
        error_message: `QR 코드가 만료되었습니다. 이 QR 코드는 ${validFrom}부터 ${validUntil}까지 유효합니다. 관리자에게 새로운 QR 코드를 요청해주세요.`
      }
    }

    // 위치 검증 (위치 정보가 있는 경우)
    if (latitude && longitude && qrCode.latitude && qrCode.longitude) {
      const distance = calculateDistance(
        latitude,
        longitude,
        qrCode.latitude,
        qrCode.longitude
      )

      if (distance > qrCode.radius_meters) {
        return {
          is_valid: false,
          error_message: `현재 위치가 병원에서 ${Math.round(distance)}m 떨어져 있습니다. ${qrCode.radius_meters}m 이내로 가까이 이동한 후 다시 시도해주세요.`,
          distance_meters: Math.round(distance),
        }
      }

      return {
        is_valid: true,
        clinic_id: qrCode.clinic_id,
        branch_id: qrCode.branch_id || undefined,
        distance_meters: Math.round(distance),
      }
    }

    // 위치 정보가 없으면 QR 코드만 검증
    return {
      is_valid: true,
      clinic_id: qrCode.clinic_id,
      branch_id: qrCode.branch_id || undefined,
    }
  } catch (error: any) {
    console.error('[validateQRCode] Error:', error)
    return { is_valid: false, error_message: error.message || 'Validation failed' }
  }
}

/**
 * 사용자의 근무 스케줄 조회
 * users.work_schedule JSONB에서 조회
 */
async function getUserScheduleForDate(
  userId: string,
  date: string
): Promise<{ start_time?: string; end_time?: string } | null> {
  const supabase = createClient()
  if (!supabase) return null

  try {
    // 날짜 문자열에서 로컬 시간대 기준으로 요일 계산
    // new Date("YYYY-MM-DD")는 UTC로 해석되어 시간대에 따라 요일이 달라질 수 있음
    const dayOfWeek = getDayOfWeekFromDateString(date)

    // 요일 숫자를 요일명으로 매핑
    const dayMap: Record<number, string> = {
      0: 'sunday',
      1: 'monday',
      2: 'tuesday',
      3: 'wednesday',
      4: 'thursday',
      5: 'friday',
      6: 'saturday',
    }
    const dayName = dayMap[dayOfWeek]

    // users.work_schedule에서 조회
    const { data, error } = await supabase
      .from('users')
      .select('work_schedule')
      .eq('id', userId)
      .single()

    if (error || !data || !data.work_schedule) {
      console.warn(`[getUserScheduleForDate] No work_schedule for user ${userId}`)
      return null
    }

    const daySchedule = data.work_schedule[dayName]

    if (!daySchedule || !daySchedule.isWorking) {
      // 휴무일
      return null
    }

    // 시간 형식을 HH:MM:SS로 정규화하는 함수
    const normalizeTimeFormat = (time: string | undefined): string | undefined => {
      if (!time) return undefined

      // 이미 HH:MM:SS 형식인지 확인 (콜론이 2개면 이미 초까지 포함)
      const colonCount = (time.match(/:/g) || []).length
      if (colonCount === 2) {
        // 이미 HH:MM:SS 형식이면 그대로 반환
        return time
      } else if (colonCount === 1) {
        // HH:MM 형식이면 :00 추가
        return `${time}:00`
      }

      // 예상치 못한 형식이면 그대로 반환 (에러 방지)
      return time
    }

    const start_time = normalizeTimeFormat(daySchedule.start)
    const end_time = normalizeTimeFormat(daySchedule.end)

    return {
      start_time,
      end_time,
    }
  } catch (error) {
    console.error('[getUserScheduleForDate] Error:', error)
    return null
  }
}

/**
 * QR 코드 스캔 시 자동으로 출근/퇴근 판단하여 처리
 * 핸드폰 카메라로 QR 코드를 직접 스캔하면 호출됨
 */
export async function autoCheckInOut(request: {
  user_id: string
  qr_code: string  // UUID 또는 전체 URL
  latitude?: number
  longitude?: number
  device_info?: string
}): Promise<AttendanceCheckResponse> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, message: 'Database connection not available' }
  }

  try {
    const { user_id, latitude, longitude, device_info } = request
    let { qr_code } = request

    // URL에서 UUID 추출 (예: https://domain.com/qr/uuid → uuid)
    if (qr_code.includes('/qr/')) {
      const parts = qr_code.split('/qr/')
      qr_code = parts[parts.length - 1]
    }

    // 오늘 날짜
    const today = getKoreanDateString()

    // 오늘 출퇴근 기록 확인
    const { data: todayRecord } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', user_id)
      .eq('work_date', today)
      .maybeSingle()

    // 출근/퇴근 자동 판단
    if (!todayRecord || !todayRecord.check_in_time) {
      // 출근 처리
      return await checkIn({
        user_id,
        qr_code,
        work_date: today,
        latitude,
        longitude,
        device_info,
      })
    } else if (!todayRecord.check_out_time) {
      // 퇴근 처리
      return await checkOut({
        user_id,
        qr_code,
        work_date: today,
        latitude,
        longitude,
        device_info,
      })
    } else {
      // 이미 퇴근 완료
      return {
        success: false,
        message: '오늘 이미 퇴근하셨습니다.',
        record: todayRecord as AttendanceRecord,
      }
    }
  } catch (error: any) {
    console.error('[autoCheckInOut] Error:', error)
    return {
      success: false,
      message: error.message || 'Auto check-in/out failed',
    }
  }
}

/**
 * 출근 체크 함수
 */
export async function checkIn(request: CheckInRequest): Promise<AttendanceCheckResponse> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, message: '데이터베이스 연결을 사용할 수 없습니다. 네트워크 연결을 확인하거나 관리자에게 문의해주세요.' }
  }

  try {
    const { user_id, qr_code, work_date, latitude, longitude, device_info } = request

    // QR 코드 검증
    const validation = await validateQRCode({
      qr_code,
      user_id,
      latitude,
      longitude,
      device_info,
    })

    if (!validation.is_valid) {
      return {
        success: false,
        message: validation.error_message || 'QR 코드 검증에 실패했습니다. 올바른 QR 코드인지 확인해주세요.',
      }
    }

    // 통합 QR인 경우 (branch_id가 없음) → GPS로 지점 자동 감지
    let finalBranchId = validation.branch_id
    let detectedBranchName: string | undefined

    if (!validation.branch_id && latitude && longitude && validation.clinic_id) {
      console.log('[checkIn] 통합 QR 감지, GPS로 지점 찾기 시작')
      const nearestBranch = await findNearestBranch(
        validation.clinic_id,
        latitude,
        longitude
      )

      if (nearestBranch) {
        if (!nearestBranch.withinRadius) {
          return {
            success: false,
            message: `가장 가까운 지점(${nearestBranch.branch.branch_name})에서 ${nearestBranch.distance}m 떨어져 있습니다. ${nearestBranch.branch.attendance_radius_meters}m 이내로 접근해주세요.`,
          }
        }
        finalBranchId = nearestBranch.branch.id
        detectedBranchName = nearestBranch.branch.branch_name
        console.log('[checkIn] 자동 감지된 지점:', detectedBranchName)
      } else {
        console.log('[checkIn] 지점 자동 감지 실패, branch_id=null로 저장')
      }
    }

    // 이미 출근 기록이 있는지 확인
    const { data: existingRecord, error: checkError } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', user_id)
      .eq('work_date', work_date)
      .single()

    if (existingRecord && existingRecord.check_in_time) {
      return {
        success: false,
        message: '오늘 이미 출근하셨습니다.',
        record: existingRecord as AttendanceRecord,
      }
    }

    // 사용자의 근무 스케줄 조회
    const schedule = await getUserScheduleForDate(user_id, work_date)

    const checkInTime = new Date().toISOString()

    // 지각 여부 계산 (트리거에 의존하지 않고 직접 계산)
    const lateStatus = calculateLateStatus(checkInTime, schedule?.start_time)
    console.log('[checkIn] 지각 계산 결과:', {
      checkInTime,
      scheduledStart: schedule?.start_time,
      ...lateStatus
    })

    // 출근 기록 저장 또는 업데이트
    if (existingRecord) {
      // 기존 레코드 업데이트
      const { data: updatedRecord, error: updateError } = await supabase
        .from('attendance_records')
        .update({
          check_in_time: checkInTime,
          check_in_latitude: latitude,
          check_in_longitude: longitude,
          check_in_device_info: device_info,
          scheduled_start: schedule?.start_time,
          scheduled_end: schedule?.end_time,
          branch_id: finalBranchId,
          // 지각 정보 직접 저장 (트리거 의존성 제거)
          late_minutes: lateStatus.lateMinutes,
          status: lateStatus.status,
        })
        .eq('id', existingRecord.id)
        .select()
        .single()

      if (updateError) {
        console.error('[checkIn] Update error:', updateError)
        return { success: false, message: `출근 기록 업데이트 실패: ${updateError.message}` }
      }

      return {
        success: true,
        message: '출근 처리되었습니다.',
        record: updatedRecord as AttendanceRecord,
      }
    } else {
      // 새 레코드 생성
      const { data: newRecord, error: insertError } = await supabase
        .from('attendance_records')
        .insert({
          user_id,
          clinic_id: validation.clinic_id,
          branch_id: finalBranchId,
          work_date,
          check_in_time: checkInTime,
          check_in_latitude: latitude,
          check_in_longitude: longitude,
          check_in_device_info: device_info,
          scheduled_start: schedule?.start_time,
          scheduled_end: schedule?.end_time,
          // 지각 정보 직접 저장 (트리거 의존성 제거)
          late_minutes: lateStatus.lateMinutes,
          status: lateStatus.status,
        })
        .select()
        .single()

      if (insertError) {
        console.error('[checkIn] Insert error:', insertError)
        return { success: false, message: `출근 기록 생성 실패: ${insertError.message}` }
      }

      return {
        success: true,
        message: '출근 처리되었습니다.',
        record: newRecord as AttendanceRecord,
      }
    }
  } catch (error: any) {
    console.error('[checkIn] Unexpected error:', error)
    return { success: false, message: error.message || '출근 처리 중 예기치 않은 오류가 발생했습니다. 관리자에게 문의해주세요.' }
  }
}

/**
 * 퇴근 체크 함수
 */
export async function checkOut(request: CheckOutRequest): Promise<AttendanceCheckResponse> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, message: '데이터베이스 연결을 사용할 수 없습니다. 네트워크 연결을 확인하거나 관리자에게 문의해주세요.' }
  }

  try {
    const { user_id, qr_code, work_date, latitude, longitude, device_info } = request

    // QR 코드 검증
    const validation = await validateQRCode({
      qr_code,
      user_id,
      latitude,
      longitude,
      device_info,
    })

    if (!validation.is_valid) {
      return {
        success: false,
        message: validation.error_message || 'QR 코드 검증에 실패했습니다. 올바른 QR 코드인지 확인해주세요.',
      }
    }

    // 출근 기록 확인
    const { data: existingRecord, error: checkError } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', user_id)
      .eq('work_date', work_date)
      .single()

    if (!existingRecord) {
      return {
        success: false,
        message: '출근 기록이 없습니다. 먼저 출근해주세요.',
      }
    }

    if (!existingRecord.check_in_time) {
      return {
        success: false,
        message: '출근 시간이 기록되지 않았습니다. 먼저 출근해주세요.',
      }
    }

    if (existingRecord.check_out_time) {
      return {
        success: false,
        message: '오늘 이미 퇴근하셨습니다.',
        record: existingRecord as AttendanceRecord,
      }
    }

    const checkOutTime = new Date().toISOString()

    // 퇴근 기록 업데이트
    const { data: updatedRecord, error: updateError } = await supabase
      .from('attendance_records')
      .update({
        check_out_time: checkOutTime,
        check_out_latitude: latitude,
        check_out_longitude: longitude,
        check_out_device_info: device_info,
      })
      .eq('id', existingRecord.id)
      .select()
      .single()

    if (updateError) {
      console.error('[checkOut] Update error:', updateError)
      return { success: false, message: `퇴근 기록 업데이트 실패: ${updateError.message}` }
    }

    return {
      success: true,
      message: '퇴근 처리되었습니다.',
      record: updatedRecord as AttendanceRecord,
    }
  } catch (error: any) {
    console.error('[checkOut] Unexpected error:', error)
    return { success: false, message: error.message || '퇴근 처리 중 예기치 않은 오류가 발생했습니다. 관리자에게 문의해주세요.' }
  }
}

/**
 * 출퇴근 기록 조회 함수
 */
export async function getAttendanceRecords(
  filter: AttendanceFilter,
  page: number = 1,
  pageSize: number = 50
): Promise<AttendanceRecordsResponse> {
  const supabase = createClient()
  if (!supabase) {
    return { records: [], total_count: 0, page, page_size: pageSize, has_more: false }
  }

  try {
    const { clinic_id, branch_id, user_id, start_date, end_date, status } = filter

    let query = supabase
      .from('attendance_records')
      .select('*', { count: 'exact' })
      .eq('clinic_id', clinic_id)
      .gte('work_date', start_date)
      .lte('work_date', end_date)
      .order('work_date', { ascending: false })

    if (branch_id) {
      query = query.eq('branch_id', branch_id)
    }

    if (user_id) {
      query = query.eq('user_id', user_id)
    }

    if (status) {
      query = query.eq('status', status)
    }

    // 페이지네이션
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      console.error('[getAttendanceRecords] Error:', error)
      return { records: [], total_count: 0, page, page_size: pageSize, has_more: false }
    }

    return {
      records: (data || []) as AttendanceRecord[],
      total_count: count || 0,
      page,
      page_size: pageSize,
      has_more: (count || 0) > page * pageSize,
    }
  } catch (error) {
    console.error('[getAttendanceRecords] Unexpected error:', error)
    return { records: [], total_count: 0, page, page_size: pageSize, has_more: false }
  }
}

/**
 * 특정 사용자의 오늘 출퇴근 기록 조회
 * 기존 기록의 지각 여부가 잘못된 경우 재계산하여 업데이트
 */
export async function getTodayAttendance(
  userId: string
): Promise<{ success: boolean; record?: AttendanceRecord; error?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const today = getKoreanDateString()

    const { data, error } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', userId)
      .eq('work_date', today)
      .maybeSingle()

    if (error) {
      console.error('[getTodayAttendance] Error:', error)
      return { success: false, error: error.message }
    }

    // 기록이 있고, 출근 시간과 예정 출근 시간이 있는 경우 지각 여부 재계산
    if (data && data.check_in_time && data.scheduled_start) {
      const lateStatus = calculateLateStatus(data.check_in_time, data.scheduled_start)

      // 현재 저장된 상태와 다르면 업데이트
      if (data.status !== lateStatus.status || data.late_minutes !== lateStatus.lateMinutes) {
        console.log('[getTodayAttendance] 지각 상태 재계산 및 업데이트:', {
          recordId: data.id,
          oldStatus: data.status,
          newStatus: lateStatus.status,
          oldLateMinutes: data.late_minutes,
          newLateMinutes: lateStatus.lateMinutes
        })

        const { data: updatedRecord, error: updateError } = await supabase
          .from('attendance_records')
          .update({
            late_minutes: lateStatus.lateMinutes,
            status: lateStatus.status,
          })
          .eq('id', data.id)
          .select()
          .single()

        if (updateError) {
          console.error('[getTodayAttendance] Update error:', updateError)
          // 업데이트 실패해도 기존 데이터 반환
          return { success: true, record: data as AttendanceRecord }
        }

        return { success: true, record: updatedRecord as AttendanceRecord }
      }
    }

    return { success: true, record: data as AttendanceRecord | undefined }
  } catch (error: any) {
    console.error('[getTodayAttendance] Unexpected error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 월별 근태 통계 조회
 */
export async function getMonthlyStatistics(
  userId: string,
  year: number,
  month: number
): Promise<{ success: boolean; statistics?: AttendanceStatistics; error?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const { data, error } = await supabase
      .from('attendance_statistics')
      .select('*')
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('[getMonthlyStatistics] Error:', error)
      return { success: false, error: error.message }
    }

    return { success: true, statistics: data as AttendanceStatistics | undefined }
  } catch (error: any) {
    console.error('[getMonthlyStatistics] Unexpected error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 월별 근태 통계 업데이트 (수동 트리거)
 */
export async function updateMonthlyStatistics(
  userId: string,
  year: number,
  month: number
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    // Supabase RPC를 사용하여 PostgreSQL 함수 호출
    const { error } = await supabase.rpc('update_monthly_statistics', {
      p_user_id: userId,
      p_year: year,
      p_month: month,
    })

    if (error) {
      console.error('[updateMonthlyStatistics] Error:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    console.error('[updateMonthlyStatistics] Unexpected error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 팀 출근 현황 조회 (관리자용)
 */
export async function getTeamAttendanceStatus(
  clinicId: string,
  date: string,
  branchId?: string
): Promise<{ success: boolean; status?: TeamAttendanceStatus; error?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    // 클리닉의 모든 직원 조회 (지점별 필터링)
    let usersQuery = supabase
      .from('users')
      .select('id, name, role')
      .eq('clinic_id', clinicId)
      .eq('status', 'active')

    if (branchId) {
      // primary_branch_id가 일치하거나 NULL인 사용자 포함 (지점 미배정 직원)
      usersQuery = usersQuery.or(`primary_branch_id.eq.${branchId},primary_branch_id.is.null`)
    }

    const { data: users, error: usersError } = await usersQuery

    if (usersError) {
      return { success: false, error: usersError.message }
    }

    // 직원이 없으면 빈 상태 반환
    if (!users || users.length === 0) {
      return {
        success: true,
        status: {
          date,
          total_employees: 0,
          checked_in: 0,
          checked_out: 0,
          not_checked_in: 0,
          on_leave: 0,
          late_count: 0,
          early_leave_count: 0,
          overtime_count: 0,
          employees: [],
        },
      }
    }

    // user_id 리스트 추출
    const userIds = users.map((u: { id: string }) => u.id)

    // 해당 날짜의 출퇴근 기록 조회 (user_id IN 방식 - branch_id 불일치 문제 해결)
    const { data: records, error: recordsError } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('work_date', date)
      .in('user_id', userIds)

    if (recordsError) {
      return { success: false, error: recordsError.message }
    }

    const recordMap = new Map(records?.map((r: AttendanceRecord) => [r.user_id, r]) || [])

    type EmployeeStatusItem = {
      user_id: string
      user_name: string
      status: AttendanceStatus
      check_in_time?: string | null
      check_out_time?: string | null
      scheduled_start?: string | null
      scheduled_end?: string | null
      late_minutes: number
      early_leave_minutes: number
      overtime_minutes: number
      total_work_minutes?: number | null
    }

    const employees: EmployeeStatusItem[] = (users || []).map((user: { id: string; name: string; role: string }) => {
      const record = recordMap.get(user.id) as AttendanceRecord | undefined

      return {
        user_id: user.id,
        user_name: user.name,
        status: record?.status || 'absent',
        check_in_time: record?.check_in_time,
        check_out_time: record?.check_out_time,
        scheduled_start: record?.scheduled_start,
        scheduled_end: record?.scheduled_end,
        late_minutes: record?.late_minutes || 0,
        early_leave_minutes: record?.early_leave_minutes || 0,
        overtime_minutes: record?.overtime_minutes || 0,
        total_work_minutes: record?.total_work_minutes,
      }
    })

    const checkedIn = employees.filter((e) => e.check_in_time).length
    const checkedOut = employees.filter((e) => e.check_out_time).length
    const onLeave = employees.filter((e) => e.status === 'leave').length
    const lateCount = employees.filter((e) => e.late_minutes > 0).length
    const earlyLeaveCount = employees.filter((e) => e.early_leave_minutes > 0).length
    const overtimeCount = employees.filter((e) => e.overtime_minutes > 0).length

    return {
      success: true,
      status: {
        date,
        total_employees: employees.length,
        checked_in: checkedIn,
        checked_out: checkedOut,
        not_checked_in: employees.length - checkedIn - onLeave,
        on_leave: onLeave,
        late_count: lateCount,
        early_leave_count: earlyLeaveCount,
        overtime_count: overtimeCount,
        employees,
      },
    }
  } catch (error: any) {
    console.error('[getTeamAttendanceStatus] Unexpected error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 출퇴근 기록 수정 (관리자용)
 */
export async function editAttendanceRecord(
  request: AttendanceEditRequest
): Promise<{ success: boolean; record?: AttendanceRecord; error?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const { record_id, check_in_time, check_out_time, status, notes, edited_by } = request

    const updateData: any = {
      is_manually_edited: true,
      edited_by,
      edited_at: new Date().toISOString(),
    }

    if (check_in_time) updateData.check_in_time = check_in_time
    if (check_out_time) updateData.check_out_time = check_out_time
    if (status) updateData.status = status
    if (notes !== undefined) updateData.notes = notes

    const { data, error } = await supabase
      .from('attendance_records')
      .update(updateData)
      .eq('id', record_id)
      .select()
      .single()

    if (error) {
      console.error('[editAttendanceRecord] Error:', error)
      return { success: false, error: error.message }
    }

    return { success: true, record: data as AttendanceRecord }
  } catch (error: any) {
    console.error('[editAttendanceRecord] Unexpected error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 모든 직원의 월별 통계 조회 (관리자용)
 * 직원별 근무 스케줄 기반으로 정확한 근태 통계 계산
 *
 * 계산 로직:
 * - 근무일: 직원 근무 스케줄 기반 해당 월의 총 근무해야 하는 일수
 * - 출근일: 출근 기록이 있는 일수 (present, late, early_leave)
 * - 결근일: 근무일 - 출근일 - 연차사용일
 */
export async function getAllUsersMonthlyStatistics(
  clinicId: string,
  year: number,
  month: number,
  branchId?: string
): Promise<{
  success: boolean
  statistics?: (AttendanceStatistics & { user_name: string })[]
  error?: string
}> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    // 해당 클리닉의 활성 직원 목록 조회 (work_schedule 포함)
    let usersQuery = supabase
      .from('users')
      .select('id, name, work_schedule')
      .eq('clinic_id', clinicId)
      .eq('status', 'active')

    if (branchId) {
      usersQuery = usersQuery.or(`primary_branch_id.eq.${branchId},primary_branch_id.is.null`)
    }

    const { data: users, error: usersError } = await usersQuery

    if (usersError) {
      return { success: false, error: usersError.message }
    }

    if (!users || users.length === 0) {
      return { success: true, statistics: [] }
    }

    // 해당 월의 모든 출퇴근 기록 조회
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const userIds = users.map((u: { id: string; name: string; work_schedule?: WorkSchedule }) => u.id)

    const { data: allRecords, error: recordsError } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('clinic_id', clinicId)
      .in('user_id', userIds)
      .gte('work_date', startDate)
      .lte('work_date', endDate)

    if (recordsError) {
      return { success: false, error: recordsError.message }
    }

    // 사용자별 기록 그룹화
    const recordsByUser = new Map<string, AttendanceRecord[]>()
    for (const record of allRecords || []) {
      const userRecords = recordsByUser.get(record.user_id) || []
      userRecords.push(record)
      recordsByUser.set(record.user_id, userRecords)
    }

    // 각 직원별 통계 계산
    const statistics: (AttendanceStatistics & { user_name: string })[] = users.map(
      (user: { id: string; name: string; work_schedule?: WorkSchedule }) => {
        // 직원 근무 스케줄 기반 근무일수 계산
        const workSchedule = user.work_schedule as WorkSchedule | undefined
        const totalWorkDays = getScheduledWorkDaysFromSchedule(year, month, workSchedule)

        // 해당 직원의 출퇴근 기록
        const userRecords = recordsByUser.get(user.id) || []

        // 통계 계산
        const stats = calculateAttendanceStatsFromRecords(userRecords, totalWorkDays)

        // 출근율 계산
        const attendanceRate = totalWorkDays > 0
          ? Math.round(((stats.presentDays + stats.leaveDays) / totalWorkDays) * 1000) / 10
          : 0

        // 평균 계산
        const avgWorkMinutesPerDay = stats.presentDays > 0
          ? Math.round(stats.totalWorkMinutes / stats.presentDays)
          : 0
        const avgLateMinutes = stats.lateCount > 0
          ? Math.round(stats.totalLateMinutes / stats.lateCount)
          : 0
        const avgEarlyLeaveMinutes = stats.earlyLeaveCount > 0
          ? Math.round(stats.totalEarlyLeaveMinutes / stats.earlyLeaveCount)
          : 0
        const avgOvertimeMinutes = stats.overtimeCount > 0
          ? Math.round(stats.totalOvertimeMinutes / stats.overtimeCount)
          : 0

        return {
          id: '',
          user_id: user.id,
          clinic_id: clinicId,
          year,
          month,
          total_work_days: totalWorkDays,
          present_days: stats.presentDays,
          absent_days: stats.absentDays,
          leave_days: stats.leaveDays,
          holiday_days: stats.holidayDays,
          late_count: stats.lateCount,
          total_late_minutes: stats.totalLateMinutes,
          avg_late_minutes: avgLateMinutes,
          early_leave_count: stats.earlyLeaveCount,
          total_early_leave_minutes: stats.totalEarlyLeaveMinutes,
          avg_early_leave_minutes: avgEarlyLeaveMinutes,
          overtime_count: stats.overtimeCount,
          total_overtime_minutes: stats.totalOvertimeMinutes,
          avg_overtime_minutes: avgOvertimeMinutes,
          total_work_minutes: stats.totalWorkMinutes,
          avg_work_minutes_per_day: avgWorkMinutesPerDay,
          attendance_rate: attendanceRate,
          last_calculated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          user_name: user.name,
        }
      }
    )

    return {
      success: true,
      statistics: statistics.sort((a, b) =>
        a.user_name.localeCompare(b.user_name, 'ko')
      ),
    }
  } catch (error: any) {
    console.error('[getAllUsersMonthlyStatistics] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 특정 직원의 월별 상세 기록 조회 (관리자용)
 */
export async function getUserMonthlyRecords(
  userId: string,
  year: number,
  month: number
): Promise<{
  success: boolean
  records?: AttendanceRecord[]
  error?: string
}> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const { data, error } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', userId)
      .gte('work_date', startDate)
      .lte('work_date', endDate)
      .order('work_date', { ascending: true })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, records: data as AttendanceRecord[] }
  } catch (error: any) {
    console.error('[getUserMonthlyRecords] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 모든 직원의 월별 통계 일괄 갱신 (관리자용)
 */
export async function refreshAllUsersMonthlyStatistics(
  clinicId: string,
  year: number,
  month: number,
  branchId?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    // 해당 클리닉의 활성 직원 목록 조회
    let usersQuery = supabase
      .from('users')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('status', 'active')

    if (branchId) {
      usersQuery = usersQuery.or(`primary_branch_id.eq.${branchId},primary_branch_id.is.null`)
    }

    const { data: users, error: usersError } = await usersQuery

    if (usersError) {
      return { success: false, error: usersError.message }
    }

    if (!users || users.length === 0) {
      return { success: true }
    }

    // 각 직원의 통계 갱신
    for (const user of users) {
      await supabase.rpc('update_monthly_statistics', {
        p_user_id: user.id,
        p_year: year,
        p_month: month,
      })
    }

    return { success: true }
  } catch (error: any) {
    console.error('[refreshAllUsersMonthlyStatistics] Error:', error)
    return { success: false, error: error.message }
  }
}

export const attendanceService = {
  generateDailyQRCode,
  getQRCodeForToday,
  validateQRCode,
  autoCheckInOut,
  checkIn,
  checkOut,
  getAttendanceRecords,
  getTodayAttendance,
  getMonthlyStatistics,
  updateMonthlyStatistics,
  getTeamAttendanceStatus,
  editAttendanceRecord,
  getAllUsersMonthlyStatistics,
  getUserMonthlyRecords,
  refreshAllUsersMonthlyStatistics,
}
