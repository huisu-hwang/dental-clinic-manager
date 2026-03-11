import { createClient } from '@/lib/supabase/client'
import type { OvertimeMealLog, OvertimeMealRowData } from '@/types'

export const overtimeMealService = {
  /**
   * 특정 날짜의 오버타임 식사 기록 조회 (클리닉당 1건)
   */
  async getByDate(clinicId: string, date: string) {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('overtime_meal_logs')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('date', date)
      .maybeSingle()

    return { data: data as OvertimeMealLog | null, error }
  },

  /**
   * 오버타임 식사 기록 저장 (upsert - 클리닉/날짜당 1건)
   */
  async save(clinicId: string, date: string, rowData: OvertimeMealRowData, createdBy: string) {
    const supabase = createClient()

    const hasAnyData = rowData.has_lunch || rowData.has_dinner || rowData.has_overtime || rowData.notes.trim()

    if (!hasAnyData) {
      // 데이터가 없으면 기존 레코드 삭제
      await supabase
        .from('overtime_meal_logs')
        .delete()
        .eq('clinic_id', clinicId)
        .eq('date', date)

      return { success: true, error: null }
    }

    // upsert (clinic_id + date unique)
    const { error } = await supabase
      .from('overtime_meal_logs')
      .upsert({
        clinic_id: clinicId,
        date,
        has_lunch: rowData.has_lunch,
        has_dinner: rowData.has_dinner,
        has_overtime: rowData.has_overtime,
        overtime_minutes: rowData.overtime_minutes,
        notes: rowData.notes,
        created_by: createdBy,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'clinic_id,date',
      })

    return { success: !error, error }
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
