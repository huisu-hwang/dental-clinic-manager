'use client'

import { useEffect, useRef, useCallback } from 'react'

interface UseActivityTrackerOptions {
  onInactive: () => void
  inactivityTimeout: number // in milliseconds
  enabled?: boolean
}

/**
 * Hook to track user activity and trigger callback after inactivity
 * @param onInactive - Callback to execute when user is inactive
 * @param inactivityTimeout - Timeout duration in milliseconds (default: 4 hours)
 * @param enabled - Whether to enable activity tracking (default: true)
 */
export function useActivityTracker({
  onInactive,
  inactivityTimeout = 4 * 60 * 60 * 1000, // 4 hours in milliseconds
  enabled = true
}: UseActivityTrackerOptions) {
  const timeoutIdRef = useRef<NodeJS.Timeout | null>(null)
  const lastActivityRef = useRef<number>(Date.now())

  const resetTimer = useCallback(() => {
    // Clear existing timeout
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current)
    }

    // Update last activity time
    lastActivityRef.current = Date.now()

    // Set new timeout
    timeoutIdRef.current = setTimeout(() => {
      console.log('[ActivityTracker] User inactive for', inactivityTimeout / 1000, 'seconds')
      onInactive()
    }, inactivityTimeout)
  }, [onInactive, inactivityTimeout])

  useEffect(() => {
    if (!enabled) {
      return
    }

    console.log('[ActivityTracker] Starting activity tracking with timeout:', inactivityTimeout / 1000, 'seconds')

    // Events that indicate user activity
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click'
    ]

    // Throttle function to prevent too frequent timer resets
    let throttleTimeout: NodeJS.Timeout | null = null
    const throttledResetTimer = () => {
      if (!throttleTimeout) {
        resetTimer()
        throttleTimeout = setTimeout(() => {
          throttleTimeout = null
        }, 1000) // Throttle to once per second
      }
    }

    // Add event listeners
    events.forEach(event => {
      window.addEventListener(event, throttledResetTimer, true)
    })

    // Initialize timer
    resetTimer()

    // Cleanup
    return () => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current)
      }
      if (throttleTimeout) {
        clearTimeout(throttleTimeout)
      }
      events.forEach(event => {
        window.removeEventListener(event, throttledResetTimer, true)
      })
      console.log('[ActivityTracker] Cleanup completed')
    }
  }, [enabled, resetTimer, inactivityTimeout])

  return {
    lastActivity: lastActivityRef.current,
    resetTimer
  }
}
