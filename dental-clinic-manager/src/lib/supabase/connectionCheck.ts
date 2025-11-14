import { createClient } from './client'

/**
 * DB 연결 확인 및 자동 재연결 유틸리티
 *
 * 모든 데이터베이스 작업 전에 호출하여 세션 상태를 확인하고,
 * 필요시 자동으로 세션을 갱신합니다.
 *
 * @throws {Error} 세션 갱신 실패 시 (로그인 페이지로 리다이렉트)
 * @returns Supabase 클라이언트 (세션 확인 완료)
 *
 * @example
 * ```typescript
 * // 데이터 조회 전
 * const supabase = await ensureConnection()
 * const { data, error } = await supabase.from('protocols').select()
 * ```
 *
 * Created: 2025-11-14
 */
export async function ensureConnection() {
  console.log('[ensureConnection] Checking database connection...')

  const supabase = createClient()
  if (!supabase) {
    console.error('[ensureConnection] Supabase client not available')
    throw new Error('데이터베이스 클라이언트를 초기화할 수 없습니다.')
  }

  try {
    // 1. 세션 확인 (타임아웃 3초 - 공격적 최적화)
    const sessionPromise = supabase.auth.getSession()
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Session check timeout')), 3000)
    )

    const { data: { session }, error: sessionError } = await Promise.race([
      sessionPromise,
      timeoutPromise
    ]) as any

    if (sessionError) {
      console.error('[ensureConnection] Session check error:', sessionError)
      throw sessionError
    }

    // 2. 세션이 유효한 경우 - 바로 반환
    if (session) {
      console.log('[ensureConnection] Session valid')
      return supabase
    }

    // 3. 세션이 없는 경우 - 갱신 시도 (재시도 로직 포함)
    console.log('[ensureConnection] No session found, attempting refresh...')

    let refreshError: any = null
    let refreshData: any = null

    // 최대 2회 재시도 (공격적 최적화)
    for (let attempt = 1; attempt <= 2; attempt++) {
      console.log(`[ensureConnection] Refresh attempt ${attempt}/2`)

      try {
        const refreshPromise = supabase.auth.refreshSession()
        const refreshTimeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Session refresh timeout')), 5000) // 5초로 감소
        )

        const result = await Promise.race([
          refreshPromise,
          refreshTimeoutPromise
        ]) as any

        refreshData = result.data
        refreshError = result.error

        // 성공한 경우
        if (!refreshError && refreshData?.session) {
          console.log('[ensureConnection] Session refreshed successfully')
          return supabase
        }

        // 실패한 경우
        console.warn(`[ensureConnection] Refresh attempt ${attempt} failed:`, refreshError)

        // 마지막 시도가 아니면 백오프 후 재시도
        if (attempt < 2) {
          const backoffMs = attempt * 1000 // 1초
          console.log(`[ensureConnection] Waiting ${backoffMs}ms before retry...`)
          await new Promise(resolve => setTimeout(resolve, backoffMs))
        }

      } catch (error: any) {
        console.error(`[ensureConnection] Refresh attempt ${attempt} exception:`, error)
        refreshError = error

        // 마지막 시도가 아니면 백오프 후 재시도
        if (attempt < 2) {
          const backoffMs = attempt * 1000
          await new Promise(resolve => setTimeout(resolve, backoffMs))
        }
      }
    }

    // 4. 모든 재시도 실패 - 로그아웃 및 리다이렉트
    console.error('[ensureConnection] All refresh attempts failed')
    await supabase.auth.signOut()

    if (typeof window !== 'undefined') {
      console.log('[ensureConnection] Redirecting to login page...')

      // 현재 페이지를 returnUrl로 저장
      const currentPath = window.location.pathname + window.location.search
      window.location.href = `/login?returnUrl=${encodeURIComponent(currentPath)}`
    }

    throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.')

  } catch (error: any) {
    console.error('[ensureConnection] Error:', error)

    // 타임아웃 또는 네트워크 에러인 경우
    if (error.message?.includes('timeout') || error.message?.includes('network')) {
      throw new Error('데이터베이스 연결에 실패했습니다. 네트워크를 확인해주세요.')
    }

    throw error
  }
}

/**
 * 세션 유효성만 빠르게 확인 (갱신하지 않음)
 *
 * @returns 세션이 유효하면 true, 아니면 false
 */
export async function isSessionValid(): Promise<boolean> {
  try {
    const supabase = createClient()
    if (!supabase) return false

    const { data: { session } } = await supabase.auth.getSession()
    return !!session
  } catch (error) {
    console.error('[isSessionValid] Error:', error)
    return false
  }
}
