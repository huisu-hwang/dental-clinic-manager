import { getSupabase } from './supabase'
import { applyClinicFilter, ensureClinicIds, backfillClinicIds } from './clinicScope'
import type { DailyReport, ConsultLog, GiftLog, HappyCallLog, ConsultRowData, GiftRowData, HappyCallRowData, GiftInventory, InventoryLog, ProtocolVersion, ProtocolFormData, ProtocolStep } from '@/types'
import { mapStepsForInsert, normalizeStepsFromDb, serializeStepsToHtml } from '@/utils/protocolStepUtils'

const CLINIC_CACHE_KEY = 'dental_clinic_id'
let cachedClinicId: string | null = null

const persistClinicId = (clinicId: string) => {
  cachedClinicId = clinicId
  if (typeof window !== 'undefined') {
    localStorage.setItem(CLINIC_CACHE_KEY, clinicId)
  }
}

const getCachedClinicId = (): string | null => {
  if (cachedClinicId) {
    return cachedClinicId
  }

  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(CLINIC_CACHE_KEY)
    if (stored) {
      cachedClinicId = stored
      return stored
    }
  }

  return null
}

const saveProtocolSteps = async (
  supabase: ReturnType<typeof getSupabase>,
  protocolId: string,
  versionId: string,
  steps?: ProtocolStep[]
) => {
  if (!supabase || !steps || steps.length === 0) {
    return
  }

  const payload = mapStepsForInsert(protocolId, versionId, steps)
  if (payload.length === 0) {
    return
  }

  const { error } = await (supabase
    .from('protocol_steps') as any)
    .insert(payload)

  if (error) {
    throw error
  }
}

// 세션 만료 확인 및 처리 함수
async function handleSessionError(supabase: ReturnType<typeof getSupabase>): Promise<boolean> {
  if (!supabase) return false

  try {
    // 세션 갱신 시도
    console.log('[handleSessionError] Attempting to refresh session...')
    const { data, error } = await supabase.auth.refreshSession()

    if (error) {
      console.error('[handleSessionError] Session refresh failed:', error)
      // 세션 갱신 실패 - 로그아웃 처리
      console.log('[handleSessionError] Clearing session and redirecting to login')
      localStorage.removeItem('dental_auth')
      localStorage.removeItem('dental_user')
      const keys = Object.keys(localStorage)
      keys.forEach(key => {
        if (key.startsWith('sb-')) {
          localStorage.removeItem(key)
        }
      })

      // 사용자에게 알림 후 로그인 페이지로 이동
      if (typeof window !== 'undefined') {
        alert('세션이 만료되었습니다. 다시 로그인해주세요.')
        window.location.href = '/'
      }
      return false
    }

    console.log('[handleSessionError] Session refreshed successfully')
    return true
  } catch (error) {
    console.error('[handleSessionError] Unexpected error:', error)
    return false
  }
}

// 현재 로그인한 사용자의 clinic_id를 가져오는 헬퍼 함수
async function getCurrentClinicId(): Promise<string | null> {
  try {
    const cached = getCachedClinicId()
    if (cached) {
      console.log('[getCurrentClinicId] Using cached clinic_id:', cached)
      return cached
    }

    if (typeof window !== 'undefined') {
      const cachedUser = localStorage.getItem('dental_user')
      if (cachedUser) {
        try {
          const userData = JSON.parse(cachedUser)
          if (userData.clinic_id) {
            persistClinicId(userData.clinic_id)
            console.log('[getCurrentClinicId] Restored clinic_id from cached user:', userData.clinic_id)
            return userData.clinic_id
          }
        } catch (e) {
          console.warn('[getCurrentClinicId] Failed to parse cached user data:', e)
        }
      }
    }

    const supabase = getSupabase()
    if (!supabase) {
      console.error('[getCurrentClinicId] Supabase client not available')
      return null
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      console.error('[getCurrentClinicId] Auth error:', authError)
      // 세션 만료 에러인 경우 갱신 시도
      if (authError.message?.includes('session') || authError.message?.includes('token') || authError.message?.includes('JWT')) {
        console.log('[getCurrentClinicId] Session error detected, attempting to refresh...')
        const refreshed = await handleSessionError(supabase)
        if (refreshed) {
          // 세션이 갱신되었으면 다시 시도
          return getCurrentClinicId()
        }
      }
      return null
    }

    if (!user) {
      console.error('[getCurrentClinicId] No authenticated user')
      return null
    }

    console.log('[getCurrentClinicId] Querying users table for user:', user.id)

    const { data, error } = await supabase
      .from('users')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    console.log('[getCurrentClinicId] Query result:', { data, error })

    if (error) {
      console.error('[getCurrentClinicId] Query error:', error)
      console.error('[getCurrentClinicId] Error code:', error.code)
      console.error('[getCurrentClinicId] Error message:', error.message)
      console.error('[getCurrentClinicId] Error details:', error.details)
      console.error('[getCurrentClinicId] Error hint:', error.hint)

      // 인증 관련 에러인 경우 세션 갱신 시도
      if (error.code === 'PGRST301' || error.message?.includes('JWT') || error.message?.includes('session')) {
        console.log('[getCurrentClinicId] Auth error detected in query, attempting to refresh...')
        const refreshed = await handleSessionError(supabase)
        if (refreshed) {
          // 세션이 갱신되었으면 다시 시도
          return getCurrentClinicId()
        }
      }
      return null
    }

    if (!data) {
      console.error('[getCurrentClinicId] No data returned for user:', user.id)
      return null
    }

    const clinicId = (data as any).clinic_id
    if (clinicId) {
      persistClinicId(clinicId)
    }
    console.log('[getCurrentClinicId] Retrieved clinic_id:', clinicId)

    return clinicId
  } catch (error) {
    console.error('[getCurrentClinicId] Unexpected error:', error)
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
  async getReportByDate(clinicId?: string, date?: string) {
    // 매개변수 처리: 이전 버전과의 호환성 유지
    let targetDate: string
    let targetClinicId: string | null

    if (typeof clinicId === 'string' && !date) {
      // 이전 방식: getReportByDate(date)
      targetDate = clinicId
      targetClinicId = await getCurrentClinicId()
    } else {
      // 새 방식: getReportByDate(clinicId, date)
      targetDate = date || ''
      targetClinicId = clinicId || null
    }

    console.log('[DataService] getReportByDate called with date:', targetDate, 'clinicId:', targetClinicId)

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
      // targetClinicId가 없으면 getCurrentClinicId()로 가져오기
      if (!targetClinicId) {
        targetClinicId = await getCurrentClinicId()
      }

      if (!targetClinicId) {
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

      console.log('[DataService] Starting data fetch for clinic:', targetClinicId)

      // 각 테이블을 개별적으로 조회하여 에러 격리
      let dailyReportResult, consultLogsResult, giftLogsResult, happyCallLogsResult;

      // daily_reports 조회
      try {
        dailyReportResult = await applyClinicFilter(
          supabase
            .from('daily_reports')
            .select('*')
            .eq('date', targetDate),
          targetClinicId
        ).maybeSingle();
        console.log('[DataService] daily_reports fetched:', dailyReportResult);
      } catch (err) {
        console.error('[DataService] Error fetching daily_reports:', err);
        dailyReportResult = { data: null, error: err };
      }

      // consult_logs 조회
      try {
        consultLogsResult = await applyClinicFilter(
          supabase
            .from('consult_logs')
            .select('*')
            .eq('date', targetDate)
            .order('id'),
          targetClinicId
        );
        console.log('[DataService] consult_logs fetched:', consultLogsResult?.data?.length || 0, 'items');
      } catch (err) {
        console.error('[DataService] Error fetching consult_logs:', err);
        consultLogsResult = { data: [], error: err };
      }

      // gift_logs 조회
      try {
        giftLogsResult = await applyClinicFilter(
          supabase
            .from('gift_logs')
            .select('*')
            .eq('date', targetDate)
            .order('id'),
          targetClinicId
        );
        console.log('[DataService] gift_logs fetched:', giftLogsResult?.data?.length || 0, 'items');
      } catch (err) {
        console.error('[DataService] Error fetching gift_logs:', err);
        giftLogsResult = { data: [], error: err };
      }

      // happy_call_logs 조회 (테이블이 없을 수 있음)
      try {
        happyCallLogsResult = await applyClinicFilter(
          supabase
            .from('happy_call_logs')
            .select('*')
            .eq('date', targetDate)
            .order('id'),
          targetClinicId
        );
        console.log('[DataService] happy_call_logs fetched:', happyCallLogsResult?.data?.length || 0, 'items');
      } catch (err) {
        console.warn('[DataService] Error fetching happy_call_logs (table might not exist):', err);
        happyCallLogsResult = { data: [], error: err };
      }

      const { normalized: normalizedDailyReport, missingIds: dailyIdsToBackfill } = ensureClinicIds(
        dailyReportResult?.data ? [dailyReportResult.data as DailyReport] : [],
        targetClinicId
      )
      const { normalized: normalizedConsultLogs, missingIds: consultIdsToBackfill } = ensureClinicIds(
        consultLogsResult?.data as ConsultLog[] | null,
        targetClinicId
      )
      const { normalized: normalizedGiftLogs, missingIds: giftIdsToBackfill } = ensureClinicIds(
        giftLogsResult?.data as GiftLog[] | null,
        targetClinicId
      )
      const { normalized: normalizedHappyCallLogs, missingIds: happyCallIdsToBackfill } = ensureClinicIds(
        happyCallLogsResult?.data as HappyCallLog[] | null,
        targetClinicId
      )

      if (dailyIdsToBackfill.length) {
        void backfillClinicIds(supabase, 'daily_reports', targetClinicId, dailyIdsToBackfill)
      }
      if (consultIdsToBackfill.length) {
        void backfillClinicIds(supabase, 'consult_logs', targetClinicId, consultIdsToBackfill)
      }
      if (giftIdsToBackfill.length) {
        void backfillClinicIds(supabase, 'gift_logs', targetClinicId, giftIdsToBackfill)
      }
      if (happyCallIdsToBackfill.length) {
        void backfillClinicIds(supabase, 'happy_call_logs', targetClinicId, happyCallIdsToBackfill)
      }

      const hasData =
        normalizedDailyReport.length > 0 ||
        normalizedConsultLogs.length > 0 ||
        normalizedGiftLogs.length > 0 ||
        normalizedHappyCallLogs.length > 0
      console.log('[DataService] Data fetch complete. Has data:', hasData)

      return {
        success: true,
        data: {
          dailyReport: normalizedDailyReport[0] ?? null,
          consultLogs: normalizedConsultLogs,
          giftLogs: normalizedGiftLogs,
          happyCallLogs: normalizedHappyCallLogs,
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
      const { data: existingReports, error: checkError } = await applyClinicFilter(
        supabase
          .from('daily_reports')
          .select('id')
          .eq('date', date)
          .limit(1),
        clinicId
      )

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
      const inventoryUpdates: Array<{ id: number; stock: number }> = []
      const inventoryLogs: Array<{
        timestamp: string
        name: string
        reason: string
        change: number
        old_stock: number
        new_stock: number
      }> = []

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

      const { data: reportsToDelete } = await applyClinicFilter(
        supabase
          .from('daily_reports')
          .select('id')
          .eq('date', date)
          .limit(1),
        clinicId
      )

      const reportToDelete = reportsToDelete?.[0] as { id: number } | undefined
      if (!reportToDelete) return { success: true }

      // --- 삭제 전 재고 복원 ---
      // 해당 날짜의 선물 데이터를 먼저 조회하여 재고 복원
      const { data: giftLogsToDelete } = (await applyClinicFilter(
        supabase
          .from('gift_logs')
          .select('*')
          .eq('date', date),
        clinicId
      )) as { data: GiftLog[] | null }

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
        applyClinicFilter(
          supabase.from('consult_logs').delete().eq('date', date),
          clinicId
        ),
        applyClinicFilter(
          supabase.from('gift_logs').delete().eq('date', date),
          clinicId
        ),
        applyClinicFilter(
          supabase.from('happy_call_logs').delete().eq('date', date),
          clinicId
        ),
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
      // 현재 로그인한 사용자의 clinic_id 가져오기
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      // 해당 날짜의 모든 로그 데이터 조회
      const [consultResult, giftResult, reportResult] = await Promise.all([
        applyClinicFilter(
          supabase.from('consult_logs').select('*').eq('date', date),
          clinicId
        ),
        applyClinicFilter(
          supabase.from('gift_logs').select('*').eq('date', date),
          clinicId
        ),
        applyClinicFilter(
          supabase.from('daily_reports').select('*').eq('date', date),
          clinicId
        ).maybeSingle()
      ])

      const { normalized: normalizedConsultLogs, missingIds: consultIdsToBackfill } = ensureClinicIds(
        consultResult.data as ConsultLog[] | null,
        clinicId
      )
      const { normalized: normalizedGiftLogs, missingIds: giftIdsToBackfill } = ensureClinicIds(
        giftResult.data as GiftLog[] | null,
        clinicId
      )
      const { normalized: normalizedReport, missingIds: reportIdsToBackfill } = ensureClinicIds(
        reportResult.data ? [reportResult.data as DailyReport] : [],
        clinicId
      )

      if (consultIdsToBackfill.length) {
        void backfillClinicIds(supabase, 'consult_logs', clinicId, consultIdsToBackfill)
      }
      if (giftIdsToBackfill.length) {
        void backfillClinicIds(supabase, 'gift_logs', clinicId, giftIdsToBackfill)
      }
      if (reportIdsToBackfill.length) {
        void backfillClinicIds(supabase, 'daily_reports', clinicId, reportIdsToBackfill)
      }

      const consultLogs = normalizedConsultLogs
      const giftLogs = normalizedGiftLogs
      const existingReport = normalizedReport[0]

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
      const { error: updateError } = await applyClinicFilter(
        (supabase as any)
          .from('daily_reports')
          .update(updatedStats)
          .eq('date', date),
        clinicId
      )

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
  async updateUserProfile(id: string, updates: { name?: string; phone?: string; address?: string; resident_registration_number?: string }) {
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

  // ========================================
  // 프로토콜 관리 함수들
  // ========================================

  // 프로토콜 카테고리 목록 조회
  async getProtocolCategories(clinicId?: string) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      // clinic_id가 전달되지 않으면 getCurrentClinicId()로 가져오기
      const targetClinicId = clinicId || await getCurrentClinicId()
      if (!targetClinicId) {
        throw new Error('User clinic information not available')
      }

      const { data, error } = await supabase
        .from('protocol_categories')
        .select('*')
        .eq('clinic_id', targetClinicId)
        .order('display_order')

      if (error) throw error
      return { data }
    } catch (error: unknown) {
      console.error('Error fetching protocol categories:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 프로토콜 카테고리 생성
  async createProtocolCategory(categoryData: { name: string; description?: string; color?: string; display_order?: number }) {
    const supabase = getSupabase()
    if (!supabase) {
      return { error: 'Supabase client not available' }
    }

    try {
      const clinicId = await getCurrentClinicId()
      console.log('[createProtocolCategory] clinicId:', clinicId)

      if (!clinicId) {
        return { error: 'User clinic information not available. Please make sure you are logged in.' }
      }

      const { data, error } = await (supabase
        .from('protocol_categories') as any)
        .insert([{
          clinic_id: clinicId,
          name: categoryData.name,
          description: categoryData.description || null,
          color: categoryData.color || '#3B82F6',
          display_order: categoryData.display_order || 0
        }])
        .select()
        .single()

      if (error) {
        console.error('[createProtocolCategory] Supabase error:', error)
        // Supabase 에러 객체에서 메시지 추출
        const errorMessage = error.message || error.details || error.hint || JSON.stringify(error)
        return { error: errorMessage }
      }

      return { success: true, data }
    } catch (error: unknown) {
      console.error('[createProtocolCategory] Unexpected error:', error)

      // 에러 메시지 추출 개선
      let errorMessage = 'Unknown error occurred'
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'string') {
        errorMessage = error
      } else if (error && typeof error === 'object') {
        errorMessage = JSON.stringify(error)
      }

      return { error: errorMessage }
    }
  },

  // 프로토콜 카테고리 수정
  async updateProtocolCategory(categoryId: string, updates: { name?: string; description?: string; color?: string; display_order?: number }) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const { data, error } = await (supabase
        .from('protocol_categories') as any)
        .update(updates)
        .eq('id', categoryId)
        .eq('clinic_id', clinicId)
        .select()
        .single()

      if (error) throw error
      return { success: true, data }
    } catch (error: unknown) {
      console.error('Error updating protocol category:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 프로토콜 카테고리 삭제
  async deleteProtocolCategory(categoryId: string) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const { error } = await supabase
        .from('protocol_categories')
        .delete()
        .eq('id', categoryId)
        .eq('clinic_id', clinicId)

      if (error) throw error
      return { success: true }
    } catch (error: unknown) {
      console.error('Error deleting protocol category:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 프로토콜 목록 조회
  async getProtocols(clinicId?: string, filters?: { status?: string; category_id?: string; search?: string }) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      console.log('[getProtocols] Starting fetch with clinicId:', clinicId, 'filters:', filters)

      // clinic_id가 전달되지 않으면 getCurrentClinicId()로 가져오기
      const targetClinicId = clinicId || await getCurrentClinicId()
      if (!targetClinicId) {
        console.error('[getProtocols] No clinic ID available')
        throw new Error('User clinic information not available')
      }

      console.log('[getProtocols] Using clinic ID:', targetClinicId)

      let query = supabase
        .from('protocols')
        .select(`
          *,
          category:protocol_categories(*)
        `)
        .eq('clinic_id', targetClinicId)
        .is('deleted_at', null)

      // 필터 적용
      if (filters?.status) {
        query = query.eq('status', filters.status)
      }
      if (filters?.category_id) {
        query = query.eq('category_id', filters.category_id)
      }
      if (filters?.search) {
        query = query.or(`title.ilike.%${filters.search}%,tags.cs.{${filters.search}}`)
      }

      console.log('[getProtocols] Executing query...')
      const { data: protocols, error } = await query.order('updated_at', { ascending: false })

      if (error) {
        console.error('[getProtocols] Query error:', error)
        throw error
      }

      console.log('[getProtocols] Query successful, protocols count:', protocols?.length || 0)

      // currentVersion 정보와 사용자 정보를 별도로 조회
      if (protocols && protocols.length > 0) {
        const protocolsWithVersions = await Promise.all(
          protocols.map(async (protocol: any) => {
            // 작성자 정보 조회
            let createdByUser = null
            if (protocol.created_by) {
              const { data: userData } = await supabase
                .from('users')
                .select('id, name, email')
                .eq('id', protocol.created_by)
                .single()
              createdByUser = userData
            }

            // currentVersion 정보 조회
            if (protocol.current_version_id) {
              const versionResponse = await (supabase
                .from('protocol_versions')
                .select('id, version_number, created_at, created_by')
                .eq('id', protocol.current_version_id)
                .single() as unknown as { data: { id: string; version_number: number; created_at: string; created_by: string | null } | null; error: unknown })

              const version = versionResponse.data

              // 버전 작성자 정보 조회
              let versionCreatedByUser = null
              if (version?.created_by) {
                const { data: versionUserData } = await supabase
                  .from('users')
                  .select('id, name, email')
                  .eq('id', version.created_by)
                  .single()
                versionCreatedByUser = versionUserData
              }

              return {
                ...protocol,
                created_by_user: createdByUser,
                currentVersion: version ? { ...version, created_by_user: versionCreatedByUser } : null
              }
            }
            return { ...protocol, created_by_user: createdByUser }
          })
        )
        console.log('[getProtocols] Enriched protocols with versions and users')
        return { data: protocolsWithVersions }
      }

      console.log('[getProtocols] No protocols found or protocols is empty')
      return { data: protocols || [] }
    } catch (error: unknown) {
      console.error('[getProtocols] Error fetching protocols:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 프로토콜 상세 조회 (ID로)
  async getProtocolById(protocolId: string) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      console.log('[getProtocolById] Fetching protocol:', protocolId)

      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const { data: protocol, error } = await supabase
        .from('protocols')
        .select(`
          *,
          category:protocol_categories(*)
        `)
        .eq('id', protocolId)
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .single()

      if (error) {
        console.error('[getProtocolById] Query error:', error)
        throw error
      }

      const typedProtocol = protocol as any

      // 작성자 정보 조회
      let createdByUser = null
      if (typedProtocol.created_by) {
        const { data: userData } = await supabase
          .from('users')
          .select('id, name, email')
          .eq('id', typedProtocol.created_by)
          .single()
        createdByUser = userData
      }

      // currentVersion 정보를 별도로 조회
      if (typedProtocol && typedProtocol.current_version_id) {
        const { data: versionData } = await supabase
          .from('protocol_versions')
          .select('id, version_number, content, change_summary, change_type, created_at, created_by')
          .eq('id', typedProtocol.current_version_id)
          .single()

        // 버전 작성자 정보 조회
        type VersionAuthor = { id: string; name: string | null; email: string | null } | null

        let versionCreatedByUser: VersionAuthor = null
        const version = (versionData ?? null) as (ProtocolVersion & { created_by?: string | null }) | null
        if (version?.created_by) {
          const { data: versionUserData } = await supabase
            .from('users')
            .select('id, name, email')
            .eq('id', version.created_by)
            .single()
          versionCreatedByUser = (versionUserData ?? null) as VersionAuthor
        }

        let steps: ProtocolStep[] = []
        if (typedProtocol.current_version_id) {
          const { data: stepsData, error: stepsError } = await supabase
            .from('protocol_steps')
            .select('*')
            .eq('protocol_id', protocolId)
            .eq('version_id', typedProtocol.current_version_id)
            .order('step_order', { ascending: true })

          if (stepsError) {
            console.error('[getProtocolById] Failed to fetch steps:', stepsError)
          } else {
            steps = normalizeStepsFromDb(stepsData as any[])
          }
        }

        console.log('[getProtocolById] Protocol fetched successfully with version')
        return {
          data: {
            ...typedProtocol,
            created_by_user: createdByUser,
            currentVersion: version
              ? ({
                  ...version,
                  steps,
                  created_by_user: versionCreatedByUser ?? undefined
                } as ProtocolVersion & { created_by_user?: VersionAuthor })
              : null
          }
        }
      }

      console.log('[getProtocolById] Protocol fetched successfully without version')
      return { data: { ...typedProtocol, created_by_user: createdByUser } }
    } catch (error: unknown) {
      console.error('[getProtocolById] Error fetching protocol by ID:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 프로토콜 생성
  async createProtocol(formData: ProtocolFormData) {
    console.log('[createProtocol] Starting with formData:', {
      title: formData.title,
      category_id: formData.category_id,
      status: formData.status,
      contentLength: formData.content?.length || 0
    })

    const supabase = getSupabase()
    if (!supabase) {
      console.error('[createProtocol] Supabase client not available')
      throw new Error('Supabase client not available')
    }

    try {
      console.log('[createProtocol] Getting clinic ID...')
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        console.error('[createProtocol] No clinic ID')
        throw new Error('User clinic information not available')
      }
      console.log('[createProtocol] Clinic ID:', clinicId)

      console.log('[createProtocol] Getting authenticated user...')
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.error('[createProtocol] User not authenticated')
        throw new Error('User not authenticated')
      }
      console.log('[createProtocol] User ID:', user.id)

      // 1. 프로토콜 생성
      console.log('[createProtocol] Step 1: Creating protocol...')
      const protocolData = {
        clinic_id: clinicId,
        title: formData.title,
        category_id: formData.category_id || null,
        status: formData.status,
        tags: formData.tags || [],
        created_by: user.id
      }
      console.log('[createProtocol] Protocol data:', protocolData)

      const { data: protocol, error: protocolError } = await (supabase
        .from('protocols') as any)
        .insert([protocolData])
        .select()
        .single()

      if (protocolError) {
        console.error('[createProtocol] Protocol creation error:', protocolError)
        throw protocolError
      }
      console.log('[createProtocol] Protocol created successfully:', protocol.id)

      // 2. 첫 번째 버전 생성
      console.log('[createProtocol] Step 2: Creating first version...')
      const versionContent =
        formData.steps && formData.steps.length > 0
          ? serializeStepsToHtml(formData.steps)
          : formData.content

      const versionData = {
        protocol_id: protocol.id,
        version_number: '1.0',
        content: versionContent,
        change_summary: formData.change_summary || '초기 버전',
        created_by: user.id
      }
      console.log('[createProtocol] Version data:', {
        ...versionData,
        content: versionData.content?.substring(0, 100) + '...'
      })

      const { data: version, error: versionError } = await (supabase
        .from('protocol_versions') as any)
        .insert([versionData])
        .select()
        .single()

      if (versionError) {
        console.error('[createProtocol] Version creation error:', versionError)
        throw versionError
      }
      console.log('[createProtocol] Version created successfully:', version.id)

      if (formData.steps && formData.steps.length > 0) {
        await saveProtocolSteps(supabase, protocol.id, version.id, formData.steps)
      }

      // 3. 프로토콜의 current_version_id 업데이트
      console.log('[createProtocol] Step 3: Updating current_version_id...')
      const { error: updateError } = await (supabase
        .from('protocols') as any)
        .update({ current_version_id: version.id })
        .eq('id', protocol.id)
        .eq('clinic_id', clinicId)

      if (updateError) {
        console.error('[createProtocol] Update error:', updateError)
        throw updateError
      }
      console.log('[createProtocol] Successfully updated current_version_id')

      console.log('[createProtocol] ✅ Protocol creation completed successfully')
      return { success: true, data: { ...protocol, current_version_id: version.id } }
    } catch (error: unknown) {
      console.error('[createProtocol] ❌ Error creating protocol:', error)
      if (error && typeof error === 'object') {
        console.error('[createProtocol] Error details:', JSON.stringify(error, null, 2))
      }
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 프로토콜 수정 (새 버전 생성)
  async updateProtocol(protocolId: string, formData: ProtocolFormData) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User not authenticated')

      // 1. 새 버전 번호 계산
      const { data: versionNumber, error: calcError } = await (supabase as any)
        .rpc('calculate_next_protocol_version', {
          p_protocol_id: protocolId,
          p_change_type: formData.change_type || 'minor'
        })

      if (calcError) throw calcError

      // 2. 새 버전 생성
      const versionContent =
        formData.steps && formData.steps.length > 0
          ? serializeStepsToHtml(formData.steps)
          : formData.content

      const { data: version, error: versionError } = await (supabase
        .from('protocol_versions') as any)
        .insert([{
          protocol_id: protocolId,
          version_number: versionNumber,
          content: versionContent,
          change_summary: formData.change_summary || '내용 수정',
          change_type: formData.change_type || 'minor',
          created_by: user.id
        }])
        .select()
        .single()

      if (versionError) throw versionError

      if (formData.steps && formData.steps.length > 0) {
        await saveProtocolSteps(supabase, protocolId, version.id, formData.steps)
      }

      // 3. 프로토콜 업데이트
      const updateData: any = {
        current_version_id: version.id,
        updated_at: new Date().toISOString()
      }

      if (formData.title) updateData.title = formData.title
      if (formData.category_id !== undefined) updateData.category_id = formData.category_id
      if (formData.status) updateData.status = formData.status
      if (formData.tags) updateData.tags = formData.tags

      const { data: protocol, error: updateError } = await (supabase
        .from('protocols') as any)
        .update(updateData)
        .eq('id', protocolId)
        .eq('clinic_id', clinicId)
        .select()
        .single()

      if (updateError) throw updateError

      return { success: true, data: protocol }
    } catch (error: unknown) {
      console.error('Error updating protocol:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 프로토콜 삭제 (소프트 삭제)
  async deleteProtocol(protocolId: string) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const { error } = await (supabase
        .from('protocols') as any)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', protocolId)
        .eq('clinic_id', clinicId)

      if (error) throw error
      return { success: true }
    } catch (error: unknown) {
      console.error('Error deleting protocol:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 프로토콜 버전 히스토리 조회
  async getProtocolVersions(protocolId: string) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      // 프로토콜이 현재 클리닉 소속인지 확인
      const { data: protocol, error: protocolError } = await supabase
        .from('protocols')
        .select('id')
        .eq('id', protocolId)
        .eq('clinic_id', clinicId)
        .single()

      if (protocolError || !protocol) {
        throw new Error('Protocol not found or access denied')
      }

      const { data, error } = await supabase
        .from('protocol_versions')
        .select(`
          *,
          created_by_user:users!protocol_versions_created_by_fkey(id, name, email)
        `)
        .eq('protocol_id', protocolId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return { data }
    } catch (error: unknown) {
      console.error('Error fetching protocol versions:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 프로토콜 버전 복원
  async restoreProtocolVersion(protocolId: string, versionId: string) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User not authenticated')

      // 1. 복원할 버전 조회
      const { data: oldVersion, error: versionError } = await supabase
        .from('protocol_versions')
        .select('*')
        .eq('id', versionId)
        .eq('protocol_id', protocolId)
        .single()

      if (versionError || !oldVersion) throw new Error('Version not found')
      const typedOldVersion = oldVersion as any

      let oldSteps: ProtocolStep[] = []
      const { data: oldStepsData, error: oldStepsError } = await supabase
        .from('protocol_steps')
        .select('*')
        .eq('protocol_id', protocolId)
        .eq('version_id', versionId)
        .order('step_order', { ascending: true })

      if (oldStepsError) {
        console.error('[restoreProtocolVersion] Failed to fetch steps for restoration:', oldStepsError)
      } else {
        oldSteps = normalizeStepsFromDb(oldStepsData as any[])
      }

      // 2. 프로토콜이 현재 클리닉 소속인지 확인
      const { data: protocol, error: protocolError } = await supabase
        .from('protocols')
        .select('*')
        .eq('id', protocolId)
        .eq('clinic_id', clinicId)
        .single()

      if (protocolError || !protocol) {
        throw new Error('Protocol not found or access denied')
      }

      // 3. 새 버전 번호 계산
      const { data: versionNumber, error: calcError } = await (supabase as any)
        .rpc('calculate_next_protocol_version', {
          p_protocol_id: protocolId,
          p_change_type: 'minor'
        })

      if (calcError) throw calcError

      // 4. 복원된 내용으로 새 버전 생성
      const { data: newVersion, error: createError } = await (supabase
        .from('protocol_versions') as any)
        .insert([{
          protocol_id: protocolId,
          version_number: versionNumber,
          content: typedOldVersion.content,
          change_summary: `버전 ${typedOldVersion.version_number}으로 복원`,
          change_type: 'minor',
          created_by: user.id
        }])
        .select()
        .single()

      if (createError) throw createError

      if (oldSteps.length > 0) {
        await saveProtocolSteps(supabase, protocolId, newVersion.id, oldSteps)
      }

      // 5. 프로토콜의 current_version_id 업데이트
      const { error: updateError } = await (supabase
        .from('protocols') as any)
        .update({
          current_version_id: newVersion.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', protocolId)
        .eq('clinic_id', clinicId)

      if (updateError) throw updateError

      return { success: true, data: newVersion }
    } catch (error: unknown) {
      console.error('Error restoring protocol version:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // ========================================
  // 비밀번호 관리 함수들
  // ========================================

  // 비밀번호 확인 (재인증)
  async verifyPassword(email: string, password: string) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      console.log('[DataService] Verifying password for:', email)

      // 현재 비밀번호로 로그인 시도 (재인증)
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) {
        console.error('[DataService] Password verification failed:', error)
        return { success: false, error: error.message }
      }

      console.log('[DataService] Password verified successfully')
      return { success: true }
    } catch (error: unknown) {
      console.error('[DataService] Error verifying password:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 비밀번호 업데이트
  async updatePassword(newPassword: string) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      console.log('[DataService] Updating password')

      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) {
        console.error('[DataService] Password update failed:', error)
        return { error: error.message }
      }

      console.log('[DataService] Password updated successfully')
      return { success: true }
    } catch (error: unknown) {
      console.error('[DataService] Error updating password:', error)
      return { error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  // 현재 세션 정보 가져오기
  async getSession() {
    try {
      // 먼저 clinic_id 가져오기 (localStorage 또는 Supabase에서)
      const clinicId = await getCurrentClinicId()

      // Supabase 세션 확인 시도
      const supabase = getSupabase()
      if (supabase) {
        try {
          const { data: { user }, error: authError } = await supabase.auth.getUser()

          if (user && !authError) {
            return {
              data: {
                user,
                clinicId
              }
            }
          }
        } catch (supabaseError) {
          console.warn('[DataService] Supabase session check failed, falling back to localStorage')
        }
      }

      // Supabase 세션이 없으면 localStorage에서 사용자 정보 가져오기
      if (typeof window !== 'undefined') {
        const authStatus = localStorage.getItem('dental_auth')
        const userData = localStorage.getItem('dental_user')

        if (authStatus === 'true' && userData) {
          try {
            const user = JSON.parse(userData)
            return {
              data: {
                user,
                clinicId
              }
            }
          } catch (parseError) {
            console.error('[DataService] Failed to parse localStorage user data')
          }
        }
      }

      // 세션 정보를 찾을 수 없음
      return { data: null, error: 'No authenticated user' }
    } catch (error: unknown) {
      console.error('[DataService] Error getting session:', error)
      return { data: null, error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  },

  clearCachedClinicId() {
    cachedClinicId = null
    if (typeof window !== 'undefined') {
      localStorage.removeItem(CLINIC_CACHE_KEY)
    }
  },

  setCachedClinicId(clinicId: string | null) {
    if (!clinicId) {
      return
    }
    persistClinicId(clinicId)
  }
}