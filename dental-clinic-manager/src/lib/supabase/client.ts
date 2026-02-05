import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createCookieStorageAdapter } from '../cookieStorageAdapter'

/**
 * 싱글톤 Supabase 클라이언트 인스턴스
 * - 앱 전체에서 하나의 인스턴스만 사용
 * - 자동 토큰 갱신 보장
 * - 세션 상태 변경 모니터링
 */
let supabaseInstance: SupabaseClient<Database> | null = null

/**
 * iOS 디바이스 감지 (Safari, Chrome 등 모든 iOS 브라우저)
 * iOS의 모든 브라우저는 WebKit 엔진을 사용하므로 동일한 제한이 적용됨
 */
function isIOSDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false

  const userAgent = navigator.userAgent || ''
  const platform = navigator.platform || ''

  // iPhone, iPad, iPod 감지
  const isIOS = /iPad|iPhone|iPod/.test(userAgent)
  // iPad on iOS 13+ (desktop mode로 표시되는 경우)
  const isIPadOS = platform === 'MacIntel' && navigator.maxTouchPoints > 1

  return isIOS || isIPadOS
}

/**
 * 브라우저 환경 전용 Supabase 클라이언트 (싱글톤)
 *
 * @supabase/ssr 사용:
 * - Cookie 기반 세션 관리
 * - 자동 토큰 갱신 (autoRefreshToken: true)
 * - persistSession으로 세션 유지
 * - Client Component, useEffect, 이벤트 핸들러에서 사용
 *
 * iOS Safari 호환성 (핵심 변경):
 * - 쿠키 기반 스토리지 어댑터 사용 (localStorage 대신)
 * - iOS Safari에서 앱 종료 후에도 세션 유지
 * - PKCE flow로 보안 강화
 * - 미들웨어와 동일한 기본 storageKey 사용 (일관성 유지)
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

  // iOS 디바이스 감지 및 로깅
  if (isIOSDevice()) {
    console.log('[Supabase Browser Client] iOS device detected - using cookie-based storage for session persistence')
  }

  // 쿠키 기반 스토리지 어댑터 생성
  // iOS Safari에서 앱 종료 후에도 세션 유지를 위해 쿠키 사용
  const cookieStorage = createCookieStorageAdapter()

  // 싱글톤 인스턴스 생성 (iOS 호환 설정 포함)
  // 주의: storageKey는 미들웨어와 일관성을 위해 기본값 사용
  // 커스텀 storageKey 사용 시 미들웨어와 쿠키 이름이 불일치하여 iOS Chrome에서 세션 유지 문제 발생
  supabaseInstance = createBrowserClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        autoRefreshToken: true,  // 자동 토큰 갱신 활성화
        persistSession: true,    // 세션 유지
        detectSessionInUrl: true, // URL에서 세션 감지
        flowType: 'pkce',        // PKCE flow 명시적 사용 (보안 강화)
        storage: cookieStorage,  // 쿠키 기반 스토리지 (iOS Safari 호환)
        // storageKey 제거: 기본값 사용하여 미들웨어와 일관성 유지
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
