import { createClient } from './supabase/client'
import { ensureConnection } from './supabase/connectionCheck'
import { applyClinicFilter, ensureClinicIds, backfillClinicIds } from './clinicScope'
import type { DailyReport, ConsultLog, GiftLog, HappyCallLog, ConsultRowData, GiftRowData, HappyCallRowData, GiftInventory, InventoryLog, ProtocolVersion, ProtocolFormData, ProtocolStep, SpecialNotesHistory } from '@/types'
import type { ClinicBranch } from '@/types/branch'
import { mapStepsForInsert, normalizeStepsFromDb, serializeStepsToHtml } from '@/utils/protocolStepUtils'

const CLINIC_CACHE_KEY = 'dental_clinic_id'
let cachedClinicId: string | null = null
// Force recompile

// Helper function to extract error message from various error types (including Supabase PostgrestError)
const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (error && typeof error === 'object') {
    // Handle Supabase PostgrestError which has message property
    if ('message' in error && typeof (error as any).message === 'string') {
      return (error as any).message
    }
    // Handle error object with error property
    if ('error' in error && typeof (error as any).error === 'string') {
      return (error as any).error
    }
  }
  return 'Unknown error occurred'
}

const persistClinicId = (clinicId: string) => {
  cachedClinicId = clinicId
  if (typeof window !== 'undefined') {
    // rememberMe 플래그에 따라 storage 선택
    const rememberMe = localStorage.getItem('dental_remember_me') === 'true'
    const storage = rememberMe ? window.localStorage : window.sessionStorage
    storage.setItem(CLINIC_CACHE_KEY, clinicId)
  }
}

const getCachedClinicId = (): string | null => {
  if (cachedClinicId) {
    return cachedClinicId
  }

  if (typeof window !== 'undefined') {
    // sessionStorage를 우선 체크하고, 없으면 localStorage도 체크
    const storedInSession = sessionStorage.getItem(CLINIC_CACHE_KEY)
    if (storedInSession) {
      cachedClinicId = storedInSession
      return storedInSession
    }

    const storedInLocal = localStorage.getItem(CLINIC_CACHE_KEY)
    if (storedInLocal) {
      cachedClinicId = storedInLocal
      return storedInLocal
    }
  }

  return null
}

const saveProtocolSteps = async (
  supabase: ReturnType<typeof createClient>,
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
async function handleSessionError(supabase: ReturnType<typeof createClient>): Promise<boolean> {
  if (!supabase) return false

  try {
    // 세션 갱신 시도 (타임아웃 포함)
    console.log('[handleSessionError] Attempting to refresh session with timeout...')

    // refreshSessionWithTimeout() 동적 import
    const { refreshSessionWithTimeout, handleSessionExpired } = await import('./sessionUtils')

    const { session, error } = await refreshSessionWithTimeout(supabase, 5000)

    if (error || !session) {
      console.error('[handleSessionError] Session refresh failed:', error)

      // 세션 갱신 실패 - 로그아웃 처리
      if (typeof window !== 'undefined') {
        console.log('[handleSessionError] Session expired, redirecting to login')
        handleSessionExpired('session_refresh_failed')
      }
      return false
    }

    console.log('[handleSessionError] Session refreshed successfully')
    return true
  } catch (error) {
    console.error('[handleSessionError] Unexpected error:', error)

    // 예상치 못한 에러 발생 시에도 로그아웃 처리
    if (typeof window !== 'undefined') {
      const { handleSessionExpired } = await import('./sessionUtils')
      handleSessionExpired('session_error')
    }
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
      // sessionStorage를 우선 체크, 없으면 localStorage 체크 (rememberMe 옵션 대응)
      const cachedUser = sessionStorage.getItem('dental_user') || localStorage.getItem('dental_user')
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

    const supabase = await ensureConnection()
    if (!supabase) {
      console.error('[getCurrentClinicId] Supabase client not available')
      return null
    }

    // getUser() 호출에 타임아웃 추가 (5초)
    console.log('[getCurrentClinicId] Fetching user with timeout...')
    const getUserPromise = supabase.auth.getUser()
    const timeoutPromise = new Promise<{ data: { user: null }, error: any }>((_, reject) =>
      setTimeout(() => reject(new Error('User fetch timeout after 5 seconds')), 5000)
    )

    let getUserResult
    try {
      getUserResult = await Promise.race([getUserPromise, timeoutPromise])
    } catch (timeoutError) {
      console.error('[getCurrentClinicId] getUser() timeout:', timeoutError)
      // 타임아웃 발생 시 세션 갱신 시도
      console.log('[getCurrentClinicId] Timeout detected, attempting to refresh session...')
      const refreshed = await handleSessionError(supabase)
      if (refreshed) {
        // 세션이 갱신되었으면 다시 시도 (단, 재귀는 1회만)
        console.log('[getCurrentClinicId] Session refreshed, retrying once...')
        try {
          getUserResult = await Promise.race([
            supabase.auth.getUser(),
            new Promise<{ data: { user: null }, error: any }>((_, reject) =>
              setTimeout(() => reject(new Error('User fetch timeout (retry)')), 5000)
            )
          ])
        } catch (retryError) {
          console.error('[getCurrentClinicId] Retry also timed out:', retryError)
          return null
        }
      } else {
        return null
      }
    }

    let { data: userData, error: authError } = getUserResult
    let user = userData?.user

    if (authError || !user) {
      console.error('[getCurrentClinicId] Auth error:', authError)
      // 세션 만료 에러인 경우 갱신 시도 (1회만)
      if (authError?.message?.includes('session') || authError?.message?.includes('token') || authError?.message?.includes('JWT')) {
        console.log('[getCurrentClinicId] Session error detected, attempting to refresh...')
        const refreshed = await handleSessionError(supabase)
        if (refreshed) {
          // 세션이 갱신되었으면 다시 getUser() 시도 (재귀 아님)
          console.log('[getCurrentClinicId] Session refreshed, retrying getUser() once...')
          try {
            const retryResult = await Promise.race([
              supabase.auth.getUser(),
              new Promise<{ data: { user: null }, error: any }>((_, reject) =>
                setTimeout(() => reject(new Error('User fetch timeout (auth error retry)')), 5000)
              )
            ])
            userData = retryResult.data
            authError = retryResult.error as any
            user = userData?.user
          } catch (retryError) {
            console.error('[getCurrentClinicId] Auth error retry failed:', retryError)
            return null
          }
        } else {
          return null
        }
      } else {
        return null
      }
    }

    // 최종 체크
    if (!user) {
      console.error('[getCurrentClinicId] No authenticated user after all checks')
      return null
    }

    console.log('[getCurrentClinicId] Querying users table for user:', user.id)

    // users 테이블 조회에 타임아웃 추가 (5초)
    const queryPromise = supabase
      .from('users')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    const queryTimeoutPromise = new Promise<{ data: null, error: any }>((_, reject) =>
      setTimeout(() => reject(new Error('Database query timeout after 5 seconds')), 5000)
    )

    let queryResult
    try {
      queryResult = await Promise.race([queryPromise, queryTimeoutPromise])
    } catch (timeoutError) {
      console.error('[getCurrentClinicId] Database query timeout:', timeoutError)
      // 타임아웃 발생 시 세션 문제일 수 있으므로 갱신 시도
      console.log('[getCurrentClinicId] Query timeout, attempting to refresh session...')
      const refreshed = await handleSessionError(supabase)
      if (refreshed) {
        console.log('[getCurrentClinicId] Session refreshed, retrying query once...')
        try {
          queryResult = await Promise.race([
            supabase.from('users').select('clinic_id').eq('id', user.id).single(),
            new Promise<{ data: null, error: any }>((_, reject) =>
              setTimeout(() => reject(new Error('Database query timeout (retry)')), 5000)
            )
          ])
        } catch (retryError) {
          console.error('[getCurrentClinicId] Query retry also timed out:', retryError)
          return null
        }
      } else {
        return null
      }
    }

    const { data, error } = queryResult

    console.log('[getCurrentClinicId] Query result:', { data, error })

    if (error) {
      console.error('[getCurrentClinicId] Query error:', error)
      console.error('[getCurrentClinicId] Error code:', error.code)
      console.error('[getCurrentClinicId] Error message:', error.message)
      console.error('[getCurrentClinicId] Error details:', error.details)
      console.error('[getCurrentClinicId] Error hint:', error.hint)

      // 인증 관련 에러인 경우 세션 갱신 시도 (1회만)
      if (error.code === 'PGRST301' || error.message?.includes('JWT') || error.message?.includes('session')) {
        console.log('[getCurrentClinicId] Auth error detected in query, attempting to refresh...')
        const refreshed = await handleSessionError(supabase)
        if (refreshed) {
          // 세션이 갱신되었으면 다시 쿼리 시도 (재귀 아님)
          console.log('[getCurrentClinicId] Session refreshed, retrying query once...')
          try {
            const retryResult = await Promise.race([
              supabase.from('users').select('clinic_id').eq('id', user.id).single(),
              new Promise<{ data: null, error: any }>((_, reject) =>
                setTimeout(() => reject(new Error('Database query timeout (auth error retry)')), 5000)
              )
            ])
            queryResult = retryResult
          } catch (retryError) {
            console.error('[getCurrentClinicId] Query retry after auth error failed:', retryError)
            return null
          }
        } else {
          return null
        }
      } else {
        return null
      }
    }

    // 재시도 후 다시 체크
    if (!queryResult || queryResult.error) {
      console.error('[getCurrentClinicId] Still have query error after retry')
      return null
    }

    const { data: finalData, error: finalError } = queryResult

    if (finalError) {
      console.error('[getCurrentClinicId] Final query check failed:', finalError)
      return null
    }

    if (!finalData) {
      console.error('[getCurrentClinicId] No data returned for user:', user.id)
      return null
    }

    const clinicId = (finalData as any).clinic_id
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
  // 공개된 병원 목록 검색 (비로그인 사용자도 접근 가능)
  async searchPublicClinics() {
    // 회원가입 시 호출되므로 ensureConnection() 대신 createClient() 사용
    // ensureConnection()은 세션이 없으면 랜딩페이지로 리다이렉트하기 때문
    const supabase = createClient()
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
    const supabase = await ensureConnection()

    if (!supabase) {
      console.warn('[dataService] Supabase client not available in getUserProfileById (likely server-side).')
      return { error: 'Supabase client not available' }
    }

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
      return { error: extractErrorMessage(error) }
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

    // 데이터베이스 연결 확인 및 세션 갱신
    const supabase = await ensureConnection()
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

      // special_notes_history에서 해당 날짜의 최신 특이사항 조회
      let latestSpecialNote: { content: string; author_name: string } | null = null;
      try {
        const { data: specialNotesData } = await supabase
          .from('special_notes_history')
          .select('content, author_name')
          .eq('clinic_id', targetClinicId)
          .eq('report_date', targetDate)
          .order('edited_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (specialNotesData) {
          latestSpecialNote = specialNotesData;
          console.log('[DataService] special_notes_history fetched for date:', targetDate);
        }
      } catch (err) {
        console.warn('[DataService] Error fetching special_notes_history:', err);
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

      // special_notes_history에서 가져온 값이 있으면 dailyReport에 설정
      const hasSpecialNotes = latestSpecialNote !== null
      const hasData =
        normalizedDailyReport.length > 0 ||
        normalizedConsultLogs.length > 0 ||
        normalizedGiftLogs.length > 0 ||
        normalizedHappyCallLogs.length > 0 ||
        hasSpecialNotes
      console.log('[DataService] Data fetch complete. Has data:', hasData)

      // dailyReport 객체 생성 (special_notes는 special_notes_history에서 가져옴)
      let dailyReport = normalizedDailyReport[0] ?? null
      if (dailyReport && latestSpecialNote) {
        dailyReport = {
          ...dailyReport,
          special_notes: latestSpecialNote.content
        }
      } else if (!dailyReport && latestSpecialNote) {
        // dailyReport가 없지만 특이사항만 있는 경우
        dailyReport = {
          date: targetDate,
          clinic_id: targetClinicId,
          recall_count: 0,
          recall_booking_count: 0,
          consult_proceed: 0,
          consult_hold: 0,
          naver_review_count: 0,
          special_notes: latestSpecialNote.content
        } as DailyReport
      }

      return {
        success: true,
        data: {
          dailyReport,
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
  async saveReport(data: {
    date: string
    consultRows: ConsultRowData[]
    giftRows: GiftRowData[]
    happyCallRows: HappyCallRowData[]
    recallCount: number
    recallBookingCount: number
    recallBookingNames: string
    specialNotes: string
  }) {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    const {
      date,
      consultRows,
      giftRows,
      happyCallRows,
      recallCount,
      recallBookingCount,
      recallBookingNames,
      specialNotes
    } = data

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      // --- 1. 데이터 유효성 검사 ---
      const validConsults = consultRows.filter(row => row.patient_name.trim() !== '' || row.consult_content.trim() !== '')
      const validGifts = giftRows.filter(row => row.patient_name.trim() !== '')
      const validHappyCalls = happyCallRows.filter(row => row.patient_name.trim() !== '')

      // --- 2. 기존 보고서 확인 ---
      const { data: existingReports, error: checkError } = await applyClinicFilter(
        supabase.from('daily_reports').select('id').eq('date', date),
        clinicId
      )

      if (checkError) {
        throw new Error(`기존 보고서 확인 실패: ${checkError.message}`)
      }

      // --- 3. 기존 데이터 삭제 (존재하는 경우) ---
      if (existingReports && existingReports.length > 0) {
        console.log(`[DataService] Deleting existing data for date: ${date}`)
        for (const report of existingReports) {
          await Promise.all([
            applyClinicFilter(supabase.from('consult_logs').delete().eq('date', date), clinicId),
            applyClinicFilter(supabase.from('gift_logs').delete().eq('date', date), clinicId),
            applyClinicFilter(supabase.from('happy_call_logs').delete().eq('date', date), clinicId),
            supabase.from('daily_reports').delete().eq('id', report.id)
          ])
        }
      }

      // --- 4. 신규 데이터 생성 ---
      // 참고: special_notes는 special_notes_history 테이블에만 저장됨
      const dailyReport = {
        clinic_id: clinicId,
        date,
        recall_count: recallCount,
        recall_booking_count: recallBookingCount,
        recall_booking_names: recallBookingNames.trim() || null,
        consult_proceed: validConsults.filter(c => c.consult_status === 'O').length,
        consult_hold: validConsults.filter(c => c.consult_status === 'X').length,
        naver_review_count: validGifts.filter(g => g.naver_review === 'O').length,
      }

      const { error: dailyReportError } = await supabase.from('daily_reports').insert([dailyReport] as any)
      if (dailyReportError) throw new Error(`일일 보고서 저장 실패: ${dailyReportError.message}`)

      if (validConsults.length > 0) {
        const consultData = validConsults.map(row => ({
          clinic_id: clinicId,
          date,
          patient_name: row.patient_name,
          consult_content: row.consult_content,
          consult_status: row.consult_status,
          remarks: row.remarks ?? ''
        }))
        const { error } = await supabase.from('consult_logs').insert(consultData as any)
        if (error) throw new Error(`상담 기록 저장 실패: ${error.message}`)
      }

      if (validGifts.length > 0) {
        const giftData = validGifts.map(row => ({
          clinic_id: clinicId,
          date,
          patient_name: row.patient_name,
          gift_type: row.gift_type,
          naver_review: row.naver_review,
          notes: row.notes ?? ''
        }))
        const { error } = await supabase.from('gift_logs').insert(giftData as any)
        if (error) throw new Error(`선물 기록 저장 실패: ${error.message}`)
      }

      if (validHappyCalls.length > 0) {
        const happyCallData = validHappyCalls.map(row => ({
          clinic_id: clinicId,
          date,
          patient_name: row.patient_name,
          treatment: row.treatment,
          notes: row.notes
        }))
        const { error } = await supabase.from('happy_call_logs').insert(happyCallData as any)
        if (error) throw new Error(`해피콜 기록 저장 실패: ${error.message}`)
      }

      // --- 5. 특이사항 히스토리 저장 ---
      const trimmedSpecialNotes = specialNotes?.trim()
      if (trimmedSpecialNotes) {
        try {
          // 현재 사용자 정보 가져오기
          const { data: { user } } = await supabase.auth.getUser()
          let authorName = '알 수 없음'

          if (user) {
            const { data: userProfile } = await supabase
              .from('users')
              .select('name')
              .eq('id', user.id)
              .single()

            if (userProfile?.name) {
              authorName = userProfile.name
            }
          }

          // 오늘 날짜와 비교하여 과거 날짜 수정인지 확인
          const today = new Date().toISOString().split('T')[0]
          const isPastDateEdit = date < today

          const { error: historyError } = await supabase
            .from('special_notes_history')
            .insert({
              clinic_id: clinicId,
              report_date: date,
              content: trimmedSpecialNotes,
              author_id: user?.id || null,
              author_name: authorName,
              is_past_date_edit: isPastDateEdit,
              edited_at: new Date().toISOString()
            })

          if (historyError) {
            // 히스토리 저장 실패는 로그만 남기고 전체 저장은 성공으로 처리
            console.error('[DataService] Failed to save special notes history:', historyError)
          } else {
            console.log(`[DataService] Special notes history saved (isPastDateEdit: ${isPastDateEdit})`)
          }
        } catch (historyError) {
          console.error('[DataService] Error saving special notes history:', historyError)
        }
      }

      return { success: true }
    } catch (error: unknown) {
      console.error('Error saving report:', error)
      return { error: error instanceof Error ? error.message : 'An unknown error occurred during saveReport.' }
    }
  },

  // 날짜별 보고서 삭제
  async deleteReportByDate(date: string) {
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 일일 보고서 통계 재계산 (데이터 불일치 해결용)
  async recalculateDailyReportStats(date: string) {
    const supabase = await ensureConnection()
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
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 선물 아이템 추가
  async addGiftItem(name: string, stock: number) {
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 선물 아이템 삭제
  async deleteGiftItem(id: number) {
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 재고 데이터 수정 (잘못된 재고 수치 복구)
  async fixInventoryData() {
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 사용자 프로필 업데이트
  async updateUserProfile(id: string, updates: { name?: string; phone?: string; address?: string; resident_registration_number?: string }) {
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // === 마스터 관리자 전용 함수들 ===

  // 현재 사용자 프로필 가져오기
  async getUserProfile() {
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 모든 병원 목록 가져오기 (마스터 전용)
  async getAllClinics() {
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 모든 사용자 목록 가져오기 (마스터 전용)
  async getAllUsers() {
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 시스템 통계 가져오기 (마스터 전용)
  async getSystemStatistics() {
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 병원 삭제 (마스터 전용)
  async deleteClinic(clinicId: string) {
    try {
      console.log('[deleteClinic] Calling Admin API to delete clinic:', clinicId)

      const response = await fetch('/api/admin/clinics/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId })
      })

      const result = await response.json()

      if (!result.success) {
        console.error('[deleteClinic] Error from Admin API:', result.error)
        throw new Error(result.error)
      }

      console.log('[deleteClinic] Clinic deleted successfully')
      return { success: true }
    } catch (error: unknown) {
      console.error('Error deleting clinic:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // 사용자 삭제 (마스터 전용)
  async deleteUser(userId: string) {
    try {
      console.log('[deleteUser] Calling Admin API to delete user:', userId)

      const response = await fetch('/api/admin/users/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      })

      const result = await response.json()

      if (!result.success) {
        console.error('[deleteUser] Error from Admin API:', result.error)
        throw new Error(result.error)
      }

      console.log('[deleteUser] User deleted successfully')
      return { success: true }
    } catch (error: unknown) {
      console.error('Error deleting user:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // 사용자 권한 업데이트
  async updateUserPermissions(userId: string, permissions: string[]) {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      console.log('[updateUserPermissions] Updating permissions for user:', userId)

      // 현재 로그인한 사용자의 clinic_id 가져오기
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      console.log('[updateUserPermissions] Using clinic_id:', clinicId, 'permissions:', permissions)

      const { data, error } = await (supabase.from('users') as any)
        .update({ permissions })
        .eq('id', userId)
        .eq('clinic_id', clinicId)  // 같은 클리닉의 사용자만 수정 가능
        .select()
        .single()

      if (error) {
        console.error('[updateUserPermissions] Error:', error)
        throw error
      }

      console.log('[updateUserPermissions] Successfully updated permissions')
      return { success: true, data }
    } catch (error: unknown) {
      console.error('[updateUserPermissions] Error updating user permissions:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // 직원 정보 업데이트 (주소, 주민번호, 입사일 등)
  async updateStaffInfo(userId: string, updates: { name?: string; phone?: string; address?: string; resident_registration_number?: string; hire_date?: string }) {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      console.log('[updateStaffInfo] Updating staff info for user:', userId)

      // 현재 로그인한 사용자의 clinic_id 가져오기
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      console.log('[updateStaffInfo] Using clinic_id:', clinicId, 'updates:', updates)

      const { data, error } = await (supabase.from('users') as any)
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .eq('clinic_id', clinicId)  // 같은 클리닉의 사용자만 수정 가능
        .select()
        .single()

      if (error) {
        console.error('[updateStaffInfo] Error:', error)
        throw error
      }

      console.log('[updateStaffInfo] Successfully updated staff info')
      return { success: true, data }
    } catch (error: unknown) {
      console.error('[updateStaffInfo] Error updating staff info:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // 사용자 승인 (직원 관리)
  // Database Trigger가 자동으로 승인 이메일을 발송합니다.
  async approveUser(userId: string, clinicId: string, permissions?: string[]) {
    try {
      const supabase = await ensureConnection()

      console.log('[approveUser] Approving user:', userId)

      // 업데이트 데이터 준비
      const updateData: any = {
        status: 'active',
        approved_at: new Date().toISOString()
      }

      // 권한이 지정된 경우 저장
      if (permissions && permissions.length > 0) {
        updateData.permissions = permissions
      }

      // 사용자 상태를 'active'로 업데이트
      // Database Trigger (users_approval_notification_trigger)가
      // 자동으로 Edge Function을 호출하여 승인 이메일을 발송합니다.
      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId)
        .eq('clinic_id', clinicId)

      if (error) {
        console.error('[approveUser] Database error:', error)
        return { error: error.message }
      }

      console.log('[approveUser] User approved successfully (email will be sent by trigger)')
      return { success: true }
    } catch (error: unknown) {
      console.error('[approveUser] Unexpected error:', error)
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error)
      return { error: errorMessage }
    }
  },

  // 사용자 거절 (직원 관리)
  async rejectUser(userId: string, clinicId: string, reason: string) {
    try {
      console.log('[rejectUser] Calling Admin API to reject user:', userId)

      const response = await fetch('/api/admin/users/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, clinicId, reason })
      })

      const result = await response.json()

      if (!result.success) {
        console.error('[rejectUser] Error from Admin API:', result.error)
        throw new Error(result.error)
      }

      console.log('[rejectUser] User rejected successfully')
      return { success: true }
    } catch (error: unknown) {
      console.error('Error rejecting user:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // 병원 계정 상태 변경 (마스터 전용)
  async updateClinicStatus(clinicId: string, status: 'active' | 'suspended') {
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 병원별 사용자 목록 조회 (마스터 전용)
  async getUsersByClinic(clinicId: string) {
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 이메일 인증 상태를 포함한 모든 사용자 조회 (마스터 전용)
  async getAllUsersWithEmailStatus() {
    const supabase = await ensureConnection()
    if (!supabase) {
      return { data: null, error: 'Supabase client not available' }
    }

    try {
      // 1. public.users 데이터 조회
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select(`
          *,
          clinic:clinics(name)
        `)
        .order('created_at', { ascending: false })

      if (usersError) {
        console.error('Error fetching users:', usersError)
        return { data: null, error: usersError.message }
      }

      // 2. auth.users 데이터 조회 (Admin API)
      const { data: { users: authUsers }, error: authError } =
        await supabase.auth.admin.listUsers()

      if (authError) {
        console.error('Error fetching auth users:', authError)
        return { data: null, error: authError.message }
      }

      // 3. 데이터 병합
      const mergedData = users.map((user: any) => {
        const authUser = authUsers.find((au: any) => au.id === user.id)
        return {
          ...user,
          email_confirmed_at: authUser?.email_confirmed_at,
          email_verified: !!authUser?.email_confirmed_at
        }
      })

      return { data: mergedData, error: null }
    } catch (error: unknown) {
      console.error('Error in getAllUsersWithEmailStatus:', error)
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  },

  // ========================================
  // 프로토콜 관리 함수들
  // ========================================

  // 프로토콜 카테고리 목록 조회
  async getProtocolCategories(clinicId?: string) {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      // clinic_id가 전달되지 않으면 getCurrentClinicId()로 가져오기
      const targetClinicId = clinicId || await getCurrentClinicId()
      if (!targetClinicId) {
        console.error('[getProtocolCategories] No clinic ID available - session may have expired')
        throw new Error('인증 세션이 만료되었거나 사용자 정보를 가져올 수 없습니다. 페이지를 새로고침하거나 다시 로그인해주세요.')
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 프로토콜 카테고리 생성
  async createProtocolCategory(categoryData: { name: string; description?: string; color?: string; display_order?: number }) {
    const supabase = await ensureConnection()
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
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 프로토콜 카테고리 삭제
  async deleteProtocolCategory(categoryId: string) {
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 프로토콜 목록 조회
  async getProtocols(clinicId?: string, filters?: { status?: string; category_id?: string; search?: string }) {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      console.log('[getProtocols] Starting fetch with clinicId:', clinicId, 'filters:', filters)

      // clinic_id가 전달되지 않으면 getCurrentClinicId()로 가져오기
      const targetClinicId = clinicId || await getCurrentClinicId()
      if (!targetClinicId) {
        console.error('[getProtocols] No clinic ID available - session may have expired')
        // 세션 만료 가능성이 높으므로 명확한 에러 메시지 반환
        throw new Error('인증 세션이 만료되었거나 사용자 정보를 가져올 수 없습니다. 페이지를 새로고침하거나 다시 로그인해주세요.')
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

      console.log('[getProtocols] Query successful, returning data.')
      return { data: protocols || [] }
    } catch (error: unknown) {
      console.error('[getProtocols] Error fetching protocols:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // 프로토콜 상세 조회 (ID로)
  async getProtocolById(protocolId: string) {
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
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

    const supabase = await ensureConnection()
    if (!supabase) {
      console.error('[createProtocol] Supabase client not available')
      throw new Error('Supabase client not available')
    }

    try {
      console.log('[createProtocol] Getting clinic ID...')
      const clinicId = formData.clinic_id || await getCurrentClinicId()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 프로토콜 수정 (새 버전 생성)
  async updateProtocol(protocolId: string, formData: ProtocolFormData) {
    const supabase = await ensureConnection()
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
      if (formData.category_id !== undefined) {
        // 빈 문자열은 null로 변환 (UUID 타입에 빈 문자열 전달 시 오류 방지)
        updateData.category_id = formData.category_id || null
      }
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 프로토콜 삭제 (소프트 삭제)
  async deleteProtocol(protocolId: string) {
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 프로토콜 버전 히스토리 조회
  async getProtocolVersions(protocolId: string) {
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 프로토콜 버전 복원
  async restoreProtocolVersion(protocolId: string, versionId: string) {
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // ========================================
  // 비밀번호 관리 함수들
  // ========================================

  // 비밀번호 확인 (재인증)
  async verifyPassword(email: string, password: string) {
    const supabase = await ensureConnection()
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
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 비밀번호 업데이트
  async updatePassword(newPassword: string) {
    const supabase = await ensureConnection()
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
      return { error: extractErrorMessage(error) }
    }
  },

  // 현재 세션 정보 가져오기 (with auto-refresh)
  async getSession() {
    try {
      // 먼저 clinic_id 가져오기 (localStorage 또는 Supabase에서)
      const clinicId = await getCurrentClinicId()

      // Supabase 세션 확인 시도
      const supabase = await ensureConnection()
      if (supabase) {
        try {
          console.log('[DataService] Checking session...')
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

          // Case 1: Session error - try to refresh
          if (sessionError) {
            console.error('[DataService] Session check error:', sessionError.message)

            if (sessionError.message?.includes('Refresh Token') || sessionError.message?.includes('Invalid')) {
              console.log('[DataService] Attempting to refresh session...')
              const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()

              if (refreshError || !refreshData.session) {
                console.error('[DataService] Session refresh failed:', refreshError?.message)
                return { data: null, error: 'SESSION_EXPIRED' }
              }

              console.log('[DataService] Session refreshed successfully')
              // Get user with refreshed session
              const { data: { user }, error: userError } = await supabase.auth.getUser()
              if (user && !userError) {
                return { data: { user, clinicId } }
              }
            }
          }

          // Case 2: No session - try to refresh
          if (!sessionData.session) {
            console.log('[DataService] No session found, attempting to refresh...')
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()

            if (refreshError || !refreshData.session) {
              console.error('[DataService] Session refresh failed:', refreshError?.message)
              // Fall through to localStorage check
            } else {
              console.log('[DataService] Session refreshed successfully')
              const { data: { user }, error: userError } = await supabase.auth.getUser()
              if (user && !userError) {
                return { data: { user, clinicId } }
              }
            }
          }

          // Case 3: Valid session - get user
          if (sessionData.session) {
            const { data: { user }, error: authError } = await supabase.auth.getUser()

            if (user && !authError) {
              return { data: { user, clinicId } }
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
      return { data: null, error: extractErrorMessage(error) }
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
  },

  // ========================================
  // 지점 관리 함수들
  // Branch Management Functions
  // ========================================

  // 지점 목록 조회
  async getBranches(filter?: { is_active?: boolean }): Promise<{ data?: ClinicBranch[], total_count?: number, error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      let query = supabase
        .from('clinic_branches')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('display_order', { ascending: true })
        .order('branch_name', { ascending: true })

      // 활성/비활성 필터 적용
      if (filter?.is_active !== undefined) {
        query = query.eq('is_active', filter.is_active)
      }

      const { data, error } = await query

      if (error) throw error
      return { data: data as ClinicBranch[], total_count: data?.length || 0 }
    } catch (error: unknown) {
      console.error('[DataService] Error fetching branches:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // 단일 지점 조회
  async getBranchById(branchId: string) {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const { data, error } = await supabase
        .from('clinic_branches')
        .select('*')
        .eq('id', branchId)
        .eq('clinic_id', clinicId)
        .single()

      if (error) throw error
      return { data }
    } catch (error: unknown) {
      console.error('[DataService] Error fetching branch:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // 지점 생성
  async createBranch(branchData: {
    branch_name: string
    branch_code?: string
    address?: string
    latitude?: number
    longitude?: number
    attendance_radius_meters?: number
    phone?: string
    is_active?: boolean
    display_order?: number
  }) {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User not authenticated')

      const { data, error } = await supabase
        .from('clinic_branches')
        .insert([{
          ...branchData,
          clinic_id: clinicId,
          created_by: user.id
        }])
        .select()
        .single()

      if (error) throw error

      console.log('[DataService] Branch created successfully:', data.id)
      return { success: true, data }
    } catch (error: unknown) {
      console.error('[DataService] Error creating branch:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // 지점 수정
  async updateBranch(branchId: string, updates: {
    branch_name?: string
    branch_code?: string
    address?: string
    latitude?: number
    longitude?: number
    attendance_radius_meters?: number
    phone?: string
    is_active?: boolean
    display_order?: number
  }) {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const { data, error } = await supabase
        .from('clinic_branches')
        .update(updates)
        .eq('id', branchId)
        .eq('clinic_id', clinicId)
        .select()
        .single()

      if (error) throw error

      console.log('[DataService] Branch updated successfully:', branchId)
      return { success: true, data }
    } catch (error: unknown) {
      console.error('[DataService] Error updating branch:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // 지점 삭제 (soft delete - is_active를 false로 설정)
  async deleteBranch(branchId: string) {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const { error } = await supabase
        .from('clinic_branches')
        .update({ is_active: false })
        .eq('id', branchId)
        .eq('clinic_id', clinicId)

      if (error) throw error

      console.log('[DataService] Branch deactivated successfully:', branchId)
      return { success: true }
    } catch (error: unknown) {
      console.error('[DataService] Error deleting branch:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // 지점 완전 삭제 (hard delete - owner만 사용)
  async hardDeleteBranch(branchId: string) {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const { error } = await supabase
        .from('clinic_branches')
        .delete()
        .eq('id', branchId)
        .eq('clinic_id', clinicId)

      if (error) throw error

      console.log('[DataService] Branch permanently deleted:', branchId)
      return { success: true }
    } catch (error: unknown) {
      console.error('[DataService] Error hard deleting branch:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // ========================================
  // 기타 특이사항 히스토리 함수들
  // Special Notes History Functions
  // ========================================

  // 특이사항 히스토리 저장
  async saveSpecialNotesHistory(params: {
    date: string
    content: string
    authorId: string
    authorName: string
    isPastDateEdit?: boolean
  }): Promise<{ success?: boolean; data?: SpecialNotesHistory; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const { date, content, authorId, authorName, isPastDateEdit } = params

      // 내용이 비어있으면 저장하지 않음
      if (!content || !content.trim()) {
        console.log('[DataService] Empty special notes, skipping history save')
        return { success: true }
      }

      const { data, error } = await (supabase
        .from('special_notes_history') as any)
        .insert([{
          clinic_id: clinicId,
          report_date: date,
          content: content.trim(),
          author_id: authorId,
          author_name: authorName,
          is_past_date_edit: isPastDateEdit || false,
          edited_at: new Date().toISOString()
        }])
        .select()
        .single()

      if (error) throw error

      console.log('[DataService] Special notes history saved:', data.id)
      return { success: true, data: data as SpecialNotesHistory }
    } catch (error: unknown) {
      console.error('[DataService] Error saving special notes history:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // 특이사항 히스토리 조회 (날짜 범위)
  async getSpecialNotesHistory(params?: {
    startDate?: string
    endDate?: string
    limit?: number
    offset?: number
  }): Promise<{ success?: boolean; data?: SpecialNotesHistory[]; total?: number; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      let query = supabase
        .from('special_notes_history')
        .select('*', { count: 'exact' })
        .eq('clinic_id', clinicId)
        .order('report_date', { ascending: false })
        .order('edited_at', { ascending: false })

      // 날짜 범위 필터
      if (params?.startDate) {
        query = query.gte('report_date', params.startDate)
      }
      if (params?.endDate) {
        query = query.lte('report_date', params.endDate)
      }

      // 페이지네이션
      if (params?.limit) {
        query = query.limit(params.limit)
      }
      if (params?.offset) {
        query = query.range(params.offset, (params.offset + (params.limit || 50)) - 1)
      }

      const { data, error, count } = await query

      if (error) throw error

      return {
        success: true,
        data: data as SpecialNotesHistory[],
        total: count || 0
      }
    } catch (error: unknown) {
      console.error('[DataService] Error fetching special notes history:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // 특이사항 검색
  async searchSpecialNotes(params: {
    query: string
    startDate?: string
    endDate?: string
    limit?: number
  }): Promise<{ success?: boolean; data?: SpecialNotesHistory[]; total?: number; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const searchQuery = params.query.trim()
      if (!searchQuery) {
        return { success: true, data: [], total: 0 }
      }

      let query = supabase
        .from('special_notes_history')
        .select('*', { count: 'exact' })
        .eq('clinic_id', clinicId)
        .ilike('content', `%${searchQuery}%`)
        .order('report_date', { ascending: false })
        .order('edited_at', { ascending: false })

      // 날짜 범위 필터
      if (params.startDate) {
        query = query.gte('report_date', params.startDate)
      }
      if (params.endDate) {
        query = query.lte('report_date', params.endDate)
      }

      // 결과 제한
      if (params.limit) {
        query = query.limit(params.limit)
      }

      const { data, error, count } = await query

      if (error) throw error

      console.log(`[DataService] Special notes search found ${count} results for query: "${searchQuery}"`)
      return {
        success: true,
        data: data as SpecialNotesHistory[],
        total: count || 0
      }
    } catch (error: unknown) {
      console.error('[DataService] Error searching special notes:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // 특정 날짜의 특이사항 히스토리 조회 (수정 이력 확인용)
  async getSpecialNotesHistoryByDate(date: string): Promise<{ success?: boolean; data?: SpecialNotesHistory[]; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      const { data, error } = await supabase
        .from('special_notes_history')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('report_date', date)
        .order('edited_at', { ascending: false })

      if (error) throw error

      return { success: true, data: data as SpecialNotesHistory[] }
    } catch (error: unknown) {
      console.error('[DataService] Error fetching special notes history by date:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // 날짜별 최신 특이사항 조회 (그룹화된 결과)
  async getLatestSpecialNotesByDate(params?: {
    startDate?: string
    endDate?: string
    limit?: number
  }): Promise<{ success?: boolean; data?: Array<{ date: string; latestNote: SpecialNotesHistory; editCount: number }>; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      // 먼저 모든 히스토리를 가져옴
      let query = supabase
        .from('special_notes_history')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('report_date', { ascending: false })
        .order('edited_at', { ascending: false })

      if (params?.startDate) {
        query = query.gte('report_date', params.startDate)
      }
      if (params?.endDate) {
        query = query.lte('report_date', params.endDate)
      }

      const { data, error } = await query

      if (error) throw error

      // 클라이언트에서 날짜별로 그룹화
      const groupedByDate = new Map<string, SpecialNotesHistory[]>()

      for (const note of (data as SpecialNotesHistory[])) {
        const existing = groupedByDate.get(note.report_date) || []
        existing.push(note)
        groupedByDate.set(note.report_date, existing)
      }

      // 각 날짜의 최신 노트와 수정 횟수 계산
      const result = Array.from(groupedByDate.entries()).map(([date, notes]) => ({
        date,
        latestNote: notes[0], // 이미 edited_at 내림차순으로 정렬됨
        editCount: notes.length
      }))

      // limit 적용
      const limitedResult = params?.limit ? result.slice(0, params.limit) : result

      return { success: true, data: limitedResult }
    } catch (error: unknown) {
      console.error('[DataService] Error fetching latest special notes by date:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // daily_reports에서 특이사항 목록 조회 (fallback용)
  async getSpecialNotesFromDailyReports(params?: {
    startDate?: string
    endDate?: string
    limit?: number
  }): Promise<{ success?: boolean; data?: Array<{ date: string; content: string; clinic_id: string }>; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      let query = supabase
        .from('daily_reports')
        .select('date, special_notes, clinic_id')
        .eq('clinic_id', clinicId)
        .not('special_notes', 'is', null)
        .neq('special_notes', '')
        .order('date', { ascending: false })

      if (params?.startDate) {
        query = query.gte('date', params.startDate)
      }
      if (params?.endDate) {
        query = query.lte('date', params.endDate)
      }
      if (params?.limit) {
        query = query.limit(params.limit)
      }

      const { data, error } = await query

      if (error) throw error

      type DailyReportWithNotes = { date: string; special_notes: string | null; clinic_id: string }
      const result = (data as DailyReportWithNotes[] || [])
        .filter(item => item.special_notes && item.special_notes.trim())
        .map(item => ({
          date: item.date,
          content: item.special_notes!.trim(),
          clinic_id: item.clinic_id
        }))

      console.log(`[DataService] Fetched ${result.length} special notes from daily_reports`)
      return { success: true, data: result }
    } catch (error: unknown) {
      console.error('[DataService] Error fetching special notes from daily_reports:', error)
      return { error: extractErrorMessage(error) }
    }
  },

  // ========================================
  // 상담 상태 변경 (진행보류 → 진행)
  // ========================================

  /**
   * 진행보류 상담을 진행 완료로 변경
   *
   * 동작:
   * 1. 원래 consult_logs의 상태를 'X' → 'O'로 변경
   * 2. 원래 날짜의 daily_reports 통계 업데이트 (consult_hold -1, consult_proceed +1)
   * 3. 오늘 날짜의 consult_logs에 새 기록 추가 (상태 변경 이력)
   * 4. 오늘 날짜의 daily_reports 통계 업데이트 또는 생성
   *
   * @param consultId - 변경할 상담 로그의 ID
   * @returns 성공 여부 및 업데이트된 데이터
   */
  async updateConsultStatusToCompleted(consultId: number) {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Supabase client not available')

    try {
      const clinicId = await getCurrentClinicId()
      if (!clinicId) {
        throw new Error('User clinic information not available')
      }

      console.log('[updateConsultStatusToCompleted] Starting update for consultId:', consultId)

      // 1. 원래 상담 기록 조회
      const { data: originalConsult, error: fetchError } = await supabase
        .from('consult_logs')
        .select('*')
        .eq('id', consultId)
        .eq('clinic_id', clinicId)
        .single()

      if (fetchError || !originalConsult) {
        console.error('[updateConsultStatusToCompleted] Consult not found:', fetchError)
        throw new Error('상담 기록을 찾을 수 없습니다.')
      }

      // 이미 진행 완료인 경우
      if (originalConsult.consult_status === 'O') {
        return { success: true, message: '이미 진행 완료된 상담입니다.' }
      }

      const originalDate = originalConsult.date
      const today = new Date().toISOString().split('T')[0]

      console.log('[updateConsultStatusToCompleted] Original date:', originalDate, 'Today:', today)

      // 2. 원래 상담 기록의 상태를 'O'로 변경
      const { error: updateError } = await supabase
        .from('consult_logs')
        .update({ consult_status: 'O' })
        .eq('id', consultId)

      if (updateError) {
        console.error('[updateConsultStatusToCompleted] Failed to update consult status:', updateError)
        throw new Error('상담 상태 변경에 실패했습니다.')
      }

      console.log('[updateConsultStatusToCompleted] Consult status updated to O')

      // 3. 원래 날짜의 daily_reports 통계 업데이트
      const { data: originalReport } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('date', originalDate)
        .eq('clinic_id', clinicId)
        .single()

      if (originalReport) {
        const newConsultProceed = (originalReport.consult_proceed || 0) + 1
        const newConsultHold = Math.max((originalReport.consult_hold || 0) - 1, 0)

        const { error: reportUpdateError } = await supabase
          .from('daily_reports')
          .update({
            consult_proceed: newConsultProceed,
            consult_hold: newConsultHold
          })
          .eq('id', originalReport.id)

        if (reportUpdateError) {
          console.error('[updateConsultStatusToCompleted] Failed to update original report:', reportUpdateError)
        } else {
          console.log('[updateConsultStatusToCompleted] Original date report updated:', {
            consult_proceed: newConsultProceed,
            consult_hold: newConsultHold
          })
        }
      }

      // 4. 오늘 날짜의 daily_reports 확인/생성 및 상태 변경 기록 추가
      const { data: todayReport } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('date', today)
        .eq('clinic_id', clinicId)
        .single()

      if (todayReport) {
        // 기존 오늘 보고서가 있으면 consult_proceed +1 (원래 날짜와 다른 경우에만)
        if (originalDate !== today) {
          const { error: todayUpdateError } = await supabase
            .from('daily_reports')
            .update({
              consult_proceed: (todayReport.consult_proceed || 0) + 1
            })
            .eq('id', todayReport.id)

          if (todayUpdateError) {
            console.error('[updateConsultStatusToCompleted] Failed to update today report:', todayUpdateError)
          } else {
            console.log('[updateConsultStatusToCompleted] Today report updated')
          }
        }
      } else {
        // 오늘 보고서가 없으면 새로 생성
        const { error: insertReportError } = await supabase
          .from('daily_reports')
          .insert([{
            clinic_id: clinicId,
            date: today,
            recall_count: 0,
            recall_booking_count: 0,
            consult_proceed: originalDate !== today ? 1 : 0,
            consult_hold: 0,
            naver_review_count: 0
          }])

        if (insertReportError) {
          console.error('[updateConsultStatusToCompleted] Failed to create today report:', insertReportError)
        } else {
          console.log('[updateConsultStatusToCompleted] New today report created')
        }
      }

      // 5. 오늘 날짜에 상담 기록 추가 (일일 보고서 환자 상담 결과에 직접 표시)
      const { error: insertLogError } = await supabase
        .from('consult_logs')
        .insert([{
          clinic_id: clinicId,
          date: today,
          patient_name: originalConsult.patient_name,
          consult_content: originalConsult.consult_content,
          consult_status: 'O' as const,
          remarks: originalConsult.remarks || ''
        }])

      if (insertLogError) {
        console.error('[updateConsultStatusToCompleted] Failed to insert today consult log:', insertLogError)
      } else {
        console.log('[updateConsultStatusToCompleted] Today consult log entry created')
      }

      return {
        success: true,
        originalDate,
        patientName: originalConsult.patient_name,
        consultContent: originalConsult.consult_content
      }
    } catch (error: unknown) {
      console.error('[updateConsultStatusToCompleted] Error:', error)
      return { error: extractErrorMessage(error) }
    }
  }
}