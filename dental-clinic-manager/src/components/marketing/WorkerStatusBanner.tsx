'use client'

import { useEffect, useState } from 'react'
import {
  ExclamationTriangleIcon,
  ClockIcon,
  ArrowPathIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'

interface OverdueItem {
  id: string
  title: string
  publishDate: string
  publishTime: string
  status: string
}

interface RecentFailure {
  id: string
  title: string
  failReason: string
  updatedAt: string
}

interface WorkerStatusResponse {
  worker: {
    online: boolean
    running: boolean
    version: string | null
    lastUpdatedAt: string | null
    heartbeatAgeSeconds: number | null
    updateStatus: string | null
  }
  overdue: { count: number; items: OverdueItem[] }
  recentFailures: RecentFailure[]
}

const POLL_INTERVAL_MS = 30_000

function formatHeartbeatAge(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '알 수 없음'
  if (seconds < 60) return `${seconds}초 전`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`
  return `${Math.floor(seconds / 86400)}일 전`
}

export default function WorkerStatusBanner() {
  const [status, setStatus] = useState<WorkerStatusResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/marketing/worker-status', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setStatus(data)
      } catch {
        // 네트워크 오류 무시 - 다음 폴링에서 재시도
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    fetchStatus()
    const timer = setInterval(fetchStatus, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  if (isLoading || !status) return null

  const workerOffline = !status.worker.online
  const overdueCount = status.overdue.count
  const failureCount = status.recentFailures.length

  // 모든 게 정상이면 배너 숨김
  if (!workerOffline && overdueCount === 0 && failureCount === 0) {
    return null
  }

  // 가장 심각한 상태 기준 색상 결정
  const isError = workerOffline || overdueCount > 0
  const bgClass = isError
    ? 'bg-red-50 border-red-200'
    : 'bg-yellow-50 border-yellow-200'
  const iconClass = isError ? 'text-red-600' : 'text-yellow-600'
  const titleClass = isError ? 'text-red-800' : 'text-yellow-800'
  const textClass = isError ? 'text-red-700' : 'text-yellow-700'

  return (
    <div className={`mb-4 rounded-xl border ${bgClass} p-4`}>
      <div className="flex items-start gap-3">
        <ExclamationTriangleIcon className={`h-5 w-5 ${iconClass} flex-shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold ${titleClass} mb-1`}>
            {workerOffline
              ? '마케팅 워커가 응답하지 않습니다'
              : overdueCount > 0
                ? `발행 지연된 글 ${overdueCount}건`
                : `최근 24시간 발행 실패 ${failureCount}건`}
          </div>

          <div className={`text-sm ${textClass} space-y-1`}>
            {workerOffline && (
              <p>
                마지막 응답: <strong>{formatHeartbeatAge(status.worker.heartbeatAgeSeconds)}</strong>
                {status.worker.version && <span className="text-xs ml-2 opacity-75">(워커 v{status.worker.version})</span>}
              </p>
            )}

            {overdueCount > 0 && (
              <p>
                예약 시간이 지났는데도 발행되지 않은 글이 있습니다.
                {workerOffline && ' 워커를 다시 실행해주세요.'}
              </p>
            )}

            {workerOffline && (
              <div className="mt-2 text-xs bg-white/60 rounded-lg p-3 space-y-1.5">
                <p className="font-semibold">조치 방법</p>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                  <li>워커가 설치된 PC에서 <strong>「클리닉 매니저 워커」</strong> 트레이 아이콘을 확인하고 재시작합니다.</li>
                  <li>워커가 자동 시작되지 않으면 시작 메뉴에서 다시 실행합니다.</li>
                  <li>그래도 안 되면 PowerShell에서 <code className="bg-white px-1 rounded">npx playwright install chromium</code> 실행 후 워커 재시작.</li>
                </ol>
              </div>
            )}

            {(overdueCount > 0 || failureCount > 0) && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className={`mt-2 inline-flex items-center gap-1 text-xs underline ${textClass}`}
              >
                {expanded ? '접기' : '상세 보기'}
              </button>
            )}
          </div>

          {expanded && (
            <div className="mt-3 space-y-3">
              {overdueCount > 0 && (
                <div>
                  <div className={`text-xs font-semibold ${titleClass} mb-1.5 flex items-center gap-1`}>
                    <ClockIcon className="h-3.5 w-3.5" /> 발행 지연 항목
                  </div>
                  <ul className="space-y-1">
                    {status.overdue.items.slice(0, 10).map((item) => (
                      <li key={item.id} className={`text-xs ${textClass} flex items-center gap-2`}>
                        <span className="opacity-60">{item.publishDate} {item.publishTime.slice(0, 5)}</span>
                        <span className="truncate">{item.title}</span>
                        <span className="ml-auto text-[10px] opacity-60">[{item.status}]</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {failureCount > 0 && (
                <div>
                  <div className={`text-xs font-semibold ${titleClass} mb-1.5 flex items-center gap-1`}>
                    <ArrowPathIcon className="h-3.5 w-3.5" /> 최근 24시간 실패
                  </div>
                  <ul className="space-y-1">
                    {status.recentFailures.map((f) => (
                      <li key={f.id} className={`text-xs ${textClass}`}>
                        <div className="font-medium truncate">{f.title}</div>
                        <div className="opacity-70 text-[11px] truncate">{f.failReason}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {!workerOffline && overdueCount === 0 && failureCount === 0 && (
          <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0" />
        )}
      </div>
    </div>
  )
}
