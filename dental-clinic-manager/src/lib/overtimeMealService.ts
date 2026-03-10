import { createClient } from '@/lib/supabase/client'
import type { OvertimeMealLog, OvertimeMealRowData } from '@/types'

export const overtimeMealService = {
  /**
   * 특정 날짜의 오버타임 식사 기록 조회
   */
  async getByDate(clinicId: string, date: string) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('overtime_meal_logs')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('date', date)
      .order('user_name')

    return { data: data as OvertimeMealLog[] | null, error }
  },

  /**
   * 오버타임 식사 기록 저장 (upsert)
   */
  async save(clinicId: string, date: string, logs: OvertimeMealRowData[], createdBy: string) {
    const supabase = createClient()

    // 기존 레코드 삭제
    await supabase
      .from('overtime_meal_logs')
      .delete()
      .eq('clinic_id', clinicId)
      .eq('date', date)

    // 체크된 항목만 저장
    const toInsert = logs
      .filter(log => log.has_lunch_overtime || log.has_dinner_overtime || log.has_extra_overtime || log.notes.trim())
      .map(log => ({
        clinic_id: clinicId,
        date,
        user_id: log.user_id,
        user_name: log.user_name,
        has_lunch_overtime: log.has_lunch_overtime,
        has_dinner_overtime: log.has_dinner_overtime,
        has_extra_overtime: log.has_extra_overtime,
        notes: log.notes,
        created_by: createdBy,
      }))

    if (toInsert.length > 0) {
      const { error } = await supabase
        .from('overtime_meal_logs')
        .insert(toInsert)

      return { success: !error, error }
    }

    return { success: true, error: null }
  },

  /**
   * 클리닉의 활성 직원 목록 조회
   */
  async getClinicUsers(clinicId: string) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('users')
      .select('id, name, role')
      .eq('clinic_id', clinicId)
      .eq('status', 'active')
      .order('name')

    return { data, error }
  },

  /**
   * 월별 오버타임 식사 통계 조회 (근태관리용)
   */
  async getStatsByMonth(clinicId: string, year: number, month: number) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const supabase = createClient()
    const { data, error } = await supabase
      .from('overtime_meal_logs')
      .select('*')
      .eq('clinic_id', clinicId)
      .gte('date', startDate)
      .lte('date', endDate)

    return { data: data as OvertimeMealLog[] | null, error }
  },

  /**
   * 기간별 오버타임 식사 통계 조회
   */
  async getStatsByDateRange(clinicId: string, startDate: string, endDate: string) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('overtime_meal_logs')
      .select('*')
      .eq('clinic_id', clinicId)
      .gte('date', startDate)
      .lte('date', endDate)

    return { data: data as OvertimeMealLog[] | null, error }
  },
}
