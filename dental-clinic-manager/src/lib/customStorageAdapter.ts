/**
 * Custom Storage Adapter for Supabase
 * 로그인 상태 유지 옵션에 따라 localStorage 또는 sessionStorage를 사용합니다.
 */

const REMEMBER_ME_KEY = 'dental_remember_me'

export class CustomStorageAdapter {
  private getStorage(): Storage {
    // 브라우저 환경이 아니면 기본 객체 반환
    if (typeof window === 'undefined') {
      return {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0
      } as Storage
    }

    // rememberMe 플래그에 따라 localStorage 또는 sessionStorage 사용
    const rememberMe = getRememberMe()
    const storage = rememberMe ? window.localStorage : window.sessionStorage

    console.log(`[CustomStorage] Using ${rememberMe ? 'localStorage' : 'sessionStorage'} (rememberMe: ${rememberMe})`)

    return storage
  }

  getItem(key: string): string | null {
    try {
      const storage = this.getStorage()
      const value = storage.getItem(key)
      return value
    } catch (error) {
      console.error('[CustomStorage] getItem error:', error)
      return null
    }
  }

  setItem(key: string, value: string): void {
    try {
      const storage = this.getStorage()
      storage.setItem(key, value)
    } catch (error) {
      console.error('[CustomStorage] setItem error:', error)
    }
  }

  removeItem(key: string): void {
    try {
      const storage = this.getStorage()
      storage.removeItem(key)
    } catch (error) {
      console.error('[CustomStorage] removeItem error:', error)
    }
  }
}

/**
 * 로그인 상태 유지 플래그 설정
 */
export function setRememberMe(remember: boolean): void {
  if (typeof window === 'undefined') return

  if (remember) {
    localStorage.setItem(REMEMBER_ME_KEY, 'true')
    console.log('[CustomStorage] Remember me enabled - using localStorage')
  } else {
    localStorage.removeItem(REMEMBER_ME_KEY)
    console.log('[CustomStorage] Remember me disabled - using sessionStorage')
  }
}

/**
 * 로그인 상태 유지 플래그 확인
 */
export function getRememberMe(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(REMEMBER_ME_KEY) === 'true'
}

/**
 * 세션 완전 클리어 (로그아웃 시 사용)
 */
export function clearAllSessions(): void {
  if (typeof window === 'undefined') return

  // localStorage와 sessionStorage 모두에서 Supabase 관련 데이터 삭제
  const storages = [window.localStorage, window.sessionStorage]

  storages.forEach(storage => {
    const keys = Object.keys(storage)
    keys.forEach(key => {
      if (key.startsWith('sb-') || key === 'dental_auth' || key === 'dental_user') {
        storage.removeItem(key)
      }
    })
  })

  // 로그인 상태 유지 플래그도 삭제
  localStorage.removeItem(REMEMBER_ME_KEY)

  console.log('[CustomStorage] All sessions cleared')
}
