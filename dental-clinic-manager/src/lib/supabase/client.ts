import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 싱글톤 Supabase 클라이언트 인스턴스
 * - 앱 전체에서 하나의 인스턴스만 사용
 * - 자동 토큰 갱신 보장
 * - 세션 상태 변경 모니터링
 */
let supabaseInstance: SupabaseClient<Database> | null = null

/**
 * 브라우저 환경 전용 Supabase 클라이언트 (싱글톤)
 *
 * @supabase/ssr 사용:
 * - Cookie 기반 세션 관리
 * - 자동 토큰 갱신 (autoRefreshToken: true)
 * - persistSession으로 세션 유지
 * - Client Component, useEffect, 이벤트 핸들러에서 사용
 *
 * 주의: 브라우저 환경에서만 사용해야 합니다.
 *
 * @returns Supabase 클라이언트 (싱글톤)
 */
export function createClient() {
  // 서버 사이드에서 호출되면 null 반환 (에러 방지)
  if (typeof window === 'undefined') {
    console.warn('[Supabase Browser Client] Server-side에서 호출되었습니다. 브라우저 환경에서만 사용하세요.')
    return null as any
  }

  // 이미 인스턴스가 있으면 재사용
  if (supabaseInstance) {
    return supabaseInstance
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // 환경 변수 검증
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Supabase Browser Client] 환경 변수가 설정되지 않았습니다.')
    console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'SET' : 'NOT SET')
    console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'SET' : 'NOT SET')
    throw new Error('Supabase 환경 변수가 설정되지 않았습니다.')
  }

  // 싱글톤 인스턴스 생성
  supabaseInstance = createBrowserClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        autoRefreshToken: true,  // 자동 토큰 갱신 활성화
        persistSession: true,    // 세션 유지
        detectSessionInUrl: true // URL에서 세션 감지
      },
      global: {
        headers: {
          'x-application-name': 'dental-clinic-manager'
        }
      }
    }
  )

  // 세션 상태 변경 리스너 등록
  supabaseInstance.auth.onAuthStateChange((event, session) => {
    console.log('[Supabase] Auth event:', event)

    if (event === 'TOKEN_REFRESHED') {
      console.log('[Supabase] Token refreshed successfully at:', new Date().toISOString())
    }

    if (event === 'SIGNED_OUT') {
      console.log('[Supabase] User signed out detected')
      // supabaseInstance = null - 제거: @supabase/ssr의 내부 세션 관리 활용
      // 토큰 갱신 과정에서 SIGNED_OUT 이벤트가 발생할 수 있으므로 인스턴스 유지
    }

    if (event === 'SIGNED_IN') {
      console.log('[Supabase] User signed in')
    }
  })

  console.log('[Supabase] Singleton instance created with auto-refresh enabled')

  return supabaseInstance
}
