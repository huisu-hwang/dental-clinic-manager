// ============================================
// 출퇴근 관리 서비스
// Attendance Management Service
// ============================================

import { getSupabase } from './supabase'
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
} from '@/types/attendance'

/**
 * QR 코드 생성 함수
 * 병원별로 일일 QR 코드를 생성합니다.
 */
export async function generateDailyQRCode(
  input: QRCodeGenerateInput
): Promise<{ success: boolean; qrCode?: AttendanceQRCode; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const { clinic_id, latitude, longitude, radius_meters = 100 } = input

    // 오늘 날짜
    const today = new Date().toISOString().split('T')[0]

    // 이미 오늘 생성된 QR 코드가 있는지 확인
    const { data: existingQR, error: checkError } = await supabase
      .from('attendance_qr_codes')
      .select('*')
      .eq('clinic_id', clinic_id)
      .eq('valid_date', today)
      .eq('is_active', true)
      .single()

    if (existingQR) {
      // 이미 존재하면 반환
      return { success: true, qrCode: existingQR as AttendanceQRCode }
    }

    // 새 QR 코드 생성 (UUID 기반)
    const qrCodeValue = `ATTENDANCE_${clinic_id}_${today}_${crypto.randomUUID()}`

    // QR 코드 저장
    const { data: newQR, error: insertError } = await supabase
      .from('attendance_qr_codes')
      .insert({
        clinic_id,
        qr_code: qrCodeValue,
        valid_date: today,
        latitude,
        longitude,
        radius_meters,
        is_active: true,
      })
      .select()
      .single()

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
 */
export async function getQRCodeForToday(
  clinicId: string
): Promise<{ success: boolean; qrCode?: AttendanceQRCode; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('attendance_qr_codes')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('valid_date', today)
      .eq('is_active', true)
      .single()

    if (error || !data) {
      return { success: false, error: 'QR code not found for today' }
    }

    return { success: true, qrCode: data as AttendanceQRCode }
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
 * QR 코드 검증 함수
 * QR 코드의 유효성과 위치를 검증합니다.
 */
export async function validateQRCode(
  request: QRCodeValidationRequest
): Promise<QRCodeValidationResult> {
  const supabase = getSupabase()
  if (!supabase) {
    return { is_valid: false, error_message: 'Database connection not available' }
  }

  try {
    const { qr_code, latitude, longitude } = request

    // QR 코드 조회
    const { data: qrData, error: qrError } = await supabase
      .from('attendance_qr_codes')
      .select('*')
      .eq('qr_code', qr_code)
      .eq('is_active', true)
      .single()

    if (qrError || !qrData) {
      return { is_valid: false, error_message: 'Invalid or expired QR code' }
    }

    const qrCode = qrData as AttendanceQRCode

    // 날짜 검증 (오늘만 유효)
    const today = new Date().toISOString().split('T')[0]
    if (qrCode.valid_date !== today) {
      return { is_valid: false, error_message: 'QR code expired. Please scan today\'s QR code.' }
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
        distance_meters: Math.round(distance),
      }
    }

    // 위치 정보가 없으면 QR 코드만 검증
    return {
      is_valid: true,
      clinic_id: qrCode.clinic_id,
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
  const supabase = getSupabase()
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

    // HH:MM 형식을 HH:MM:SS로 변환
    const start_time = daySchedule.start ? `${daySchedule.start}:00` : undefined
    const end_time = daySchedule.end ? `${daySchedule.end}:00` : undefined

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
 * 출근 체크 함수
 */
export async function checkIn(request: CheckInRequest): Promise<AttendanceCheckResponse> {
  const supabase = getSupabase()
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
        message: 'Already checked in for today',
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
        message: 'Checked in successfully',
        record: updatedRecord as AttendanceRecord,
      }
    } else {
      // 새 레코드 생성
      const { data: newRecord, error: insertError } = await supabase
        .from('attendance_records')
        .insert({
          user_id,
          clinic_id: validation.clinic_id,
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
        message: 'Checked in successfully',
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
  const supabase = getSupabase()
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
        message: 'No check-in record found. Please check in first.',
      }
    }

    if (!existingRecord.check_in_time) {
      return {
        success: false,
        message: 'No check-in time recorded. Please check in first.',
      }
    }

    if (existingRecord.check_out_time) {
      return {
        success: false,
        message: 'Already checked out for today',
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
      message: 'Checked out successfully',
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
  const supabase = getSupabase()
  if (!supabase) {
    return { records: [], total_count: 0, page, page_size: pageSize, has_more: false }
  }

  try {
    const { clinic_id, user_id, start_date, end_date, status } = filter

    let query = supabase
      .from('attendance_records')
      .select('*', { count: 'exact' })
      .eq('clinic_id', clinic_id)
      .gte('work_date', start_date)
      .lte('work_date', end_date)
      .order('work_date', { ascending: false })

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
  const supabase = getSupabase()
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
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116은 "not found" 에러
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
  const supabase = getSupabase()
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
  const supabase = getSupabase()
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
  date: string
): Promise<{ success: boolean; status?: TeamAttendanceStatus; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    // 클리닉의 모든 직원 조회
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name, role')
      .eq('clinic_id', clinicId)
      .eq('status', 'active')

    if (usersError) {
      return { success: false, error: usersError.message }
    }

    // 해당 날짜의 출퇴근 기록 조회
    const { data: records, error: recordsError } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('work_date', date)

    if (recordsError) {
      return { success: false, error: recordsError.message }
    }

    const recordMap = new Map(records?.map((r) => [r.user_id, r]) || [])

    const employees = (users || []).map((user) => {
      const record = recordMap.get(user.id) as AttendanceRecord | undefined

      return {
        user_id: user.id,
        user_name: user.name,
        status: record?.status || 'absent',
        check_in_time: record?.check_in_time,
        scheduled_start: record?.scheduled_start,
        late_minutes: record?.late_minutes || 0,
      }
    })

    const checkedIn = employees.filter((e) => e.check_in_time).length
    const onLeave = employees.filter((e) => e.status === 'leave').length
    const lateCount = employees.filter((e) => e.status === 'late').length

    return {
      success: true,
      status: {
        date,
        total_employees: employees.length,
        checked_in: checkedIn,
        not_checked_in: employees.length - checkedIn - onLeave,
        on_leave: onLeave,
        late_count: lateCount,
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
  const supabase = getSupabase()
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

export const attendanceService = {
  generateDailyQRCode,
  getQRCodeForToday,
  validateQRCode,
  checkIn,
  checkOut,
  getAttendanceRecords,
  getTodayAttendance,
  getMonthlyStatistics,
  updateMonthlyStatistics,
  getTeamAttendanceStatus,
  editAttendanceRecord,
}
