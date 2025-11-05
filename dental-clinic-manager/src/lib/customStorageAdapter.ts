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
    // sessionStorage → localStorage 마이그레이션
    migrateStorage(window.sessionStorage, window.localStorage)
    localStorage.setItem(REMEMBER_ME_KEY, 'true')
    console.log('[CustomStorage] Remember me enabled - migrated to localStorage')
  } else {
    // localStorage → sessionStorage 마이그레이션
    migrateStorage(window.localStorage, window.sessionStorage)
    localStorage.removeItem(REMEMBER_ME_KEY)
    console.log('[CustomStorage] Remember me disabled - migrated to sessionStorage')
  }
}

/**
 * Storage 간 데이터 마이그레이션
 */
function migrateStorage(from: Storage, to: Storage): void {
  try {
    // Supabase 세션 데이터와 앱 데이터만 이동
    const keysToMigrate: string[] = []

    // Storage 객체의 모든 키 수집
    for (let i = 0; i < from.length; i++) {
      const key = from.key(i)
      if (key && (key.startsWith('sb-') || key === 'dental_auth' || key === 'dental_user' || key === 'dental_clinic_id')) {
        keysToMigrate.push(key)
      }
    }

    // 수집한 키들의 데이터 이동
    keysToMigrate.forEach(key => {
      const value = from.getItem(key)
      if (value) {
        to.setItem(key, value)
        from.removeItem(key)
      }
    })

    console.log(`[CustomStorage] Migrated ${keysToMigrate.length} session data items between storages`)
  } catch (error) {
    console.error('[CustomStorage] Migration error:', error)
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
    const keysToRemove: string[] = []

    // Storage 객체의 모든 키 수집
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key && (key.startsWith('sb-') || key === 'dental_auth' || key === 'dental_user')) {
        keysToRemove.push(key)
      }
    }

    // 수집한 키들 삭제
    keysToRemove.forEach(key => {
      storage.removeItem(key)
    })
  })

  // 로그인 상태 유지 플래그도 삭제
  localStorage.removeItem(REMEMBER_ME_KEY)

  console.log('[CustomStorage] All sessions cleared')
}
