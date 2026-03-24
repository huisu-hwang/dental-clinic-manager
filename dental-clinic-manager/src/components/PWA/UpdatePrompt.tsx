'use client'

import { useState, useEffect, useCallback } from 'react'

interface UpdatePromptProps {
  /** 자동 새로고침까지 대기 시간 (ms). 0이면 자동 새로고침 안 함 */
  autoReloadDelay?: number
}

/**
 * PWA 업데이트 알림 배너
 * 새 버전이 감지되면 사용자에게 알리고, 새로고침 버튼을 제공합니다.
 * 모든 플랫폼(Windows, Mac, Android, iOS)에서 동작합니다.
 */
export default function UpdatePrompt({ autoReloadDelay = 0 }: UpdatePromptProps) {
  const [showUpdate, setShowUpdate] = useState(false)
  const [countdown, setCountdown] = useState(0)

  // 업데이트 이벤트 수신
  useEffect(() => {
    const handleUpdateAvailable = () => {
      setShowUpdate(true)
      if (autoReloadDelay > 0) {
        setCountdown(Math.ceil(autoReloadDelay / 1000))
      }
    }

    window.addEventListener('pwa-update-available', handleUpdateAvailable)
    return () => window.removeEventListener('pwa-update-available', handleUpdateAvailable)
  }, [autoReloadDelay])

  // 자동 새로고침 카운트다운
  useEffect(() => {
    if (!showUpdate || autoReloadDelay <= 0) return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          window.location.reload()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [showUpdate, autoReloadDelay])

  const handleReload = useCallback(() => {
    window.location.reload()
  }, [])

  const handleDismiss = useCallback(() => {
    setShowUpdate(false)
  }, [])

  if (!showUpdate) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center pointer-events-none">
      <div className="bg-blue-600 text-white rounded-xl shadow-2xl px-5 py-4 max-w-sm w-full pointer-events-auto animate-in slide-in-from-bottom-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">새 버전이 있습니다</p>
            <p className="text-xs text-blue-100 mt-0.5">
              최신 기능을 사용하려면 새로고침하세요.
              {countdown > 0 && ` (${countdown}초 후 자동 새로고침)`}
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-blue-200 hover:text-white transition-colors"
            aria-label="닫기"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <button
          onClick={handleReload}
          className="mt-3 w-full bg-white text-blue-600 text-sm font-semibold py-2 rounded-lg hover:bg-blue-50 transition-colors active:scale-[0.98]"
        >
          지금 새로고침
        </button>
      </div>
    </div>
  )
}
