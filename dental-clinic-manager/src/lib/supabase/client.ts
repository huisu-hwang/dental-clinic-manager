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
 * Storage 사용 가능 여부 체크
 */
function isStorageAvailable(storage: Storage): boolean {
  try {
    const testKey = '__supabase_storage_test__'
    storage.setItem(testKey, 'test')
    storage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

/**
 * iOS 호환 안전한 Storage 생성
 * - localStorage 사용 가능 시 localStorage 사용
 * - localStorage 불가 시 sessionStorage로 폴백
 * - 둘 다 불가 시 메모리 스토리지 사용 (세션 유지는 안 되지만 앱 크래시 방지)
 */
function createSafeStorage(): Storage {
  // 메모리 기반 폴백 스토리지
  let memoryStorage: Record<string, string> = {}
  const memoryStorageImpl: Storage = {
    get length() {
      return Object.keys(memoryStorage).length
    },
    key(index: number) {
      return Object.keys(memoryStorage)[index] ?? null
    },
    getItem(key: string) {
      return memoryStorage[key] ?? null
    },
    setItem(key: string, value: string) {
      memoryStorage[key] = value
    },
    removeItem(key: string) {
      delete memoryStorage[key]
    },
    clear() {
      memoryStorage = {}
    }
  }

  // 1. localStorage 시도
  if (typeof localStorage !== 'undefined' && isStorageAvailable(localStorage)) {
    console.log('[Supabase Storage] Using localStorage')
    return localStorage
  }

  // 2. sessionStorage 폴백 (iOS Private Browsing에서 유용)
  if (typeof sessionStorage !== 'undefined' && isStorageAvailable(sessionStorage)) {
    console.warn('[Supabase Storage] localStorage unavailable, falling back to sessionStorage')
    console.warn('[Supabase Storage] Session will not persist after browser/tab close')
    return sessionStorage
  }

  // 3. 메모리 스토리지 폴백 (최후의 수단)
  console.error('[Supabase Storage] Both localStorage and sessionStorage unavailable')
  console.error('[Supabase Storage] Using in-memory storage - session will not persist')

  if (isIOSDevice()) {
    console.warn('[Supabase Storage] iOS device detected with storage restrictions')
    console.warn('[Supabase Storage] This may be Private Browsing mode')
  }

  return memoryStorageImpl
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
 * iOS 호환성:
 * - localStorage 불가 시 sessionStorage/메모리 스토리지로 폴백
 * - PKCE flow로 보안 강화
 * - 커스텀 storageKey로 충돌 방지
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
    console.log('[Supabase Browser Client] iOS device detected - using safe storage wrapper')
  }

  // 싱글톤 인스턴스 생성 (iOS 호환 설정 포함)
  supabaseInstance = createBrowserClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        autoRefreshToken: true,  // 자동 토큰 갱신 활성화
        persistSession: true,    // 세션 유지
        detectSessionInUrl: true, // URL에서 세션 감지
        flowType: 'pkce',        // PKCE flow 명시적 사용 (보안 강화)
        storage: createSafeStorage(), // iOS 호환 안전한 스토리지
        storageKey: 'dental-clinic-supabase-auth', // 명시적 storage key
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
      console.log('[Supabase] User signed out, clearing instance')
      supabaseInstance = null
    }

    if (event === 'SIGNED_IN') {
      console.log('[Supabase] User signed in')
    }
  })

  console.log('[Supabase] Singleton instance created with auto-refresh enabled')

  return supabaseInstance
}
