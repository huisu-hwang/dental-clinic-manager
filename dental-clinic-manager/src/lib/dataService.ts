import { getSupabase } from './supabase'
import type { ConsultRowData, GiftRowData, HappyCallRowData, GiftInventory } from '@/types'

export const dataService = {
  // 날짜별 보고서 데이터 불러오기
  async getReportByDate(date: string) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      // 병렬로 모든 데이터 가져오기
      const [dailyReportResult, consultLogsResult, giftLogsResult, happyCallLogsResult] = await Promise.all([
        supabase.from('daily_reports').select('*').eq('date', date).single(),
        supabase.from('consult_logs').select('*').eq('date', date).order('id'),
        supabase.from('gift_logs').select('*').eq('date', date).order('id'),
        supabase.from('happy_call_logs').select('*').eq('date', date).order('id')
      ])

      return {
        success: true,
        data: {
          dailyReport: dailyReportResult.data,
          consultLogs: consultLogsResult.data || [],
          giftLogs: giftLogsResult.data || [],
          happyCallLogs: happyCallLogsResult.data || [],
          hasData: !!dailyReportResult.data
        }
      }
    } catch (error: any) {
      console.error('Error fetching report by date:', error)
      return {
        success: false,
        error: error.message,
        data: {
          dailyReport: null,
          consultLogs: [],
          giftLogs: [],
          happyCallLogs: [],
          hasData: false
        }
      }
    }
  },
  // 보고서 저장
  async saveReport(data: {
    date: string
    consultRows: ConsultRowData[]
    giftRows: GiftRowData[]
    happyCallRows: HappyCallRowData[]
    recallCount: number
    recallBookingCount: number
    specialNotes: string
  }) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    const { date, consultRows, giftRows, happyCallRows, recallCount, recallBookingCount, specialNotes } = data

    // 기존 보고서 확인
    const { data: existingReports } = await supabase
      .from('daily_reports')
      .select('id')
      .eq('date', date)
      .limit(1)

    const existing = existingReports?.[0] as { id: number } | undefined
    if (existing) {
      const confirmed = confirm(`${date}에 이미 저장된 보고서가 있습니다. 모든 관련 데이터를 삭제하고 새로 저장하시겠습니까?`)
      if (!confirmed) return { error: 'Cancelled by user' }
      
      await this.deleteReportByDate(date)
    }

    // 유효한 상담 기록 필터링
    const validConsults = consultRows.filter(row => row.patient_name.trim())
    const validGifts = giftRows.filter(row => row.patient_name.trim())
    const validHappyCalls = happyCallRows.filter(row => row.patient_name.trim())

    // 일일 보고서 집계 데이터 생성
    const dailyReport = {
      date,
      recall_count: recallCount,
      recall_booking_count: recallBookingCount,
      consult_proceed: validConsults.filter(c => c.consult_status === 'O').length,
      consult_hold: validConsults.filter(c => c.consult_status === 'X').length,
      naver_review_count: validGifts.filter(g => g.naver_review === 'O').length,
      special_notes: specialNotes.trim() || null,
    }

    // 재고 업데이트 및 로그 생성
    const inventoryUpdates = []
    const inventoryLogs = []

    for (const gift of validGifts) {
      if (gift.gift_type !== '없음') {
        const { data: items } = await supabase
          .from('gift_inventory')
          .select('*')
          .eq('name', gift.gift_type)
          .limit(1)

        const item = items?.[0] as GiftInventory | undefined
        if (item && item.stock > 0) {
          const newStock = item.stock - 1
          inventoryUpdates.push({ id: item.id, stock: newStock })
          inventoryLogs.push({
            timestamp: new Date().toISOString(),
            name: item.name,
            reason: `환자 증정: ${gift.patient_name}`,
            change: -1,
            old_stock: item.stock,
            new_stock: newStock
          })
        }
      }
    }

    // 데이터베이스 저장
    try {
      // 상담 기록 저장 (기존 dcm.html과 동일한 구조)
      if (validConsults.length > 0) {
        await supabase.from('consult_logs').insert(validConsults.map(row => ({
          date,
          patient_name: row.patient_name,
          consult_content: row.consult_content,
          consult_status: row.consult_status,
          hold_reason: row.hold_reason
        })) as any)
      }

      // 선물 기록 저장 (기존 dcm.html과 동일한 구조)
      if (validGifts.length > 0) {
        await supabase.from('gift_logs').insert(validGifts.map(row => ({
          date,
          patient_name: row.patient_name,
          gift_type: row.gift_type,
          naver_review: row.naver_review,
          notes: row.notes
        })) as any)
      }

      // 해피콜 기록 저장
      if (validHappyCalls.length > 0) {
        await supabase.from('happy_call_logs').insert(validHappyCalls.map(row => ({
          date,
          patient_name: row.patient_name,
          treatment: row.treatment,
          notes: row.notes
        })) as any)
      }

      // 재고 로그 저장 (기존 dcm.html과 동일한 구조)
      if (inventoryLogs.length > 0) {
        await supabase.from('inventory_logs').insert(inventoryLogs as any)
      }

      // 재고 업데이트
      for (const update of inventoryUpdates) {
        const updateQuery = (supabase as any)
          .from('gift_inventory')
          .update({ stock: update.stock })
          .eq('id', update.id)
        await updateQuery
      }

      // 일일 보고서 저장 (기존 dcm.html과 동일한 구조)
      await supabase.from('daily_reports').insert([dailyReport] as any)

      return { success: true }
    } catch (error: unknown) {
      console.error('Error saving report:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 날짜별 보고서 삭제
  async deleteReportByDate(date: string) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const { data: reportsToDelete } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('date', date)
        .limit(1)

      const reportToDelete = reportsToDelete?.[0] as { id: number } | undefined
      if (!reportToDelete) return { success: true }

      await Promise.all([
        supabase.from('consult_logs').delete().eq('date', date),
        supabase.from('gift_logs').delete().eq('date', date),
        supabase.from('happy_call_logs').delete().eq('date', date),
        supabase.from('daily_reports').delete().eq('id', reportToDelete.id)
      ])

      return { success: true }
    } catch (error: unknown) {
      console.error(`Error deleting report for date ${date}:`, error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 선물 아이템 추가
  async addGiftItem(name: string, stock: number) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const { error: invError } = await supabase
        .from('gift_inventory')
        .insert([{ name, stock }] as any)

      if (invError) throw invError

      if (stock > 0) {
        const { error: logError } = await supabase
          .from('inventory_logs')
          .insert([{
            timestamp: new Date().toISOString(),
            name,
            reason: '신규 등록',
            change: stock,
            old_stock: 0,
            new_stock: stock
          }] as any)

        if (logError) throw logError
      }

      return { success: true }
    } catch (error: unknown) {
      console.error('Error adding gift item:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 재고 업데이트
  async updateStock(id: number, quantity: number, item: GiftInventory) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const oldStock = item.stock
      const newStock = oldStock + quantity

      const updateQuery = (supabase as any)
        .from('gift_inventory')
        .update({ stock: newStock })
        .eq('id', id)
      const { error: invError } = await updateQuery

      if (invError) throw invError

      const { error: logError } = await supabase
        .from('inventory_logs')
        .insert([{
          timestamp: new Date().toISOString(),
          name: item.name,
          reason: '수동 입고',
          change: quantity,
          old_stock: oldStock,
          new_stock: newStock
        }] as any)

      if (logError) throw logError

      return { success: true }
    } catch (error: unknown) {
      console.error('Error updating stock:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 선물 아이템 삭제
  async deleteGiftItem(id: number) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const { error } = await supabase
        .from('gift_inventory')
        .delete()
        .eq('id', id)

      if (error) throw error

      return { success: true }
    } catch (error: unknown) {
      console.error('Error deleting gift item:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  }
}