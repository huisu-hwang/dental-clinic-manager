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
    const today = new Date().toISOString().split('T')[0]

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
    const today = new Date().toISOString().split('T')[0]

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
 * UUID 추출 및 정규화 함수
 * URL이나 문자열에서 UUID만 추출합니다.
 * 안드로이드/iOS 브라우저 간 차이로 인한 숨겨진 문자 문제 해결
 */
function extractUUID(input: string): { uuid: string | null; original: string; cleaned: string } {
  const original = input
  // 1. 기본 정리: 공백, 줄바꿈, 캐리지리턴 제거
  let cleaned = input.trim().replace(/[\r\n\s]/g, '')

  // 2. URL에서 경로 추출 (/qr/ 이후 부분)
  if (cleaned.includes('/qr/')) {
    const parts = cleaned.split('/qr/')
    cleaned = parts[parts.length - 1]
  }

  // 3. 쿼리 파라미터 제거 (?이후 제거)
  if (cleaned.includes('?')) {
    cleaned = cleaned.split('?')[0]
  }

  // 4. 해시 제거 (#이후 제거)
  if (cleaned.includes('#')) {
    cleaned = cleaned.split('#')[0]
  }

  // 5. URL 디코딩 (인코딩된 문자 처리)
  try {
    cleaned = decodeURIComponent(cleaned)
  } catch {
    // 디코딩 실패 시 그대로 사용
  }

  // 6. UUID 형식 검증 (하이픈 포함 36자 또는 하이픈 없이 32자)
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
  const uuidRegexNoHyphen = /^[0-9a-fA-F]{32}$/

  if (uuidRegex.test(cleaned)) {
    return { uuid: cleaned.toLowerCase(), original, cleaned }
  }

  if (uuidRegexNoHyphen.test(cleaned)) {
    // 하이픈 없는 UUID를 하이픈 있는 형식으로 변환
    const formatted = `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}-${cleaned.slice(16, 20)}-${cleaned.slice(20)}`
    return { uuid: formatted.toLowerCase(), original, cleaned }
  }

  // 7. 문자열 내에서 UUID 패턴 찾기 (마지막 시도)
  const uuidMatch = cleaned.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)
  if (uuidMatch) {
    return { uuid: uuidMatch[0].toLowerCase(), original, cleaned }
  }

  return { uuid: null, original, cleaned }
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
    const { qr_code: rawQrCode } = request
    const { latitude, longitude } = request

    // UUID 추출 (안드로이드/iOS 호환성 처리)
    const { uuid: qr_code, original, cleaned } = extractUUID(rawQrCode)

    // UUID 추출 실패 시 상세 오류 메시지
    if (!qr_code) {
      console.error('[validateQRCode] UUID extraction failed:', { original, cleaned })
      return {
        is_valid: false,
        error_message: `QR 코드 형식이 올바르지 않습니다. (입력값: ${cleaned.substring(0, 50)}${cleaned.length > 50 ? '...' : ''})`
      }
    }

    // QR 코드 조회
    const { data: qrData, error: qrError } = await supabase
      .from('attendance_qr_codes')
      .select('*')
      .eq('qr_code', qr_code)
      .eq('is_active', true)
      .single()

    if (qrError || !qrData) {
      console.error('[validateQRCode] QR code not found:', { qr_code, error: qrError?.message })
      return {
        is_valid: false,
        error_message: `QR 코드를 찾을 수 없습니다. 관리자에게 새 QR 코드를 요청하세요. (코드: ${qr_code.substring(0, 8)}...)`
      }
    }

    const qrCode = qrData as AttendanceQRCode

    // 날짜 검증 (유효 기간 범위 확인)
    const today = new Date().toISOString().split('T')[0]
    const validFrom = qrCode.valid_date
    const validUntil = qrCode.valid_until || qrCode.valid_date // valid_until이 없으면 당일만 유효

    if (today < validFrom || today > validUntil) {
      return { is_valid: false, error_message: 'QR 코드가 만료되었습니다. 새로운 QR 코드를 스캔해주세요.' }
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
          error_message: `You are ${Math.round(distance)}m away from the clinic. Please come closer (within ${qrCode.radius_meters}m).`,
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
    const dayOfWeek = new Date(date).getDay()

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

    // UUID 추출 (안드로이드/iOS 호환성 처리)
    const { uuid: qr_code, original, cleaned } = extractUUID(request.qr_code)

    if (!qr_code) {
      console.error('[autoCheckInOut] UUID extraction failed:', { original, cleaned })
      return {
        success: false,
        message: `QR 코드 형식이 올바르지 않습니다. (입력값: ${cleaned.substring(0, 50)}${cleaned.length > 50 ? '...' : ''})`
      }
    }

    // 오늘 날짜
    const today = new Date().toISOString().split('T')[0]

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
    return { success: false, message: 'Database connection not available' }
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
        message: validation.error_message || 'QR code validation failed',
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
          branch_id: finalBranchId, // 자동 감지된 또는 QR의 branch_id
        })
        .eq('id', existingRecord.id)
        .select()
        .single()

      if (updateError) {
        console.error('[checkIn] Update error:', updateError)
        return { success: false, message: updateError.message }
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
          branch_id: finalBranchId, // 자동 감지된 또는 QR의 branch_id
          work_date,
          check_in_time: checkInTime,
          check_in_latitude: latitude,
          check_in_longitude: longitude,
          check_in_device_info: device_info,
          scheduled_start: schedule?.start_time,
          scheduled_end: schedule?.end_time,
        })
        .select()
        .single()

      if (insertError) {
        console.error('[checkIn] Insert error:', insertError)
        return { success: false, message: insertError.message }
      }

      return {
        success: true,
        message: '출근 처리되었습니다.',
        record: newRecord as AttendanceRecord,
      }
    }
  } catch (error: any) {
    console.error('[checkIn] Unexpected error:', error)
    return { success: false, message: error.message || 'Check-in failed' }
  }
}

/**
 * 퇴근 체크 함수
 */
export async function checkOut(request: CheckOutRequest): Promise<AttendanceCheckResponse> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, message: 'Database connection not available' }
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
        message: validation.error_message || 'QR code validation failed',
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
      return { success: false, message: updateError.message }
    }

    return {
      success: true,
      message: '퇴근 처리되었습니다.',
      record: updatedRecord as AttendanceRecord,
    }
  } catch (error: any) {
    console.error('[checkOut] Unexpected error:', error)
    return { success: false, message: error.message || 'Check-out failed' }
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
 */
export async function getTodayAttendance(
  userId: string
): Promise<{ success: boolean; record?: AttendanceRecord; error?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const today = new Date().toISOString().split('T')[0]

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
    // 해당 클리닉의 활성 직원 목록 조회
    let usersQuery = supabase
      .from('users')
      .select('id, name')
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

    const userIds = users.map((u: { id: string; name: string }) => u.id)
    const userNameMap = new Map(users.map((u: { id: string; name: string }) => [u.id, u.name]))

    // 해당 월의 통계 조회
    const { data: stats, error: statsError } = await supabase
      .from('attendance_statistics')
      .select('*')
      .eq('year', year)
      .eq('month', month)
      .in('user_id', userIds)

    if (statsError) {
      return { success: false, error: statsError.message }
    }

    const statsWithNames = (stats || []).map((stat: AttendanceStatistics) => ({
      ...stat,
      user_name: userNameMap.get(stat.user_id) || '알 수 없음',
    }))

    // 통계가 없는 사용자도 포함 (0으로 초기화)
    const existingUserIds = new Set(stats?.map((s: AttendanceStatistics) => s.user_id) || [])
    const missingStats = users
      .filter((u: { id: string; name: string }) => !existingUserIds.has(u.id))
      .map((u: { id: string; name: string }) => ({
        id: '',
        user_id: u.id,
        clinic_id: clinicId,
        year,
        month,
        total_work_days: 0,
        present_days: 0,
        absent_days: 0,
        leave_days: 0,
        holiday_days: 0,
        late_count: 0,
        total_late_minutes: 0,
        avg_late_minutes: 0,
        early_leave_count: 0,
        total_early_leave_minutes: 0,
        avg_early_leave_minutes: 0,
        overtime_count: 0,
        total_overtime_minutes: 0,
        avg_overtime_minutes: 0,
        total_work_minutes: 0,
        avg_work_minutes_per_day: 0,
        attendance_rate: 0,
        last_calculated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_name: u.name,
      }))

    return {
      success: true,
      statistics: [...statsWithNames, ...missingStats].sort((a, b) =>
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
