/**
 * Cookie-based Storage Adapter for Supabase
 *
 * iOS Safari에서 앱 종료 후에도 세션을 유지하기 위한 쿠키 기반 스토리지 어댑터입니다.
 *
 * 왜 쿠키를 사용하는가?
 * - localStorage: iOS Safari에서 앱 종료 시 클리어될 수 있음 (ITP 정책)
 * - 쿠키: 앱 종료 후에도 유지됨 (maxAge까지)
 *
 * iOS Safari 호환성:
 * - sameSite: 'lax' - 크로스 사이트 네비게이션에서 쿠키 전송
 * - secure: true (HTTPS) - 보안 연결에서만 쿠키 전송
 * - maxAge: 30일 - iOS ITP는 사용자 상호작용 시 쿠키 수명 연장
 */

// 쿠키 옵션 상수
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30  // 30일 (초 단위)
const COOKIE_PATH = '/'

/**
 * 쿠키 값 읽기
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null

  try {
    const cookies = document.cookie.split(';')
    for (const cookie of cookies) {
      const [cookieName, ...cookieValueParts] = cookie.trim().split('=')
      if (cookieName === name) {
        const cookieValue = cookieValueParts.join('=')
        return decodeURIComponent(cookieValue)
      }
    }
    return null
  } catch (error) {
    console.warn('[CookieStorage] getCookie error:', error)
    return null
  }
}

/**
 * 쿠키 값 설정
 */
function setCookie(name: string, value: string, maxAge: number = COOKIE_MAX_AGE): void {
  if (typeof document === 'undefined') return

  try {
    const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'

    // 쿠키 문자열 구성
    let cookieString = `${name}=${encodeURIComponent(value)}`
    cookieString += `; path=${COOKIE_PATH}`
    cookieString += `; max-age=${maxAge}`
    cookieString += '; samesite=lax'

    if (isSecure) {
      cookieString += '; secure'
    }

    document.cookie = cookieString
  } catch (error) {
    console.warn('[CookieStorage] setCookie error:', error)
  }
}

/**
 * 쿠키 삭제
 */
function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return

  try {
    // max-age=0으로 설정하여 쿠키 삭제
    document.cookie = `${name}=; path=${COOKIE_PATH}; max-age=0; samesite=lax`
  } catch (error) {
    console.warn('[CookieStorage] deleteCookie error:', error)
  }
}

/**
 * iOS 디바이스 감지
 */
function isIOSDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false

  const userAgent = navigator.userAgent || ''
  const platform = navigator.platform || ''

  const isIOS = /iPad|iPhone|iPod/.test(userAgent)
  const isIPadOS = platform === 'MacIntel' && navigator.maxTouchPoints > 1

  return isIOS || isIPadOS
}

/**
 * Storage 사용 가능 여부 체크
 */
function isStorageAvailable(storage: Storage): boolean {
  try {
    const testKey = '__storage_test__'
    storage.setItem(testKey, 'test')
    storage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

/**
 * Supabase용 쿠키 기반 스토리지 어댑터
 *
 * localStorage와 동일한 인터페이스를 제공하면서 쿠키에 데이터를 저장합니다.
 * iOS Safari에서 앱 종료 후에도 세션이 유지됩니다.
 */
export function createCookieStorageAdapter(): Storage {
  // 브라우저 환경이 아닌 경우 더미 스토리지 반환
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      get length() { return 0 },
      key: () => null,
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {}
    }
  }

  // iOS 디바이스 로깅
  if (isIOSDevice()) {
    console.log('[CookieStorage] iOS device detected - using cookie-based storage for session persistence')
  }

  // 메모리 캐시 (성능 최적화)
  const memoryCache: Record<string, string> = {}

  // 초기화 시 기존 쿠키 값을 메모리 캐시로 로드
  const initializeCache = () => {
    if (typeof document === 'undefined') return

    try {
      const cookies = document.cookie.split(';')
      for (const cookie of cookies) {
        const [name, ...valueParts] = cookie.trim().split('=')
        // Supabase 관련 쿠키만 캐시 (sb- prefix)
        if (name && name.startsWith('sb-')) {
          const value = valueParts.join('=')
          if (value) {
            memoryCache[name] = decodeURIComponent(value)
          }
        }
      }
    } catch (error) {
      console.warn('[CookieStorage] initializeCache error:', error)
    }
  }

  // 초기 캐시 로드
  initializeCache()

  return {
    get length() {
      return Object.keys(memoryCache).length
    },

    key(index: number): string | null {
      const keys = Object.keys(memoryCache)
      return keys[index] ?? null
    },

    getItem(key: string): string | null {
      // 1. 메모리 캐시 확인
      if (memoryCache[key] !== undefined) {
        return memoryCache[key]
      }

      // 2. 쿠키에서 읽기
      const cookieValue = getCookie(key)
      if (cookieValue !== null) {
        memoryCache[key] = cookieValue
        return cookieValue
      }

      // 3. localStorage 폴백 (기존 세션 마이그레이션)
      // iOS가 아닌 환경에서 localStorage에 저장된 기존 세션이 있을 수 있음
      if (!isIOSDevice() && typeof localStorage !== 'undefined' && isStorageAvailable(localStorage)) {
        const localValue = localStorage.getItem(key)
        if (localValue !== null) {
          // localStorage에서 쿠키로 마이그레이션
          console.log(`[CookieStorage] Migrating ${key} from localStorage to cookie`)
          setCookie(key, localValue)
          memoryCache[key] = localValue
          // localStorage에서 제거 (중복 방지)
          try {
            localStorage.removeItem(key)
          } catch {
            // 무시
          }
          return localValue
        }
      }

      return null
    },

    setItem(key: string, value: string): void {
      // 메모리 캐시 업데이트
      memoryCache[key] = value

      // 쿠키에 저장
      setCookie(key, value)

      // 디버그 로깅 (개발 환경)
      if (process.env.NODE_ENV === 'development') {
        console.log(`[CookieStorage] setItem: ${key} (${value.length} chars)`)
      }
    },

    removeItem(key: string): void {
      // 메모리 캐시에서 제거
      delete memoryCache[key]

      // 쿠키 삭제
      deleteCookie(key)

      // localStorage에서도 제거 (마이그레이션 완료 보장)
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.removeItem(key)
        } catch {
          // 무시
        }
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`[CookieStorage] removeItem: ${key}`)
      }
    },

    clear(): void {
      // Supabase 관련 쿠키만 삭제
      Object.keys(memoryCache).forEach(key => {
        if (key.startsWith('sb-')) {
          deleteCookie(key)
        }
      })

      // 메모리 캐시 클리어
      Object.keys(memoryCache).forEach(key => {
        delete memoryCache[key]
      })

      console.log('[CookieStorage] Cleared all Supabase cookies')
    }
  }
}

/**
 * 모든 Supabase 관련 쿠키 삭제
 * 로그아웃 시 사용
 */
export function clearAllSupabaseCookies(): void {
  if (typeof document === 'undefined') return

  try {
    const cookies = document.cookie.split(';')
    for (const cookie of cookies) {
      const [name] = cookie.trim().split('=')
      if (name && (name.startsWith('sb-') || name.startsWith('supabase'))) {
        deleteCookie(name)
      }
    }
    console.log('[CookieStorage] All Supabase cookies cleared')
  } catch (error) {
    console.warn('[CookieStorage] clearAllSupabaseCookies error:', error)
  }
}

/**
 * 세션 쿠키 갱신 (사용자 활동 시 호출)
 * iOS ITP는 사용자 상호작용 시 쿠키 수명을 연장합니다.
 */
export function refreshSessionCookies(): void {
  if (typeof document === 'undefined') return

  try {
    const cookies = document.cookie.split(';')
    for (const cookie of cookies) {
      const [name, ...valueParts] = cookie.trim().split('=')
      if (name && name.startsWith('sb-')) {
        const value = valueParts.join('=')
        if (value) {
          // 같은 값으로 다시 설정하여 maxAge 갱신
          setCookie(name, decodeURIComponent(value))
        }
      }
    }
    console.log('[CookieStorage] Session cookies refreshed')
  } catch (error) {
    console.warn('[CookieStorage] refreshSessionCookies error:', error)
  }
}
