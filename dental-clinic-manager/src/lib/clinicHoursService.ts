/**
 * 병원 진료시간 및 휴진일 관리 서비스
 */

import { getSupabase } from './supabase'
import type { ClinicHours, ClinicHoliday, ClinicHoursInput, ClinicHolidayInput } from '@/types/clinic'

export const clinicHoursService = {
  /**
   * 병원의 진료시간 조회
   */
  async getClinicHours(clinicId: string) {
    const supabase = getSupabase()
    if (!supabase) {
      return { data: null, error: new Error('Supabase client not available') }
    }

    const { data, error } = await supabase
      .from('clinic_hours')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('day_of_week')

    return { data: data as ClinicHours[] | null, error }
  },

  /**
   * 병원 진료시간 업데이트 (전체 요일)
   * API 라우트를 통해 서버 측에서 처리 (RLS 우회)
   * @param clinicId 병원 ID
   * @param hoursData 진료시간 데이터
   * @param userId 현재 로그인한 사용자 ID
   */
  async updateClinicHours(clinicId: string, hoursData: ClinicHoursInput[], userId?: string) {
    // userId가 없으면 에러
    if (!userId) {
      return { data: null, error: new Error('User ID is required') }
    }

    try {
      // API 라우트를 통해 서버 측에서 처리 (service_role 사용)
      console.log('[clinicHoursService] Calling API route with userId:', userId)

      const response = await fetch('/api/clinic-hours', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clinicId,
          hoursData,
          userId,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('[clinicHoursService] API error:', result.error)
        return { data: null, error: new Error(result.error || 'Failed to update clinic hours') }
      }

      console.log('[clinicHoursService] API success:', result)
      return { data: result.data as ClinicHours[] | null, error: null }

    } catch (error) {
      console.error('[clinicHoursService] Error updating clinic hours:', error)
      return { data: null, error: error as Error }
    }
  },

  /**
   * 기존 방식으로 진료시간 업데이트 (RPC 함수 없을 때 폴백)
   */
  async updateClinicHoursFallback(clinicId: string, hoursData: ClinicHoursInput[]) {
    const supabase = getSupabase()
    if (!supabase) {
      return { data: null, error: new Error('Supabase client not available') }
    }

    try {
      // 먼저 기존 데이터 삭제
      const { error: deleteError } = await supabase
        .from('clinic_hours')
        .delete()
        .eq('clinic_id', clinicId)

      if (deleteError) throw deleteError

      // 새 데이터 삽입
      const insertData = hoursData.map(hours => ({
        clinic_id: clinicId,
        day_of_week: hours.day_of_week,
        is_open: hours.is_open,
        open_time: hours.is_open ? hours.open_time : null,
        close_time: hours.is_open ? hours.close_time : null,
        break_start: hours.is_open && hours.break_start ? hours.break_start : null,
        break_end: hours.is_open && hours.break_end ? hours.break_end : null,
      }))

      const { data, error } = await supabase
        .from('clinic_hours')
        .insert(insertData)
        .select()

      return { data: data as ClinicHours[] | null, error }
    } catch (error) {
      return { data: null, error: error as Error }
    }
  },

  /**
   * 특정 요일의 진료시간 업데이트
   */
  async updateDayHours(clinicId: string, dayOfWeek: number, hours: ClinicHoursInput) {
    const supabase = getSupabase()
    if (!supabase) {
      return { data: null, error: new Error('Supabase client not available') }
    }

    const updateData = {
      is_open: hours.is_open,
      open_time: hours.is_open ? hours.open_time : null,
      close_time: hours.is_open ? hours.close_time : null,
      break_start: hours.is_open && hours.break_start ? hours.break_start : null,
      break_end: hours.is_open && hours.break_end ? hours.break_end : null,
    }

    const { data, error } = await supabase
      .from('clinic_hours')
      .upsert({
        clinic_id: clinicId,
        day_of_week: dayOfWeek,
        ...updateData,
      })
      .select()
      .single()

    return { data: data as ClinicHours | null, error }
  },

  /**
   * 기본 진료시간 생성
   */
  async createDefaultHours(clinicId: string) {
    const supabase = getSupabase()
    if (!supabase) {
      return { data: null, error: new Error('Supabase client not available') }
    }

    const { data, error } = await supabase.rpc('create_default_clinic_hours', {
      p_clinic_id: clinicId,
    })

    return { data, error }
  },

  /**
   * 병원의 휴진일 조회
   */
  async getClinicHolidays(clinicId: string) {
    const supabase = getSupabase()
    if (!supabase) {
      return { data: null, error: new Error('Supabase client not available') }
    }

    const { data, error } = await supabase
      .from('clinic_holidays')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('holiday_date', { ascending: true })

    return { data: data as ClinicHoliday[] | null, error }
  },

  /**
   * 휴진일 추가
   */
  async addClinicHoliday(clinicId: string, holiday: ClinicHolidayInput) {
    const supabase = getSupabase()
    if (!supabase) {
      return { data: null, error: new Error('Supabase client not available') }
    }

    const { data, error } = await supabase
      .from('clinic_holidays')
      .insert({
        clinic_id: clinicId,
        holiday_date: holiday.holiday_date,
        description: holiday.description,
      })
      .select()
      .single()

    return { data: data as ClinicHoliday | null, error }
  },

  /**
   * 휴진일 삭제
   */
  async deleteClinicHoliday(holidayId: string) {
    const supabase = getSupabase()
    if (!supabase) {
      return { error: new Error('Supabase client not available') }
    }

    const { error } = await supabase
      .from('clinic_holidays')
      .delete()
      .eq('id', holidayId)

    return { error }
  },

  /**
   * 특정 날짜가 휴진일인지 확인
   */
  async isHoliday(clinicId: string, date: string): Promise<boolean> {
    const supabase = getSupabase()
    if (!supabase) return false

    const { data, error } = await supabase
      .from('clinic_holidays')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('holiday_date', date)
      .single()

    return !!data && !error
  },

  /**
   * 특정 요일의 진료시간 조회
   */
  async getDayHours(clinicId: string, dayOfWeek: number) {
    const supabase = getSupabase()
    if (!supabase) {
      return { data: null, error: new Error('Supabase client not available') }
    }

    const { data, error } = await supabase
      .from('clinic_hours')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('day_of_week', dayOfWeek)
      .single()

    return { data: data as ClinicHours | null, error }
  },
}
