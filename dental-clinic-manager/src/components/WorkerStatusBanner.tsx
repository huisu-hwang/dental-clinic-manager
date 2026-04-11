'use client'

import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'

interface WorkerStatusBannerProps {
  workerOnline: boolean | null
  initialCheckDone: boolean
  workerType: 'marketing' | 'scraping'
  onRetry?: () => void
}

const WORKER_INFO = {
  marketing: {
    name: '마케팅 워커',
    offlineMessage: '마케팅 워커가 실행 중이 아닙니다. 콘텐츠 발행이 즉시 처리되지 않을 수 있습니다.',
  },
  scraping: {
    name: '스크래핑 워커',
    offlineMessage: '스크래핑 워커가 실행 중이 아닙니다. 홈택스 데이터 동기화가 처리되지 않습니다.',
  },
}

export default function WorkerStatusBanner({
  workerOnline,
  initialCheckDone,
  workerType,
  onRetry,
}: WorkerStatusBannerProps) {
  const info = WORKER_INFO[workerType]

  // 확인 중
  if (!initialCheckDone) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-at-surface-alt border border-at-border rounded-xl text-sm text-at-text-weak">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        <span>{info.name} 상태 확인 중...</span>
      </div>
    )
  }

  // 오프라인
  if (workerOnline === false) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-at-warning-bg border border-amber-200 rounded-xl text-sm text-at-warning">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="flex-1">{info.offlineMessage}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="ml-2 p-1 text-at-warning hover:text-amber-800 hover:bg-amber-100 rounded transition-colors"
            title="다시 확인"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>
    )
  }

  // 온라인 - 표시하지 않음
  return null
}
