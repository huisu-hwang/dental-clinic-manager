'use client'

import { Download, X, Share } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'

export default function InstallBanner() {
  const { isInstallable, isInstalled, isDismissed, isIOS, installApp, dismissBanner } =
    useInstallPrompt()

  // Don't show if already installed or dismissed
  if (isInstalled || isDismissed) return null

  // Don't show if neither installable nor iOS
  if (!isInstallable && !isIOS) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg">
      <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-white p-3 shadow-lg sm:p-4">
        {/* Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
          <Download className="h-5 w-5 text-white" />
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">앱으로 설치하기</p>
          {isIOS && !isInstallable ? (
            <p className="text-xs text-slate-500">
              <Share className="mr-0.5 inline h-3 w-3" />
              공유 &gt; 홈 화면에 추가를 눌러주세요
            </p>
          ) : (
            <p className="text-xs text-slate-500">바탕화면에 추가하여 빠르게 접속하세요</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {isInstallable && (
            <Button
              size="sm"
              onClick={() => installApp()}
              className="bg-blue-500 text-white hover:bg-blue-600"
            >
              설치
            </Button>
          )}
          <button
            onClick={dismissBanner}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
