/**
 * Session Management Utilities
 * Handles Supabase session refresh with timeout and error handling
 *
 * Based on Supabase official documentation and best practices
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Timeout constants (Context7 공식 문서 권장: 10-15초)
 */
export const SESSION_REFRESH_TIMEOUT = 10000  // 10초 (5초에서 증가)
export const SESSION_CHECK_TIMEOUT = 10000    // 10초

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
 * Clear all session data from storage
 */
export function clearSessionData(): void {
  try {
    // Clear dental app data
    localStorage.removeItem('dental_auth')
    localStorage.removeItem('dental_user')
    sessionStorage.removeItem('dental_auth')
    sessionStorage.removeItem('dental_user')

    // Clear Supabase data
    const keys = Object.keys(localStorage)
    keys.forEach(key => {
      if (key.startsWith('sb-')) {
        localStorage.removeItem(key)
      }
    })

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
