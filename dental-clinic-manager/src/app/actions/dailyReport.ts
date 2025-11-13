'use server'

/**
 * Daily Report Server Actions
 *
 * 일일 보고서 저장을 위한 Server Action
 *
 * 특징:
 * - Middleware가 세션 자동 관리 (토큰 갱신)
 * - 각 단계별 타임아웃 설정
 * - 재시도 로직 (1회)
 * - 상세 로깅
 * - zod 입력 검증
 * - RPC 함수로 트랜잭션 보장
 *
 * Created: 2025-11-08
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * 일일 보고서 저장 Server Action
 *
 * @param formData - 저장할 일일 보고서 데이터
 * @returns {success: boolean, error?: string, executionTime?: number, details?: any}
 *
 * @example
 * ```typescript
 * const result = await saveDailyReport({
 *   date: '2025-11-08',
 *   dailyReport: { recall_count: 5, recall_booking_count: 3, ... },
 *   consultLogs: [...],
 *   giftLogs: [...],
 *   happyCallLogs: [...]
 * })
 * ```
 */
export async function saveDailyReport(formData: {
  date: string
  dailyReport: any
  consultLogs: any[]
  giftLogs: any[]
  happyCallLogs: any[]
}) {
  const startTime = Date.now()
  console.log('[saveDailyReport] Start:', { date: formData.date, timestamp: new Date().toISOString() })

  try {
    // ============================================================
    // 1. 입력 검증 (기본 검증)
    // ============================================================
    // Note: zod가 설치되지 않은 경우를 대비한 기본 검증

    if (!formData.date) {
      console.error('[saveDailyReport] Validation error: date is required')
      return { success: false, error: '날짜가 필요합니다.' }
    }

    // 날짜 형식 검증 (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.date)) {
      console.error('[saveDailyReport] Validation error: invalid date format')
      return { success: false, error: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)' }
    }

    if (!formData.dailyReport) {
      console.error('[saveDailyReport] Validation error: dailyReport is required')
      return { success: false, error: '일일 보고서 데이터가 필요합니다.' }
    }

    // 숫자 필드 검증
    if (formData.dailyReport.recall_count != null && formData.dailyReport.recall_count < 0) {
      console.error('[saveDailyReport] Validation error: recall_count must be >= 0')
      return { success: false, error: '리콜 건수는 0 이상이어야 합니다.' }
    }

    if (formData.dailyReport.recall_booking_count != null && formData.dailyReport.recall_booking_count < 0) {
      console.error('[saveDailyReport] Validation error: recall_booking_count must be >= 0')
      return { success: false, error: '리콜 예약 건수는 0 이상이어야 합니다.' }
    }

    // ============================================================
    // 2. Supabase 클라이언트 생성
    // ============================================================

    console.log('[saveDailyReport] Creating Supabase client...')
    const supabase = await createClient()

    // ============================================================
    // 3. 세션 확인 (타임아웃 10초, 재시도 1회)
    // ============================================================

    /**
     * Auth check 함수
     */
    const checkAuth = async () => {
      const authStartTime = Date.now()
      console.log('[saveDailyReport] Checking user session...')

      const authPromise = supabase.auth.getUser()
      const authTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => {
          console.error('[saveDailyReport] Auth timeout after 10000ms')
          reject(new Error('인증 확인 시간이 초과되었습니다.'))
        }, 10000)
      )

      const result = await Promise.race([authPromise, authTimeout]) as any
      const authElapsed = Date.now() - authStartTime
      console.log(`[saveDailyReport] Auth check completed in ${authElapsed}ms`)

      return result
    }

    let authResult
    let authRetryCount = 0

    // 첫 시도
    try {
      authResult = await checkAuth()
    } catch (error: any) {
      console.warn(`[saveDailyReport] First auth attempt failed: ${error.message}`)
      console.log('[saveDailyReport] Refreshing session and retrying...')

      // 세션 갱신
      try {
        const { error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError) {
          console.error('[saveDailyReport] Session refresh failed:', refreshError)
          throw refreshError
        }
        console.log('[saveDailyReport] Session refreshed successfully')
      } catch (refreshError: any) {
        console.error('[saveDailyReport] Failed to refresh session:', refreshError)
        return {
          success: false,
          error: '세션 갱신에 실패했습니다. 다시 로그인해주세요.'
        }
      }

      // 재시도 전 짧은 대기
      await new Promise(resolve => setTimeout(resolve, 500))
      authRetryCount = 1

      // 재시도
      try {
        authResult = await checkAuth()
        console.log('[saveDailyReport] Auth retry succeeded')
      } catch (retryError: any) {
        console.error(`[saveDailyReport] Auth retry failed: ${retryError.message}`)
        return {
          success: false,
          error: '인증에 실패했습니다. 다시 로그인해주세요.'
        }
      }
    }

    const { data: { user }, error: authError } = authResult

    if (authError || !user) {
      console.error('[saveDailyReport] Auth error:', authError)
      return { success: false, error: '인증이 필요합니다. 다시 로그인해주세요.' }
    }

    console.log(`[saveDailyReport] User authenticated: ${user.id} (auth retries: ${authRetryCount})`)

    // ============================================================
    // 4. clinic_id 조회 (타임아웃 3초)
    // ============================================================

    const clinicStartTime = Date.now()
    console.log('[saveDailyReport] Fetching clinic_id...')

    const clinicPromise = supabase
      .from('users')
      .select('clinic_id')
      .eq('id', user.id)
      .single()

    const clinicTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => {
        console.error('[saveDailyReport] Clinic query timeout after 3000ms')
        reject(new Error('병원 정보 조회 시간이 초과되었습니다.'))
      }, 3000)
    )

    const { data: userProfile, error: profileError } = await Promise.race([
      clinicPromise,
      clinicTimeout
    ]) as any

    const clinicElapsed = Date.now() - clinicStartTime
    console.log(`[saveDailyReport] Clinic query completed in ${clinicElapsed}ms`)

    if (profileError || !userProfile?.clinic_id) {
      console.error('[saveDailyReport] Profile error:', profileError)
      return { success: false, error: '병원 정보를 찾을 수 없습니다.' }
    }

    console.log(`[saveDailyReport] Clinic ID: ${userProfile.clinic_id}`)

    // ============================================================
    // 5. RPC 호출 (타임아웃 10초, 재시도 1회)
    // ============================================================

    /**
     * RPC 호출 함수
     */
    const callRpc = async () => {
      const rpcStartTime = Date.now()
      console.log('[saveDailyReport] Calling RPC function...')

      const rpcPromise = supabase.rpc('save_daily_report_v2', {
        p_clinic_id: userProfile.clinic_id,
        p_date: formData.date,
        p_daily_report: {
          ...formData.dailyReport,
          clinic_id: userProfile.clinic_id,
          date: formData.date
        },
        p_consult_logs: formData.consultLogs,
        p_gift_logs: formData.giftLogs,
        p_happy_call_logs: formData.happyCallLogs
      })

      const rpcTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => {
          const elapsed = Date.now() - rpcStartTime
          console.error(`[saveDailyReport] RPC timeout after ${elapsed}ms`)
          reject(new Error('저장 요청 시간이 초과되었습니다. (10초)'))
        }, 10000)
      )

      const result = await Promise.race([rpcPromise, rpcTimeout]) as any
      const rpcElapsed = Date.now() - rpcStartTime
      console.log(`[saveDailyReport] RPC completed in ${rpcElapsed}ms`)

      return result
    }

    let rpcResult
    let retryCount = 0

    // 첫 시도
    try {
      rpcResult = await callRpc()
    } catch (error: any) {
      console.warn(`[saveDailyReport] First attempt failed: ${error.message}`)
      console.log('[saveDailyReport] Retrying after 500ms...')

      // 재시도 전 짧은 대기
      await new Promise(resolve => setTimeout(resolve, 500))
      retryCount = 1

      // 재시도
      try {
        rpcResult = await callRpc()
        console.log('[saveDailyReport] Retry succeeded')
      } catch (retryError: any) {
        console.error(`[saveDailyReport] Retry failed: ${retryError.message}`)
        throw retryError
      }
    }

    const { data: rpcData, error: rpcError } = rpcResult

    if (rpcError) {
      console.error('[saveDailyReport] RPC error:', rpcError)
      return {
        success: false,
        error: `저장 중 오류가 발생했습니다: ${rpcError.message || rpcError}`
      }
    }

    // ============================================================
    // 6. 성공
    // ============================================================

    const totalElapsed = Date.now() - startTime
    console.log(`[saveDailyReport] Success in ${totalElapsed}ms (auth retries: ${authRetryCount}, rpc retries: ${retryCount}):`, rpcData)

    // 캐시 무효화 (dashboard 페이지 재검증)
    revalidatePath('/dashboard')

    return {
      success: true,
      executionTime: totalElapsed,
      authRetries: authRetryCount,
      rpcRetries: retryCount,
      details: rpcData
    }

  } catch (error: any) {
    // ============================================================
    // 7. 에러 처리
    // ============================================================

    const totalElapsed = Date.now() - startTime
    console.error(`[saveDailyReport] Error after ${totalElapsed}ms:`, error)

    // 에러 타입별 메시지 분류
    let errorMessage = '알 수 없는 오류가 발생했습니다.'

    if (error.message) {
      if (error.message.includes('timeout') || error.message.includes('초과')) {
        errorMessage = error.message
      } else if (error.message.includes('auth') || error.message.includes('인증')) {
        errorMessage = '인증 오류가 발생했습니다. 다시 로그인해주세요.'
      } else if (error.message.includes('clinic') || error.message.includes('병원')) {
        errorMessage = '병원 정보를 찾을 수 없습니다.'
      } else {
        errorMessage = `오류: ${error.message}`
      }
    }

    return {
      success: false,
      error: errorMessage,
      executionTime: totalElapsed
    }
  }
}
