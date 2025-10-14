import { getSupabase } from './supabase'
import type { DailyReport, ConsultLog, GiftLog, HappyCallLog, ConsultRowData, GiftRowData, HappyCallRowData, GiftInventory, InventoryLog } from '@/types'

// 현재 로그인한 사용자의 clinic_id를 가져오는 헬퍼 함수
async function getCurrentClinicId(): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    // users 테이블에서 clinic_id 조회
    const { data, error } = await supabase
      .from('users')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    if (error || !data) {
      console.error('Failed to get clinic_id:', error)
      return null
    }

    return data.clinic_id
  } catch (error) {
    console.error('Error getting clinic_id:', error)
    return null
  }
}

export const dataService = {
  // 공개된 병원 목록 검색
  async searchPublicClinics() {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      // 데이터베이스에 미리 정의된 RPC 함수를 호출합니다.
      const { data, error } = await supabase.rpc('get_public_clinics')

      if (error) {
        console.error('Error fetching public clinics:', error)
        throw error
      }

      return { success: true, data }
    } catch (error: unknown) {
      return { error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.' }
    }
  },

  // 사용자 ID로 프로필 정보 가져오기 (소속 병원 정보 포함)
  async getUserProfileById(id: string) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      // users와 clinics의 관계가 정상적이므로, join 쿼리를 사용합니다.
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          clinics (*)
        `)
        .eq('id', id)
        .maybeSingle()

      if (error) throw error

      // Supabase v2의 join 문법은 'clinics'라는 별도 객체로 결과를 반환합니다.
      // 이를 user.clinic 형태로 사용하기 쉽게 재구성합니다.
      const userProfile = data ? { ...(data as any), clinic: (data as any).clinics } : null;
      if (userProfile) delete (userProfile as any).clinics; // 중복 필드 제거

      return { success: true, data: userProfile }
    } catch (error: unknown) {
      console.error('Error fetching user profile by ID:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

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
      // 현재 로그인한 사용자의 clinic_id 가져오기
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        console.error('[DataService] No clinic_id found for current user')
        return {
          success: false,
          error: 'User clinic information not available',
          data: {
            dailyReport: null,
            consultLogs: [],
            giftLogs: [],
            happyCallLogs: [],
            hasData: false
          }
        }
      }

      console.log('[DataService] Starting data fetch for clinic:', clinicId)

      // 각 테이블을 개별적으로 조회하여 에러 격리
      let dailyReportResult, consultLogsResult, giftLogsResult, happyCallLogsResult;

      // daily_reports 조회
      try {
        dailyReportResult = await supabase
          .from('daily_reports')
          .select('*')
          .eq('clinic_id', clinicId)
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
          .eq('clinic_id', clinicId)
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
          .eq('clinic_id', clinicId)
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
          .eq('clinic_id', clinicId)
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
      // 현재 로그인한 사용자의 clinic_id 가져오기
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const { date, consultRows, giftRows, happyCallRows, recallCount, recallBookingCount, specialNotes } = data

      // --- 1. 기존 보고서 확인 및 삭제 ---
      const { data: existingReports, error: checkError } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('clinic_id', clinicId)
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
            .eq('clinic_id', clinicId)
            .eq('name', gift.gift_type)
            .limit(1)

          if (inventoryError) {
            console.warn(`재고 조회 실패 (${gift.gift_type}):`, inventoryError.message)
            continue // 해당 선물은 건너뛰고 계속 진행
          }

          const item = items?.[0] as GiftInventory | undefined
          const quantity = gift.quantity || 1 // 수량이 없으면 기본값 1
          if (item && item.stock >= quantity) {
            const newStock = item.stock - quantity
            inventoryUpdates.push({ id: item.id, stock: newStock })
            inventoryLogs.push({
              timestamp: new Date().toISOString(),
              name: item.name,
              reason: `환자 증정: ${gift.patient_name} (${quantity}개)`,
              change: -quantity,
              old_stock: item.stock,
              new_stock: newStock
            })
          } else if (item && item.stock < quantity) {
            console.warn(`재고 부족 (${gift.gift_type}): 현재 재고 ${item.stock}개, 필요 ${quantity}개. 재고 차감 없이 기록됩니다.`)
          }
        }
      }

      // --- 4. 데이터베이스에 모든 정보 저장 (트랜잭션처럼) ---
      const dailyReport = {
        clinic_id: clinicId,
        date,
        recall_count: recallCount,
        recall_booking_count: recallBookingCount,
        consult_proceed: validConsults.filter(c => c.consult_status === 'O').length,
        consult_hold: validConsults.filter(c => c.consult_status === 'X').length,
        naver_review_count: validGifts.filter(g => g.naver_review === 'O').length,
        special_notes: specialNotes.trim() || null,
      }

      if (validConsults.length > 0) {
        // remarks 컬럼을 항상 포함하도록 수정 (빈 값이어도 null로 저장)
        const consultData = validConsults.map(row => ({
          clinic_id: clinicId,
          date,
          patient_name: row.patient_name,
          consult_content: row.consult_content,
          consult_status: row.consult_status,
          remarks: row.remarks ?? '' // undefined/null이면 빈 문자열로 저장
        }))

        const { error } = await supabase.from('consult_logs').insert(consultData as any)
        if (error) {
          // remarks 컬럼 없이 재시도
          if (error.message.includes('remarks')) {
            console.warn('remarks 컬럼이 없어서 제외하고 저장합니다.')
            const consultDataWithoutRemarks = validConsults.map(row => ({
              clinic_id: clinicId,
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
        // notes 컬럼을 항상 포함하도록 수정 (빈 값이어도 null로 저장)
        const giftData = validGifts.map(row => ({
          clinic_id: clinicId,
          date,
          patient_name: row.patient_name,
          gift_type: row.gift_type,
          naver_review: row.naver_review,
          notes: row.notes ?? '' // undefined/null이면 빈 문자열로 저장
        }))

        const { error } = await supabase.from('gift_logs').insert(giftData as any)
        if (error) {
          // notes 컬럼 없이 재시도
          if (error.message.includes('notes')) {
            console.warn('notes 컬럼이 없어서 제외하고 저장합니다.')
            const giftDataWithoutNotes = validGifts.map(row => ({
              clinic_id: clinicId,
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
          clinic_id: clinicId,
          date,
          patient_name: row.patient_name,
          treatment: row.treatment,
          notes: row.notes
        })) as any)
        if (error) throw new Error(`해피콜 기록 저장 실패: ${error.message}`)
      }

      if (inventoryLogs.length > 0) {
        const logsWithClinicId = inventoryLogs.map(log => ({
          ...log,
          clinic_id: clinicId
        }))
        const { error } = await supabase.from('inventory_logs').insert(logsWithClinicId as any)
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
      // 현재 로그인한 사용자의 clinic_id 가져오기
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const { data: reportsToDelete } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('date', date)
        .limit(1)

      const reportToDelete = reportsToDelete?.[0] as { id: number } | undefined
      if (!reportToDelete) return { success: true }

      // --- 삭제 전 재고 복원 ---
      // 해당 날짜의 선물 데이터를 먼저 조회하여 재고 복원
      const { data: giftLogsToDelete } = await supabase
        .from('gift_logs')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('date', date) as { data: GiftLog[] | null }

      if (giftLogsToDelete && giftLogsToDelete.length > 0) {
        for (const giftLog of giftLogsToDelete) {
          if (giftLog.gift_type !== '없음') {
            const { data: items } = await supabase
              .from('gift_inventory')
              .select('*')
              .eq('clinic_id', clinicId)
              .eq('name', giftLog.gift_type)
              .limit(1)

            const item = items?.[0] as GiftInventory | undefined
            if (item) {
              const quantity = 1 // 기존 데이터는 수량이 1개로 가정
              const restoredStock = item.stock + quantity

              // 재고 복원
              const updateResult = await (supabase as any)
                .from('gift_inventory')
                .update({ stock: restoredStock })
                .eq('id', item.id)

              const updateError = updateResult?.error

              if (updateError) {
                console.error('[DataService] Failed to restore inventory:', updateError)
              }

              // 재고 복원 로그 추가
              await supabase
                .from('inventory_logs')
                .insert([{
                  clinic_id: clinicId,
                  timestamp: new Date().toISOString(),
                  name: item.name,
                  reason: `데이터 삭제로 인한 재고 복원: ${giftLog.patient_name}`,
                  change: quantity,
                  old_stock: item.stock,
                  new_stock: restoredStock
                }] as any)
            }
          }
        }
      }

      // 기존 데이터 삭제
      await Promise.all([
        supabase.from('consult_logs').delete().eq('clinic_id', clinicId).eq('date', date),
        supabase.from('gift_logs').delete().eq('clinic_id', clinicId).eq('date', date),
        supabase.from('happy_call_logs').delete().eq('clinic_id', clinicId).eq('date', date),
        supabase.from('daily_reports').delete().eq('clinic_id', clinicId).eq('id', reportToDelete.id)
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
      // 현재 로그인한 사용자의 clinic_id 가져오기
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      // 해당 날짜의 모든 로그 데이터 조회
      const [consultResult, giftResult, reportResult] = await Promise.all([
        supabase.from('consult_logs').select('*').eq('clinic_id', clinicId).eq('date', date),
        supabase.from('gift_logs').select('*').eq('clinic_id', clinicId).eq('date', date),
        supabase.from('daily_reports').select('*').eq('clinic_id', clinicId).eq('date', date).single()
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
        .eq('clinic_id', clinicId)
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

  // 재고 업데이트
  async updateStock(id: number, quantity: number, item: { name: string; stock: number }) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      // 현재 로그인한 사용자의 clinic_id 가져오기
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const newStock = item.stock + quantity
      if (newStock < 0) {
        return { error: '재고가 부족합니다.' }
      }

      // Update inventory
      const { error: invError } = await (supabase
        .from('gift_inventory') as any)
        .update({ stock: newStock })
        .eq('clinic_id', clinicId)
        .eq('id', id)

      if (invError) throw invError

      // Log the change
      const { error: logError } = await supabase
        .from('inventory_logs')
        .insert([{
          clinic_id: clinicId,
          timestamp: new Date().toISOString(),
          name: item.name,
          reason: quantity > 0 ? '재고 추가' : '재고 차감',
          change: quantity,
          old_stock: item.stock,
          new_stock: newStock
        }] as any)

      if (logError) throw logError

      return { success: true }
    } catch (error: unknown) {
      console.error('Error updating stock:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 선물 아이템 추가
  async addGiftItem(name: string, stock: number) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      // 현재 로그인한 사용자의 clinic_id 가져오기
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const { error: invError } = await supabase
        .from('gift_inventory')
        .insert([{ clinic_id: clinicId, name, stock }] as any)

      if (invError) throw invError

      if (stock > 0) {
        const { error: logError } = await supabase
          .from('inventory_logs')
          .insert([{
            clinic_id: clinicId,
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

  // 선물 아이템 삭제
  async deleteGiftItem(id: number) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      // 현재 로그인한 사용자의 clinic_id 가져오기
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const { error } = await supabase
        .from('gift_inventory')
        .delete()
        .eq('clinic_id', clinicId)
        .eq('id', id)

      if (error) throw error

      return { success: true }
    } catch (error: unknown) {
      console.error('Error deleting gift item:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 재고 데이터 수정 (잘못된 재고 수치 복구)
  async fixInventoryData() {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      // 현재 로그인한 사용자의 clinic_id 가져오기
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      console.log('[FixInventory] 재고 데이터 수정 시작...')

      // 1. 현재 재고 현황 조회
      const { data: currentInventory, error: invError } = await supabase
        .from('gift_inventory')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('name') as { data: GiftInventory[] | null, error: any }

      if (invError) throw invError
      if (!currentInventory) throw new Error('Failed to load inventory')

      // 2. 모든 선물 로그 조회
      const { data: allGiftLogs, error: logError } = await supabase
        .from('gift_logs')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('date', { ascending: true }) as { data: GiftLog[] | null, error: any }

      if (logError) throw logError
      if (!allGiftLogs) throw new Error('Failed to load gift logs')

      // 3. 선물별 총 사용량 계산
      const giftUsage: Record<string, number> = {}
      allGiftLogs.forEach(log => {
        if (log.gift_type !== '없음') {
          if (!giftUsage[log.gift_type]) {
            giftUsage[log.gift_type] = 0
          }
          giftUsage[log.gift_type] += 1 // 기존 데이터는 수량이 1개로 가정
        }
      })

      // 4. 재고 입고 로그 조회
      const { data: inventoryLogs, error: logErr } = await supabase
        .from('inventory_logs')
        .select('*')
        .eq('clinic_id', clinicId)
        .gt('change', 0) // 입고 기록만 (양수)
        .order('timestamp', { ascending: true }) as { data: InventoryLog[] | null, error: any }

      if (logErr) throw logErr
      if (!inventoryLogs) throw new Error('Failed to load inventory logs')

      // 5. 선물별 총 입고량 계산
      const giftRestocked: Record<string, number> = {}
      inventoryLogs.forEach(log => {
        if (!giftRestocked[log.name]) {
          giftRestocked[log.name] = 0
        }
        giftRestocked[log.name] += log.change
      })

      // 6. 올바른 재고 계산 및 수정
      const corrections = []
      for (const item of currentInventory) {
        const totalRestocked = giftRestocked[item.name] || 0
        const totalUsed = giftUsage[item.name] || 0
        const correctStock = totalRestocked - totalUsed

        if (item.stock !== correctStock) {
          corrections.push({
            id: item.id,
            name: item.name,
            currentStock: item.stock,
            correctStock,
            difference: correctStock - item.stock
          })

          // 재고 수정
          const { error: updateError } = await (supabase as any)
            .from('gift_inventory')
            .update({ stock: correctStock })
            .eq('clinic_id', clinicId)
            .eq('id', item.id)

          if (updateError) throw updateError

          // 수정 로그 추가
          await supabase
            .from('inventory_logs')
            .insert([{
              clinic_id: clinicId,
              timestamp: new Date().toISOString(),
              name: item.name,
              reason: '재고 데이터 오류 수정',
              change: correctStock - item.stock,
              old_stock: item.stock,
              new_stock: correctStock
            }] as any)
        }
      }

      console.log('[FixInventory] 수정 완료:', corrections)

      return {
        success: true,
        message: `${corrections.length}개 항목의 재고가 수정되었습니다.`,
        corrections
      }
    } catch (error: unknown) {
      console.error('Error fixing inventory data:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 사용자 프로필 업데이트
  async updateUserProfile(id: string, updates: { name?: string; phone?: string }) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      // 사용자 ID (UUID)를 기준으로 직접 업데이트합니다.
      const { data, error } = await (supabase.from('users') as any)
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id) // email 대신 id를 사용합니다.
        .select()
        .single()

      if (error) throw error

      return { success: true, data }
    } catch (error: unknown) {
      console.error('Error updating user profile:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // === 마스터 관리자 전용 함수들 ===

  // 현재 사용자 프로필 가져오기
  async getUserProfile() {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) throw error
      return { data }
    } catch (error: unknown) {
      console.error('Error fetching user profile:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 모든 병원 목록 가져오기 (마스터 전용)
  async getAllClinics() {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const { data, error } = await supabase
        .from('clinics')
        .select(`
          *,
          users!users_clinic_id_fkey(count)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      return { data }
    } catch (error: unknown) {
      console.error('Error fetching all clinics:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 모든 사용자 목록 가져오기 (마스터 전용)
  async getAllUsers() {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          clinic:clinics(name)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      return { data }
    } catch (error: unknown) {
      console.error('Error fetching all users:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 시스템 통계 가져오기 (마스터 전용)
  async getSystemStatistics() {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      // 병원 수
      const { count: clinicsCount } = await supabase
        .from('clinics')
        .select('*', { count: 'exact', head: true })

      // 사용자 수
      const { count: usersCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })

      // 환자 수
      const { count: patientsCount } = await supabase
        .from('patients')
        .select('*', { count: 'exact', head: true })

      // 예약 수
      const { count: appointmentsCount } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })

      return {
        data: {
          totalClinics: clinicsCount || 0,
          totalUsers: usersCount || 0,
          totalPatients: patientsCount || 0,
          totalAppointments: appointmentsCount || 0
        }
      }
    } catch (error: unknown) {
      console.error('Error fetching system statistics:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 병원 삭제 (마스터 전용)
  async deleteClinic(clinicId: string) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      // 관련 데이터 먼저 삭제
      await supabase.from('appointments').delete().eq('clinic_id', clinicId)
      await supabase.from('inventory').delete().eq('clinic_id', clinicId)
      await supabase.from('inventory_categories').delete().eq('clinic_id', clinicId)
      await supabase.from('patients').delete().eq('clinic_id', clinicId)
      await supabase.from('users').delete().eq('clinic_id', clinicId)

      // 병원 삭제
      const { error } = await supabase
        .from('clinics')
        .delete()
        .eq('id', clinicId)

      if (error) throw error
      return { success: true }
    } catch (error: unknown) {
      console.error('Error deleting clinic:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 사용자 삭제 (마스터 전용)
  async deleteUser(userId: string) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId)

      if (error) throw error
      return { success: true }
    } catch (error: unknown) {
      console.error('Error deleting user:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 사용자 권한 업데이트
  async updateUserPermissions(userId: string, permissions: string[]) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const { data, error } = await (supabase.from('users') as any)
        .update({ permissions })
        .eq('id', userId)
        .select()
        .single()

      if (error) throw error
      return { success: true, data }
    } catch (error: unknown) {
      console.error('Error updating user permissions:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 사용자 승인 (직원 관리)
  async approveUser(userId: string, clinicId: string, permissions?: string[]) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      console.log('Approving user:', { userId, clinicId, permissions })

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('Current user not found')
      }

      const updateData: any = {
        status: 'active',
        approved_by: user.id,
        approved_at: new Date().toISOString()
      }

      // 권한이 지정된 경우 저장
      if (permissions && permissions.length > 0) {
        updateData.permissions = permissions
      }

      console.log('Update data:', updateData)

      const { data, error } = await (supabase.from('users') as any)
        .update(updateData)
        .eq('id', userId)
        .eq('clinic_id', clinicId)
        .select()

      if (error) {
        console.error('Supabase update error:', error)
        throw error
      }

      console.log('Updated user data:', data)
      return { success: true }
    } catch (error: unknown) {
      console.error('Error approving user - Full error:', error)
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      console.error('Error message:', errorMessage)
      return { error: errorMessage }
    }
  },

  // 사용자 거절 (직원 관리)
  async rejectUser(userId: string, clinicId: string, reason: string) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { error } = await (supabase.from('users') as any)
        .update({
          status: 'rejected',
          review_note: reason,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .eq('clinic_id', clinicId)

      if (error) throw error
      return { success: true }
    } catch (error: unknown) {
      console.error('Error rejecting user:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 병원 계정 상태 변경 (마스터 전용)
  async updateClinicStatus(clinicId: string, status: 'active' | 'suspended') {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const { error } = await (supabase.from('clinics') as any)
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', clinicId)

      if (error) throw error
      return { success: true }
    } catch (error: unknown) {
      console.error('Error updating clinic status:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 병원별 사용자 목록 조회 (마스터 전용)
  async getUsersByClinic(clinicId: string) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return { data }
    } catch (error: unknown) {
      console.error('Error fetching users by clinic:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },
}