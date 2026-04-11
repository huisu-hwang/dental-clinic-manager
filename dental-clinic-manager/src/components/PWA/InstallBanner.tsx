'use client'

import { useState } from 'react'
import { Download, X, Share, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'

export default function InstallBanner() {
  const { isInstallable, isInstalled, isDismissed, isIOS, installApp, dismissBanner } =
    useInstallPrompt()
  const [showGuide, setShowGuide] = useState(false)

  const handleInstall = async () => {
    const accepted = await installApp()
    if (accepted) {
      setShowGuide(true)
      // Auto-hide guide after 6 seconds
      setTimeout(() => setShowGuide(false), 6000)
    }
  }

  // Show post-install guide
  if (showGuide) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg">
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-white p-3 shadow-lg sm:p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-green-600">
            <CheckCircle className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-at-text">설치 완료!</p>
            <p className="text-xs text-at-text-weak">
              홈 화면에 아이콘이 없으면 앱 서랍에서 &quot;클리닉 매니저&quot;를 길게 눌러 홈 화면에
              추가하세요
            </p>
          </div>
          <button
            onClick={() => setShowGuide(false)}
            className="rounded-md p-1.5 text-at-text-weak hover:bg-at-surface-alt hover:text-at-text-secondary"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  // Don't show if already installed or dismissed
  if (isInstalled || isDismissed) return null

  // Don't show if neither installable nor iOS
  if (!isInstallable && !isIOS) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg">
      <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-white p-3 shadow-lg sm:p-4">
        {/* Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600">
          <Download className="h-5 w-5 text-white" />
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-at-text">앱으로 설치하기</p>
          {isIOS && !isInstallable ? (
            <p className="text-xs text-at-text-weak">
              <Share className="mr-0.5 inline h-3 w-3" />
              공유 &gt; 홈 화면에 추가를 눌러주세요
            </p>
          ) : (
            <p className="text-xs text-at-text-weak">바탕화면에 추가하여 빠르게 접속하세요</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {isInstallable && (
            <Button
              size="sm"
              onClick={handleInstall}
              className="bg-at-accent text-white hover:bg-at-accent"
            >
              설치
            </Button>
          )}
          <button
            onClick={dismissBanner}
            className="rounded-md p-1.5 text-at-text-weak hover:bg-at-surface-alt hover:text-at-text-secondary"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
