// ============================================
// 근무 스케줄 관리 서비스
// Work Schedule Management Service
// ============================================
//
// ⚠️ DEPRECATED
// 이 서비스는 더 이상 사용되지 않습니다.
// users.work_schedule (JSONB)를 사용하는 workScheduleService를 사용하세요.
//
// 이유: work_schedules 테이블 대신 users.work_schedule JSONB로 통합
// 대체: @/lib/workScheduleService
// 삭제 예정일: 2025-12-31
// ============================================

import { getSupabase } from './supabase'
import type {
  WorkSchedule,
  WorkScheduleInput,
  WeeklySchedule,
} from '@/types/attendance'

/**
 * 근무 스케줄 생성
 */
export async function createWorkSchedule(
  input: WorkScheduleInput
): Promise<{ success: boolean; schedule?: WorkSchedule; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const { data, error } = await supabase
      .from('work_schedules')
      .insert(input)
      .select()
      .single()

    if (error) {
      console.error('[createWorkSchedule] Error:', error)
      return { success: false, error: error.message }
    }

    return { success: true, schedule: data as WorkSchedule }
  } catch (error: any) {
    console.error('[createWorkSchedule] Unexpected error:', error)
    return { success: false, error: error.message || 'Failed to create schedule' }
  }
}

/**
 * 근무 스케줄 수정
 */
export async function updateWorkSchedule(
  scheduleId: string,
  updates: Partial<WorkScheduleInput>
): Promise<{ success: boolean; schedule?: WorkSchedule; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const { data, error } = await supabase
      .from('work_schedules')
      .update(updates)
      .eq('id', scheduleId)
      .select()
      .single()

    if (error) {
      console.error('[updateWorkSchedule] Error:', error)
      return { success: false, error: error.message }
    }

    return { success: true, schedule: data as WorkSchedule }
  } catch (error: any) {
    console.error('[updateWorkSchedule] Unexpected error:', error)
    return { success: false, error: error.message || 'Failed to update schedule' }
  }
}

/**
 * 근무 스케줄 삭제
 */
export async function deleteWorkSchedule(
  scheduleId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const { error } = await supabase.from('work_schedules').delete().eq('id', scheduleId)

    if (error) {
      console.error('[deleteWorkSchedule] Error:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    console.error('[deleteWorkSchedule] Unexpected error:', error)
    return { success: false, error: error.message || 'Failed to delete schedule' }
  }
}

/**
 * 사용자의 주간 스케줄 조회
 */
export async function getWeeklySchedule(
  userId: string,
  effectiveDate?: string
): Promise<{ success: boolean; schedule?: WeeklySchedule; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const date = effectiveDate || new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('work_schedules')
      .select('*')
      .eq('user_id', userId)
      .lte('effective_from', date)
      .or(`effective_until.is.null,effective_until.gte.${date}`)
      .order('day_of_week', { ascending: true })

    if (error) {
      console.error('[getWeeklySchedule] Error:', error)
      return { success: false, error: error.message }
    }

    return {
      success: true,
      schedule: {
        user_id: userId,
        schedules: (data || []) as WorkSchedule[],
      },
    }
  } catch (error: any) {
    console.error('[getWeeklySchedule] Unexpected error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 특정 날짜의 사용자 스케줄 조회
 */
export async function getScheduleForDate(
  userId: string,
  date: string
): Promise<{ success: boolean; schedule?: WorkSchedule; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const dayOfWeek = new Date(date).getDay()

    const { data, error } = await supabase
      .from('work_schedules')
      .select('*')
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek)
      .lte('effective_from', date)
      .or(`effective_until.is.null,effective_until.gte.${date}`)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116은 "not found" 에러
      console.error('[getScheduleForDate] Error:', error)
      return { success: false, error: error.message }
    }

    return { success: true, schedule: data as WorkSchedule | undefined }
  } catch (error: any) {
    console.error('[getScheduleForDate] Unexpected error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 클리닉 전체 직원의 스케줄 조회
 */
export async function getClinicSchedules(
  clinicId: string,
  effectiveDate?: string
): Promise<{ success: boolean; schedules?: WeeklySchedule[]; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const date = effectiveDate || new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('work_schedules')
      .select(`
        *,
        user:users!inner(id, name, role)
      `)
      .eq('clinic_id', clinicId)
      .lte('effective_from', date)
      .or(`effective_until.is.null,effective_until.gte.${date}`)
      .order('user_id')
      .order('day_of_week')

    if (error) {
      console.error('[getClinicSchedules] Error:', error)
      return { success: false, error: error.message }
    }

    // 사용자별로 그룹화
    const schedulesByUser = new Map<string, WorkSchedule[]>()
    ;(data || []).forEach((schedule: any) => {
      const userId = schedule.user_id
      if (!schedulesByUser.has(userId)) {
        schedulesByUser.set(userId, [])
      }
      schedulesByUser.get(userId)!.push(schedule)
    })

    const weeklySchedules: WeeklySchedule[] = Array.from(schedulesByUser.entries()).map(
      ([userId, schedules]) => ({
        user_id: userId,
        schedules,
      })
    )

    return { success: true, schedules: weeklySchedules }
  } catch (error: any) {
    console.error('[getClinicSchedules] Unexpected error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 일괄 주간 스케줄 생성 (월~금 동일 시간)
 */
export async function createWeeklyScheduleBulk(
  userId: string,
  clinicId: string,
  startTime: string,
  endTime: string,
  workDays: number[], // [1, 2, 3, 4, 5] = 월~금
  effectiveFrom: string,
  effectiveUntil?: string
): Promise<{ success: boolean; schedules?: WorkSchedule[]; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    // 모든 요일에 대해 스케줄 생성 (0=일, 1=월, ..., 6=토)
    const schedules = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      user_id: userId,
      clinic_id: clinicId,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      is_work_day: workDays.includes(dayOfWeek),
      effective_from: effectiveFrom,
      effective_until: effectiveUntil || null,
    }))

    const { data, error } = await supabase.from('work_schedules').insert(schedules).select()

    if (error) {
      console.error('[createWeeklyScheduleBulk] Error:', error)
      return { success: false, error: error.message }
    }

    return { success: true, schedules: (data || []) as WorkSchedule[] }
  } catch (error: any) {
    console.error('[createWeeklyScheduleBulk] Unexpected error:', error)
    return { success: false, error: error.message || 'Failed to create weekly schedule' }
  }
}

/**
 * 일괄 주간 스케줄 수정
 */
export async function updateWeeklyScheduleBulk(
  userId: string,
  startTime: string,
  endTime: string,
  workDays: number[],
  effectiveFrom: string
): Promise<{ success: boolean; schedules?: WorkSchedule[]; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    // 기존 스케줄 종료일 설정 (새 스케줄 시작 전날)
    const previousDay = new Date(effectiveFrom)
    previousDay.setDate(previousDay.getDate() - 1)
    const previousDayStr = previousDay.toISOString().split('T')[0]

    const { error: updateError } = await supabase
      .from('work_schedules')
      .update({ effective_until: previousDayStr })
      .eq('user_id', userId)
      .is('effective_until', null)

    if (updateError) {
      console.error('[updateWeeklyScheduleBulk] Update error:', updateError)
    }

    // 새 스케줄 생성
    const { data: newData, error: insertError } = await supabase
      .from('work_schedules')
      .select('clinic_id')
      .eq('user_id', userId)
      .limit(1)
      .single()

    if (insertError || !newData) {
      return { success: false, error: 'User schedule not found' }
    }

    // createWeeklyScheduleBulk 재사용
    return await createWeeklyScheduleBulk(
      userId,
      newData.clinic_id,
      startTime,
      endTime,
      workDays,
      effectiveFrom
    )
  } catch (error: any) {
    console.error('[updateWeeklyScheduleBulk] Unexpected error:', error)
    return { success: false, error: error.message || 'Failed to update weekly schedule' }
  }
}

/**
 * 특정 요일의 스케줄만 수정 (예: 월요일만 변경)
 */
export async function updateDaySchedule(
  userId: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  isWorkDay: boolean,
  effectiveFrom: string
): Promise<{ success: boolean; schedule?: WorkSchedule; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    // 기존 스케줄 종료
    const previousDay = new Date(effectiveFrom)
    previousDay.setDate(previousDay.getDate() - 1)
    const previousDayStr = previousDay.toISOString().split('T')[0]

    const { error: updateError } = await supabase
      .from('work_schedules')
      .update({ effective_until: previousDayStr })
      .eq('user_id', userId)
      .eq('day_of_week', dayOfWeek)
      .is('effective_until', null)

    if (updateError) {
      console.error('[updateDaySchedule] Update error:', updateError)
    }

    // 새 스케줄 생성
    const { data: userData, error: userError } = await supabase
      .from('work_schedules')
      .select('clinic_id')
      .eq('user_id', userId)
      .limit(1)
      .single()

    if (userError || !userData) {
      return { success: false, error: 'User schedule not found' }
    }

    const { data: newSchedule, error: insertError } = await supabase
      .from('work_schedules')
      .insert({
        user_id: userId,
        clinic_id: userData.clinic_id,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        is_work_day: isWorkDay,
        effective_from: effectiveFrom,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[updateDaySchedule] Insert error:', insertError)
      return { success: false, error: insertError.message }
    }

    return { success: true, schedule: newSchedule as WorkSchedule }
  } catch (error: any) {
    console.error('[updateDaySchedule] Unexpected error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 사용자의 모든 스케줄 삭제 (사용자 퇴사 등)
 */
export async function deleteAllUserSchedules(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const { error } = await supabase.from('work_schedules').delete().eq('user_id', userId)

    if (error) {
      console.error('[deleteAllUserSchedules] Error:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    console.error('[deleteAllUserSchedules] Unexpected error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 스케줄 템플릿 복사 (한 사용자의 스케줄을 다른 사용자에게 복사)
 */
export async function copyScheduleTemplate(
  fromUserId: string,
  toUserId: string,
  toClinicId: string,
  effectiveFrom: string
): Promise<{ success: boolean; schedules?: WorkSchedule[]; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    // 원본 스케줄 조회
    const { data: sourceSchedules, error: fetchError } = await supabase
      .from('work_schedules')
      .select('*')
      .eq('user_id', fromUserId)
      .is('effective_until', null)

    if (fetchError) {
      return { success: false, error: fetchError.message }
    }

    if (!sourceSchedules || sourceSchedules.length === 0) {
      return { success: false, error: 'No schedule found for source user' }
    }

    // 새 사용자용 스케줄 생성
    const newSchedules = sourceSchedules.map((schedule: any) => ({
      user_id: toUserId,
      clinic_id: toClinicId,
      day_of_week: schedule.day_of_week,
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      is_work_day: schedule.is_work_day,
      effective_from: effectiveFrom,
      effective_until: null,
    }))

    const { data, error: insertError } = await supabase
      .from('work_schedules')
      .insert(newSchedules)
      .select()

    if (insertError) {
      return { success: false, error: insertError.message }
    }

    return { success: true, schedules: (data || []) as WorkSchedule[] }
  } catch (error: any) {
    console.error('[copyScheduleTemplate] Unexpected error:', error)
    return { success: false, error: error.message }
  }
}

export const scheduleService = {
  createWorkSchedule,
  updateWorkSchedule,
  deleteWorkSchedule,
  getWeeklySchedule,
  getScheduleForDate,
  getClinicSchedules,
  createWeeklyScheduleBulk,
  updateWeeklyScheduleBulk,
  updateDaySchedule,
  deleteAllUserSchedules,
  copyScheduleTemplate,
}
