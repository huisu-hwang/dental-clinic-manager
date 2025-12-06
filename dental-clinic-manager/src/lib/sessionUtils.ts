/**
 * Session Management Utilities
 * Handles Supabase session refresh with timeout and error handling
 *
 * Based on Supabase official documentation and best practices
 * iOS compatibility: Safe localStorage access with fallback
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Timeout constants (공격적 최적화: 빠른 사용자 경험 우선)
 */
export const SESSION_REFRESH_TIMEOUT = 5000  // 5초 (10초에서 감소 - 공격적 최적화)
export const SESSION_CHECK_TIMEOUT = 3000    // 3초 (10초에서 감소 - 공격적 최적화)

/**
 * iOS 디바이스 감지
 */
export function isIOSDevice(): boolean {
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
    const testKey = '__session_storage_test__'
    storage.setItem(testKey, 'test')
    storage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

/**
 * localStorage 사용 가능 여부 (iOS Private Browsing 대응)
 */
let localStorageAvailable: boolean | null = null
export function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false
  if (localStorageAvailable !== null) return localStorageAvailable

  localStorageAvailable = typeof localStorage !== 'undefined' && isStorageAvailable(localStorage)
  return localStorageAvailable
}

/**
 * 안전한 localStorage 접근 - iOS Private Browsing 대응
 */
export const safeLocalStorage = {
  getItem(key: string): string | null {
    try {
      if (!isLocalStorageAvailable()) {
        // sessionStorage 폴백 시도
        if (typeof sessionStorage !== 'undefined' && isStorageAvailable(sessionStorage)) {
          return sessionStorage.getItem(key)
        }
        return null
      }
      return localStorage.getItem(key)
    } catch (error) {
      console.warn('[safeLocalStorage] getItem error:', error)
      return null
    }
  },

  setItem(key: string, value: string): boolean {
    try {
      if (!isLocalStorageAvailable()) {
        // sessionStorage 폴백 시도
        if (typeof sessionStorage !== 'undefined' && isStorageAvailable(sessionStorage)) {
          sessionStorage.setItem(key, value)
          return true
        }
        return false
      }
      localStorage.setItem(key, value)
      return true
    } catch (error) {
      console.warn('[safeLocalStorage] setItem error:', error)
      return false
    }
  },

  removeItem(key: string): boolean {
    try {
      if (!isLocalStorageAvailable()) {
        // sessionStorage 폴백 시도
        if (typeof sessionStorage !== 'undefined' && isStorageAvailable(sessionStorage)) {
          sessionStorage.removeItem(key)
        }
        return true
      }
      localStorage.removeItem(key)
      return true
    } catch (error) {
      console.warn('[safeLocalStorage] removeItem error:', error)
      return false
    }
  },

  /**
   * Supabase 관련 키 모두 제거 (sb- prefix)
   */
  clearSupabaseData(): void {
    try {
      const storages = [localStorage, sessionStorage].filter(
        s => typeof s !== 'undefined' && isStorageAvailable(s)
      )

      storages.forEach(storage => {
        const keys = Object.keys(storage)
        keys.forEach(key => {
          if (key.startsWith('sb-') || key.startsWith('dental-clinic-supabase')) {
            storage.removeItem(key)
          }
        })
      })
    } catch (error) {
      console.warn('[safeLocalStorage] clearSupabaseData error:', error)
    }
  }
}

/**
 * Result type for session refresh operations
 */
export interface RefreshSessionResult {
  session: any | null
  error: string | null
  needsReinitialization?: boolean
}

/**
 * Check if an error is a connection timeout error
 *
 * @param error - Error object to check
 * @returns True if the error indicates a connection timeout
 */
export function isConnectionError(error: any): boolean {
  if (!error) return false

  const errorMessage = error.message?.toLowerCase() || ''
  const errorCode = error.code?.toUpperCase() || ''

  // Connection timeout patterns
  return (
    errorCode === 'ECONNRESET' ||
    errorCode === 'ETIMEDOUT' ||
    errorCode === 'ENOTFOUND' ||
    errorCode === 'ECONNREFUSED' ||
    (errorMessage.includes('connection') && errorMessage.includes('timeout')) ||
    errorMessage.includes('connection terminated') ||
    errorMessage.includes('failed to fetch') ||
    errorMessage.includes('network error') ||
    errorMessage.includes('connection refused') ||
    errorMessage.includes('connection reset')
  )
}

/**
 * Refresh Supabase session with timeout and retry logic
 *
 * Improved based on Context7 official documentation:
 * - Timeout increased from 5s to 10s (recommended 10-15s)
 * - Retry logic added for transient network failures
 * - Exponential backoff for retries (1s, 2s)
 * - Enhanced logging with attempt numbers
 *
 * @param supabase - Supabase client instance
 * @param timeoutMs - Timeout in milliseconds (default: 10000ms)
 * @param maxRetries - Maximum number of retry attempts (default: 2)
 * @returns Session data, error, and reinitialization flag
 */
export async function refreshSessionWithTimeout(
  supabase: SupabaseClient,
  timeoutMs: number = SESSION_REFRESH_TIMEOUT,
  maxRetries: number = 2
): Promise<RefreshSessionResult> {
  // Retry loop with exponential backoff
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[sessionUtils] Attempting to refresh session... (Attempt ${attempt + 1}/${maxRetries})`)

      // Create refresh promise
      const refreshPromise = supabase.auth.refreshSession()

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Session refresh timeout'))
        }, timeoutMs)
      })

      // Race between refresh and timeout
      const result = await Promise.race([refreshPromise, timeoutPromise]) as any

      // Check for errors from Supabase
      if (result?.error) {
        console.error(`[sessionUtils] Attempt ${attempt + 1}/${maxRetries} failed:`, result.error.message)

        // Retry on last attempt
        if (attempt === maxRetries - 1) {
          return { session: null, error: 'SESSION_EXPIRED' }
        }

        // Exponential backoff before retry
        const backoffMs = 1000 * (attempt + 1)  // 1s, 2s
        console.log(`[sessionUtils] Retrying in ${backoffMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, backoffMs))
        continue
      }

      // Check if session exists
      if (!result?.data?.session) {
        console.error(`[sessionUtils] Attempt ${attempt + 1}/${maxRetries}: No session returned from refresh`)

        if (attempt === maxRetries - 1) {
          return { session: null, error: 'SESSION_EXPIRED' }
        }

        // Exponential backoff before retry
        const backoffMs = 1000 * (attempt + 1)
        console.log(`[sessionUtils] Retrying in ${backoffMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, backoffMs))
        continue
      }

      console.log(`[sessionUtils] Session refreshed successfully (Attempt ${attempt + 1}/${maxRetries})`)
      return { session: result.data.session, error: null }

    } catch (error) {
      console.error(`[sessionUtils] Attempt ${attempt + 1}/${maxRetries} error:`, error)

      // Check for connection timeout
      if (isConnectionError(error)) {
        console.warn('[sessionUtils] Connection timeout detected')

        if (attempt === maxRetries - 1) {
          console.warn('[sessionUtils] Max retries reached, client reinitialization needed')
          return {
            session: null,
            error: 'CONNECTION_TIMEOUT',
            needsReinitialization: true
          }
        }

        // Exponential backoff for connection errors
        const backoffMs = 1000 * (attempt + 1)
        console.log(`[sessionUtils] Retrying connection in ${backoffMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, backoffMs))
        continue
      }

      // Non-retryable error: clear session and exit
      console.log('[sessionUtils] Non-retryable error detected, clearing session data...')
      clearSessionData()

      // Timeout error
      if (error instanceof Error && error.message.includes('timeout')) {
        return { session: null, error: 'SESSION_REFRESH_TIMEOUT' }
      }

      // Other errors
      return { session: null, error: 'SESSION_EXPIRED' }
    }
  }

  // Should never reach here, but just in case
  console.error('[sessionUtils] Unexpected: exited retry loop without returning')
  return { session: null, error: 'SESSION_EXPIRED' }
}

/**
 * Clear all session data from storage (iOS 호환)
 */
export function clearSessionData(): void {
  try {
    // Clear dental app data using safe storage
    safeLocalStorage.removeItem('dental_auth')
    safeLocalStorage.removeItem('dental_user')
    safeLocalStorage.removeItem('dental_logging_out')

    // Clear Supabase data
    safeLocalStorage.clearSupabaseData()

    console.log('[sessionUtils] Session data cleared')
  } catch (error) {
    console.error('[sessionUtils] Failed to clear session data:', error)
  }
}

/**
 * Redirect to login page with session expired message
 */
export function redirectToLogin(reason: string = 'session_expired'): void {
  console.log('[sessionUtils] Redirecting to login...', reason)

  // Add a small delay to allow console logs to be written
  setTimeout(() => {
    window.location.href = `/?${reason}=true`
  }, 100)
}

/**
 * Handle session expiration
 * Clears data and redirects to login
 */
export function handleSessionExpired(reason: string = 'session_expired'): void {
  console.log('[sessionUtils] Handling session expiration...')
  clearSessionData()
  redirectToLogin(reason)
}
