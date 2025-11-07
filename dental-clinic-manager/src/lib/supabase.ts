import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { CustomStorageAdapter } from './customStorageAdapter'

let supabase: SupabaseClient<Database> | null = null
let initializationError: string | null = null
let customStorage: CustomStorageAdapter | null = null

/**
 * Supabase 클라이언트를 재초기화합니다 (로그인 상태 유지 옵션 변경 시 사용)
 */
export const reinitializeSupabase = () => {
  console.log('[Supabase] Reinitializing client...')
  supabase = null
  customStorage = null
  initializationError = null
  return getSupabase()
}

export const getSupabase = () => {
  if (typeof window === 'undefined') {
    // Server-side에서는 null 반환
    console.log('[Supabase] Running on server-side, returning null')
    return null
  }

  // 이미 초기화 실패한 경우 재시도하지 않음
  if (initializationError) {
    console.error('[Supabase] Previous initialization failed:', initializationError)
    return null
  }

  if (!supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    // 더 자세한 환경 변수 디버깅
    console.log('[Supabase] Environment check:', {
      NODE_ENV: process.env.NODE_ENV,
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseAnonKey,
      urlValue: supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'UNDEFINED',
      keyValue: supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : 'UNDEFINED',
      urlLength: supabaseUrl?.length || 0,
      keyLength: supabaseAnonKey?.length || 0
    })

    // 환경 변수 검증
    if (!supabaseUrl || !supabaseAnonKey) {
      initializationError = `Supabase 환경 변수가 설정되지 않았습니다.
        URL: ${supabaseUrl ? 'SET' : 'NOT SET'}
        KEY: ${supabaseAnonKey ? 'SET' : 'NOT SET'}
        Vercel 대시보드에서 환경 변수를 확인하세요.`
      console.error('[Supabase]', initializationError)

      // 개발 환경에서만 경고 표시
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Supabase] 환경 변수를 .env.local 파일에 추가하고 서버를 재시작하세요.')
      } else {
        console.warn('[Supabase] Production 환경: Vercel 대시보드에서 환경 변수를 설정하고 재배포하세요.')
      }
      return null
    }

    // 빈 값 또는 placeholder 값 체크
    if (supabaseUrl.trim() === '' || supabaseAnonKey.trim() === '' ||
        supabaseUrl === 'https://your-project-id.supabase.co' ||
        supabaseAnonKey === 'your-anon-public-key' ||
        supabaseUrl.includes('your-project-id') ||
        supabaseAnonKey.includes('your-anon-public-key')) {
      initializationError = 'Supabase 환경 변수가 placeholder 값으로 설정되어 있습니다. 실제 값으로 변경하세요.'
      console.error('[Supabase]', initializationError, {
        url: supabaseUrl,
        keyLength: supabaseAnonKey?.length || 0
      })
      return null
    }

    try {
      console.log('[Supabase] Creating client...')

      // 커스텀 스토리지 어댑터 초기화
      if (!customStorage) {
        customStorage = new CustomStorageAdapter()
        console.log('[Supabase] Custom storage adapter initialized')
      }

      supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: false,  // Vercel 환경에서 수동 세션 관리 (안정성 향상)
          detectSessionInUrl: false, // URL 기반 세션 감지 비활성화 (불필요한 리다이렉트 방지)
          storage: customStorage as any,
          storageKey: 'sb-beahjntkmkfhpcbhfnrr-auth-token',
          flowType: 'pkce',
        }
      })
      console.log('[Supabase] Client created successfully with custom storage')

      // Auth state change 에러 핸들러 설정
      if (typeof window !== 'undefined') {
        supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
          console.log('[Supabase] Auth state change:', event)

          if (event === 'TOKEN_REFRESHED') {
            console.log('[Supabase] Token refreshed successfully')
          } else if (event === 'SIGNED_OUT') {
            console.log('[Supabase] User signed out')
            // 로컬 스토리지 정리
            localStorage.removeItem('dental_auth')
            localStorage.removeItem('dental_user')
          }
        })

        // 초기 세션 확인 및 오래된 토큰 정리
        supabase.auth.getSession().then(({ data, error }) => {
          if (error) {
            console.error('[Supabase] Session check error on init:', error.message)
            // Refresh token 에러 시 로컬 스토리지 클리어
            if (error.message?.includes('Refresh Token') || error.message?.includes('Invalid')) {
              console.log('[Supabase] Clearing invalid session data')
              localStorage.removeItem('dental_auth')
              localStorage.removeItem('dental_user')
              // Supabase 로컬 스토리지도 클리어
              const keys = Object.keys(localStorage)
              keys.forEach(key => {
                if (key.startsWith('sb-')) {
                  localStorage.removeItem(key)
                }
              })
            }
          }
        }).catch(err => {
          console.error('[Supabase] Failed to check initial session:', err)
        })
      }
    } catch (error) {
      initializationError = error instanceof Error ? error.message : 'Unknown error'
      console.error('[Supabase] Failed to create client:', error)
      return null
    }
  } else {
    console.log('[Supabase] Using existing client')
  }

  return supabase
}

// 초기화 에러 확인 함수 (디버깅용)
export const getSupabaseInitError = () => initializationError

// Legacy export for backward compatibility
export { getSupabase as supabase }