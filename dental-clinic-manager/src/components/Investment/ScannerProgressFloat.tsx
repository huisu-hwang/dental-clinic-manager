'use client'

/**
 * ScannerProgressFloat — 종목 스캔 진행률 floating 위젯
 *
 * 어떤 페이지에 있든 우측 하단에 떠서 백그라운드 스캔의 진행률/결과를 알려줌.
 * 스캔 중: 진행률 바 + 현재 처리 종목 + 누적 매칭 수
 * 완료 시: ✅ 완료 — N건 매칭 (5초 후 자동 hide)
 * 에러 시: 빨간색 에러 박스
 */

import { useEffect, useState } from 'react'
import { AlertCircle, Check, X, Zap } from 'lucide-react'

import { useScanner } from '@/contexts/ScannerContext'

const AUTO_HIDE_AFTER_COMPLETE_MS = 5000

export default function ScannerProgressFloat() {
  const { job, cancelScan, resetJob } = useScanner()
  const [autoHidden, setAutoHidden] = useState(false)

  // 새 스캔이 시작되면 autoHidden 리셋
  useEffect(() => {
    if (!job) {
      setAutoHidden(false)
      return
    }
    if (job.status === 'scanning') {
      setAutoHidden(false)
    }
  }, [job?.id, job?.status, job])

  // 완료 후 5초 자동 hide
  useEffect(() => {
    if (job?.status !== 'completed') return
    const timer = setTimeout(() => setAutoHidden(true), AUTO_HIDE_AFTER_COMPLETE_MS)
    return () => clearTimeout(timer)
  }, [job?.status, job?.id])

  if (!job) return null
  if (job.status === 'idle') return null
  if (autoHidden && job.status === 'completed') return null

  const total = Math.max(1, job.total)
  const percent = Math.min(100, Math.round((job.processed / total) * 100))

  const totalMatches = Object.values(job.matchesByStrategy).reduce(
    (sum, arr) => sum + arr.length,
    0,
  )

  const isScanning = job.status === 'scanning'
  const isCompleted = job.status === 'completed'
  const isCancelled = job.status === 'cancelled'
  const isError = job.status === 'error'

  // 색상 테마
  const headerBg = isError
    ? 'bg-red-50 border-red-200'
    : isCompleted
      ? 'bg-emerald-50 border-emerald-200'
      : 'bg-purple-50 border-purple-200'
  const barColor = isError
    ? 'bg-red-500'
    : isCompleted
      ? 'bg-emerald-500'
      : 'bg-purple-500'

  const handleDismiss = () => {
    if (isScanning) {
      cancelScan()
    } else {
      resetJob()
    }
  }

  return (
    <div
      className="fixed z-50 bottom-4 right-4 w-[calc(100vw-2rem)] sm:w-80 max-w-sm"
      role="status"
      aria-live="polite"
    >
      <div className={`rounded-2xl shadow-lg border ${headerBg} bg-white overflow-hidden`}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-at-border/60">
          <div className="flex items-center gap-2 min-w-0">
            {isError ? (
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            ) : isCompleted ? (
              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <span className="text-base leading-none flex-shrink-0">📡</span>
            )}
            <span className="font-semibold text-sm text-at-text truncate">
              {isError
                ? '스캔 오류'
                : isCompleted
                  ? '스캔 완료'
                  : isCancelled
                    ? '스캔 취소됨'
                    : '종목 스캔 중'}
            </span>
            {job.realtime && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold flex-shrink-0">
                <Zap className="w-3 h-3" /> 실시간
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 rounded-full text-at-text-weak hover:text-at-text hover:bg-at-bg flex-shrink-0"
            title={isScanning ? '취소' : '닫기'}
            aria-label={isScanning ? '스캔 취소' : '닫기'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="px-4 py-3 space-y-2">
          {isError ? (
            <p className="text-xs text-red-700 leading-relaxed">
              {job.error || '알 수 없는 오류'}
            </p>
          ) : isCompleted ? (
            <p className="text-xs text-emerald-700 font-medium">
              ✅ 완료 — {totalMatches}건 매칭 ({job.processed}/{job.total} 종목)
            </p>
          ) : isCancelled ? (
            <p className="text-xs text-at-text-secondary">
              {job.processed}/{job.total} 종목 처리 후 취소됨 · 매칭 {totalMatches}건
            </p>
          ) : (
            <>
              {/* 진행률 바 */}
              <div className="w-full h-1.5 bg-at-surface-alt rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} transition-all duration-300`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-at-text-secondary">
                <span className="font-mono">
                  {job.processed}/{job.total}
                </span>
                <span className="font-semibold text-at-text">{percent}%</span>
              </div>
              {job.currentTickers.length > 0 && (
                <p className="text-[11px] text-at-text-weak truncate">
                  처리 중: <span className="font-mono">{job.currentTickers.join(', ')}</span>
                </p>
              )}
              <p className="text-[11px] text-at-text-secondary">
                <span className="font-semibold text-purple-600">매칭 {totalMatches}건</span>
                <span className="mx-1">·</span>
                <span>{job.universeLabel}</span>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
