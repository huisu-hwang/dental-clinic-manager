import { getSupabase } from './supabase'
import type { DailyReport, ConsultLog, GiftLog, HappyCallLog, ConsultRowData, GiftRowData, HappyCallRowData, GiftInventory } from '@/types'

export const dataService = {
  // 날짜별 보고서 데이터 불러오기
  async getReportByDate(date: string) {
    console.log('[DataService] getReportByDate called with date:', date)

    const supabase = getSupabase()
    if (!supabase) {
      console.error('[DataService] Supabase client not available')
      return {
        success: false,
        error: 'Database connection not available',
        data: {
          dailyReport: null,
          consultLogs: [],
          giftLogs: [],
          happyCallLogs: [],
          hasData: false
        }
      }
    }

    try {
      console.log('[DataService] Starting data fetch...')

      // 각 테이블을 개별적으로 조회하여 에러 격리
      let dailyReportResult, consultLogsResult, giftLogsResult, happyCallLogsResult;

      // daily_reports 조회
      try {
        dailyReportResult = await supabase
          .from('daily_reports')
          .select('*')
          .eq('date', date)
          .maybeSingle();
        console.log('[DataService] daily_reports fetched:', dailyReportResult);
      } catch (err) {
        console.error('[DataService] Error fetching daily_reports:', err);
        dailyReportResult = { data: null, error: err };
      }

      // consult_logs 조회
      try {
        consultLogsResult = await supabase
          .from('consult_logs')
          .select('*')
          .eq('date', date)
          .order('id');
        console.log('[DataService] consult_logs fetched:', consultLogsResult?.data?.length || 0, 'items');
      } catch (err) {
        console.error('[DataService] Error fetching consult_logs:', err);
        consultLogsResult = { data: [], error: err };
      }

      // gift_logs 조회
      try {
        giftLogsResult = await supabase
          .from('gift_logs')
          .select('*')
          .eq('date', date)
          .order('id');
        console.log('[DataService] gift_logs fetched:', giftLogsResult?.data?.length || 0, 'items');
      } catch (err) {
        console.error('[DataService] Error fetching gift_logs:', err);
        giftLogsResult = { data: [], error: err };
      }

      // happy_call_logs 조회 (테이블이 없을 수 있음)
      try {
        happyCallLogsResult = await supabase
          .from('happy_call_logs')
          .select('*')
          .eq('date', date)
          .order('id');
        console.log('[DataService] happy_call_logs fetched:', happyCallLogsResult?.data?.length || 0, 'items');
      } catch (err) {
        console.warn('[DataService] Error fetching happy_call_logs (table might not exist):', err);
        happyCallLogsResult = { data: [], error: err };
      }

      const hasData = !!dailyReportResult?.data;
      console.log('[DataService] Data fetch complete. Has data:', hasData);

      return {
        success: true,
        data: {
          dailyReport: dailyReportResult?.data as DailyReport | null,
          consultLogs: (consultLogsResult?.data as ConsultLog[]) || [],
          giftLogs: (giftLogsResult?.data as GiftLog[]) || [],
          happyCallLogs: (happyCallLogsResult?.data as HappyCallLog[]) || [],
          hasData
        }
      }
    } catch (error: any) {
      console.error('[DataService] Unexpected error in getReportByDate:', error)
      return {
        success: false,
        error: error.message || 'Unknown error',
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

    try {
      const { date, consultRows, giftRows, happyCallRows, recallCount, recallBookingCount, specialNotes } = data

      // --- 1. 기존 보고서 확인 및 삭제 ---
      const { data: existingReports, error: checkError } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('date', date)
        .limit(1)

      if (checkError) {
        throw new Error(`기존 보고서 확인 실패: ${checkError.message}`)
      }

      if (existingReports && existingReports.length > 0) {
        const deleteResult = await this.deleteReportByDate(date)
        if (deleteResult.error) {
          throw new Error(`기존 데이터 삭제 실패: ${deleteResult.error}`)
        }
      }

      // --- 2. 유효 데이터 필터링 ---
      const validConsults = consultRows.filter(row => row.patient_name.trim())
      const validGifts = giftRows.filter(row => row.patient_name.trim())
      const validHappyCalls = happyCallRows.filter(row => row.patient_name.trim())

      // --- 3. 재고 업데이트 준비 ---
      const inventoryUpdates = []
      const inventoryLogs = []

      for (const gift of validGifts) {
        if (gift.gift_type !== '없음') {
          const { data: items, error: inventoryError } = await supabase
            .from('gift_inventory')
            .select('*')
            .eq('name', gift.gift_type)
            .limit(1)

          if (inventoryError) {
            console.warn(`재고 조회 실패 (${gift.gift_type}):`, inventoryError.message)
            continue // 해당 선물은 건너뛰고 계속 진행
          }

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
          } else if (item && item.stock <= 0) {
            console.warn(`재고 부족 (${gift.gift_type}): 현재 재고 ${item.stock}개. 재고 차감 없이 기록됩니다.`)
          }
        }
      }

      // --- 4. 데이터베이스에 모든 정보 저장 (트랜잭션처럼) ---
      const dailyReport = {
        date,
        recall_count: recallCount,
        recall_booking_count: recallBookingCount,
        consult_proceed: validConsults.filter(c => c.consult_status === 'O').length,
        consult_hold: validConsults.filter(c => c.consult_status === 'X').length,
        naver_review_count: validGifts.filter(g => g.naver_review === 'O').length,
        special_notes: specialNotes.trim() || null,
      }

      if (validConsults.length > 0) {
        // remarks 컴럼을 항상 포함하도록 수정 (빈 값이어도 null로 저장)
        const consultData = validConsults.map(row => ({
          date,
          patient_name: row.patient_name,
          consult_content: row.consult_content,
          consult_status: row.consult_status,
          remarks: row.remarks ?? '' // undefined/null이면 빈 문자열로 저장
        }))

        const { error } = await supabase.from('consult_logs').insert(consultData as any)
        if (error) {
          // remarks 컴럼 없이 재시도
          if (error.message.includes('remarks')) {
            console.warn('remarks 컴럼이 없어서 제외하고 저장합니다.')
            const consultDataWithoutRemarks = validConsults.map(row => ({
              date,
              patient_name: row.patient_name,
              consult_content: row.consult_content,
              consult_status: row.consult_status
            }))
            const { error: retryError } = await supabase.from('consult_logs').insert(consultDataWithoutRemarks as any)
            if (retryError) throw new Error(`상담 기록 저장 실패: ${retryError.message}`)
          } else {
            throw new Error(`상담 기록 저장 실패: ${error.message}`)
          }
        }
      }

      if (validGifts.length > 0) {
        // notes 컴럼을 항상 포함하도록 수정 (빈 값이어도 null로 저장)
        const giftData = validGifts.map(row => ({
          date,
          patient_name: row.patient_name,
          gift_type: row.gift_type,
          naver_review: row.naver_review,
          notes: row.notes ?? '' // undefined/null이면 빈 문자열로 저장
        }))

        const { error } = await supabase.from('gift_logs').insert(giftData as any)
        if (error) {
          // notes 컴럼 없이 재시도
          if (error.message.includes('notes')) {
            console.warn('notes 컴럼이 없어서 제외하고 저장합니다.')
            const giftDataWithoutNotes = validGifts.map(row => ({
              date,
              patient_name: row.patient_name,
              gift_type: row.gift_type,
              naver_review: row.naver_review
            }))
            const { error: retryError } = await supabase.from('gift_logs').insert(giftDataWithoutNotes as any)
            if (retryError) throw new Error(`선물 기록 저장 실패: ${retryError.message}`)
          } else {
            throw new Error(`선물 기록 저장 실패: ${error.message}`)
          }
        }
      }

      if (validHappyCalls.length > 0) {
        const { error } = await supabase.from('happy_call_logs').insert(validHappyCalls.map(row => ({
          date,
          patient_name: row.patient_name,
          treatment: row.treatment,
          notes: row.notes
        })) as any)
        if (error) throw new Error(`해피콜 기록 저장 실패: ${error.message}`)
      }

      if (inventoryLogs.length > 0) {
        const { error } = await supabase.from('inventory_logs').insert(inventoryLogs as any)
        if (error) throw new Error(`재고 로그 저장 실패: ${error.message}`)
      }

      for (const update of inventoryUpdates) {
        const { error } = await (supabase.from('gift_inventory') as any).update({ stock: update.stock }).eq('id', update.id)
        if (error) throw new Error(`재고 업데이트 실패: ${error.message}`)
      }

      const { error } = await supabase.from('daily_reports').insert([dailyReport] as any)
      if (error) throw new Error(`일일 보고서 저장 실패: ${error.message}`)

      return { success: true }
    } catch (error: unknown) {
      console.error('Error saving report:', error)
      return { error: error instanceof Error ? error.message : 'An unknown error occurred during saveReport.' }
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

  // 일일 보고서 통계 재계산 (데이터 불일치 해결용)
  async recalculateDailyReportStats(date: string) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      // 해당 날짜의 모든 로그 데이터 조회
      const [consultResult, giftResult, reportResult] = await Promise.all([
        supabase.from('consult_logs').select('*').eq('date', date),
        supabase.from('gift_logs').select('*').eq('date', date),
        supabase.from('daily_reports').select('*').eq('date', date).single()
      ])

      const consultLogs = (consultResult.data as any[]) || []
      const giftLogs = (giftResult.data as any[]) || []
      const existingReport = reportResult.data

      if (!existingReport) {
        return { error: '해당 날짜의 보고서가 없습니다.' }
      }

      // 실제 로그 데이터를 기반으로 재계산
      const updatedStats = {
        consult_proceed: consultLogs.filter(c => c.consult_status === 'O').length,
        consult_hold: consultLogs.filter(c => c.consult_status === 'X').length,
        naver_review_count: giftLogs.filter(g => g.naver_review === 'O').length
      }

      // 일일 보고서 업데이트
      const { error: updateError } = await (supabase as any)
        .from('daily_reports')
        .update(updatedStats)
        .eq('date', date)

      if (updateError) {
        return { error: updateError.message }
      }

      return {
        success: true,
        message: `${date} 보고서 통계가 재계산되었습니다.`,
        stats: updatedStats
      }
    } catch (error: any) {
      return { error: error.message }
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