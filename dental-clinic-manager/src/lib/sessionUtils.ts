/**
 * Session Management Utilities
 * Handles Supabase session refresh with timeout and error handling
 */

import type { SupabaseClient } from '@supabase/supabase-js'

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
 * Refresh Supabase session with timeout
 *
 * @param supabase - Supabase client instance
 * @param timeoutMs - Timeout in milliseconds (default: 5000ms)
 * @returns Session data, error, and reinitialization flag
 */
export async function refreshSessionWithTimeout(
  supabase: SupabaseClient,
  timeoutMs: number = 5000
): Promise<RefreshSessionResult> {
  try {
    console.log('[sessionUtils] Attempting to refresh session...')

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

    // Check for errors
    if (result?.error) {
      console.error('[sessionUtils] Session refresh error:', result.error.message)
      return { session: null, error: 'SESSION_EXPIRED' }
    }

    // Check if session exists
    if (!result?.data?.session) {
      console.error('[sessionUtils] No session returned from refresh')
      return { session: null, error: 'SESSION_EXPIRED' }
    }

    console.log('[sessionUtils] Session refreshed successfully')
    return { session: result.data.session, error: null }

  } catch (error) {
    console.error('[sessionUtils] Session refresh failed:', error)

    // Check for connection timeout
    if (isConnectionError(error)) {
      console.warn('[sessionUtils] Connection timeout detected, client reinitialization needed')
      return {
        session: null,
        error: 'CONNECTION_TIMEOUT',
        needsReinitialization: true
      }
    }

    // Clear all session data for session-related errors
    console.log('[sessionUtils] Clearing session data...')
    clearSessionData()

    // Timeout error
    if (error instanceof Error && error.message.includes('timeout')) {
      return { session: null, error: 'SESSION_REFRESH_TIMEOUT' }
    }

    // Other errors
    return { session: null, error: 'SESSION_EXPIRED' }
  }
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
