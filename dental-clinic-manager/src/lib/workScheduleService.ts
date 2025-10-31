/**
 * Work Schedule Service
 * 개인 근무 스케줄 관리 서비스
 */

import { getSupabase } from './supabase'
import type { WorkSchedule } from '@/types/workSchedule'
import { convertClinicHoursToWorkSchedule } from '@/utils/workScheduleUtils'
import { clinicHoursService } from './clinicHoursService'

export interface WorkScheduleResult {
  data: WorkSchedule | null
  error: any
}

export interface UpdateWorkScheduleResult {
  success: boolean
  error: any
}

/**
 * 사용자의 근무 스케줄 조회
 * @param userId - 사용자 ID
 * @returns 근무 스케줄 객체
 */
export async function getUserWorkSchedule(userId: string): Promise<WorkScheduleResult> {
  console.log('[WorkScheduleService] Getting work schedule for user:', userId)

  try {
    const supabase = getSupabase()

    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    // users 테이블에서 work_schedule 조회
    const { data, error } = await supabase
      .from('users')
      .select('work_schedule, clinic_id')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('[WorkScheduleService] Error fetching work schedule:', error)
      return { data: null, error }
    }

    // work_schedule이 null이면 병원 진료시간으로 초기화
    if (!data.work_schedule && data.clinic_id) {
      console.log('[WorkScheduleService] work_schedule is null, initializing from clinic hours')
      const initResult = await initializeWorkScheduleFromClinic(userId, data.clinic_id)

      if (initResult.error) {
        console.error('[WorkScheduleService] Failed to initialize work schedule:', initResult.error)
        return { data: null, error: initResult.error }
      }

      return { data: initResult.data, error: null }
    }

    console.log('[WorkScheduleService] Work schedule fetched:', data.work_schedule)
    return { data: data.work_schedule as WorkSchedule, error: null }
  } catch (error) {
    console.error('[WorkScheduleService] Exception:', error)
    return { data: null, error }
  }
}

/**
 * 사용자의 근무 스케줄 업데이트
 * @param userId - 사용자 ID
 * @param workSchedule - 업데이트할 근무 스케줄
 * @returns 성공 여부
 */
export async function updateUserWorkSchedule(
  userId: string,
  workSchedule: WorkSchedule
): Promise<UpdateWorkScheduleResult> {
  console.log('[WorkScheduleService] Updating work schedule for user:', userId, workSchedule)

  try {
    const supabase = getSupabase()

    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

    // users 테이블 업데이트
    const { error } = await supabase
      .from('users')
      .update({ work_schedule: workSchedule as any })
      .eq('id', userId)

    if (error) {
      console.error('[WorkScheduleService] Error updating work schedule:', error)
      return { success: false, error }
    }

    console.log('[WorkScheduleService] Work schedule updated successfully')
    return { success: true, error: null }
  } catch (error) {
    console.error('[WorkScheduleService] Exception:', error)
    return { success: false, error }
  }
}

/**
 * 병원 진료시간을 기반으로 사용자 근무 스케줄 초기화
 * @param userId - 사용자 ID
 * @param clinicId - 병원 ID
 * @returns 초기화된 근무 스케줄
 */
export async function initializeWorkScheduleFromClinic(
  userId: string,
  clinicId: string
): Promise<WorkScheduleResult> {
  console.log('[WorkScheduleService] Initializing work schedule from clinic hours:', { userId, clinicId })

  try {
    // 1. 병원 진료시간 조회
    const clinicHoursResult = await clinicHoursService.getClinicHours(clinicId)

    if (clinicHoursResult.error || !clinicHoursResult.data) {
      console.error('[WorkScheduleService] Failed to fetch clinic hours:', clinicHoursResult.error)
      return { data: null, error: clinicHoursResult.error || new Error('No clinic hours found') }
    }

    // 2. 병원 진료시간을 개인 스케줄 형식으로 변환
    const workSchedule = convertClinicHoursToWorkSchedule(clinicHoursResult.data)

    // 3. 사용자 테이블에 저장
    const updateResult = await updateUserWorkSchedule(userId, workSchedule)

    if (!updateResult.success) {
      console.error('[WorkScheduleService] Failed to save initialized work schedule:', updateResult.error)
      return { data: null, error: updateResult.error }
    }

    console.log('[WorkScheduleService] Work schedule initialized successfully:', workSchedule)
    return { data: workSchedule, error: null }
  } catch (error) {
    console.error('[WorkScheduleService] Exception:', error)
    return { data: null, error }
  }
}

/**
 * 병원 진료시간으로 스케줄 재설정 (덮어쓰기)
 * 사용자가 "병원 진료시간 가져오기" 버튼을 클릭했을 때 사용
 * @param userId - 사용자 ID
 * @param clinicId - 병원 ID
 * @returns 재설정된 근무 스케줄
 */
export async function resetWorkScheduleToClinicHours(
  userId: string,
  clinicId: string
): Promise<WorkScheduleResult> {
  console.log('[WorkScheduleService] Resetting work schedule to clinic hours:', { userId, clinicId })

  // initializeWorkScheduleFromClinic과 동일한 로직 (덮어쓰기)
  return initializeWorkScheduleFromClinic(userId, clinicId)
}

export const workScheduleService = {
  getUserWorkSchedule,
  updateUserWorkSchedule,
  initializeWorkScheduleFromClinic,
  resetWorkScheduleToClinicHours,
}
