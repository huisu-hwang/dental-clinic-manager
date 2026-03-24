'use client'

import { useState, useEffect } from 'react'
import { useHometaxSync } from '@/contexts/HometaxSyncContext'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  X,
  ChevronDown,
  ChevronUp,
  Square,
  RefreshCw,
  Minimize2,
} from 'lucide-react'

const DATA_TYPE_LABELS: Record<string, string> = {
  tax_invoice_sales: '세금계산서 매출',
  tax_invoice_purchase: '세금계산서 매입',
  cash_receipt_sales: '현금영수증 매출',
  cash_receipt_purchase: '현금영수증 매입',
  business_card_purchase: '사업용카드 매입',
  credit_card_sales: '신용카드 매출',
}

export default function FloatingSyncProgress() {
  const { currentJob, syncing, cancelling, cancelSync, error, success, clearMessages } = useHometaxSync()
  const [expanded, setExpanded] = useState(true)
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const isActiveJob = currentJob && ['pending', 'running'].includes(currentJob.status)
  const isFinished = currentJob && ['completed', 'failed', 'cancelled'].includes(currentJob.status)

  // Show when there's an active job or a recently finished job
  useEffect(() => {
    if (isActiveJob) {
      setVisible(true)
      setDismissed(false)
      setExpanded(true)
    } else if (isFinished && !dismissed) {
      setVisible(true)
      // Auto-hide after 8 seconds when finished
      const timer = setTimeout(() => {
        setVisible(false)
      }, 8000)
      return () => clearTimeout(timer)
    }
  }, [isActiveJob, isFinished, dismissed])

  if (!visible || dismissed || (!isActiveJob && !isFinished)) return null

  const total = currentJob?.data_types?.length || 0
  const completed = currentJob?.completedTypes?.length || 0
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

  const handleDismiss = () => {
    setDismissed(true)
    setVisible(false)
    clearMessages()
  }

  const clinicId = '' // cancelSync needs clinicId, but it's stored in the context ref

  return (
    <div
      className="fixed right-4 top-1/2 -translate-y-1/2 z-40 w-72 animate-in slide-in-from-right-5 duration-300"
      style={{ maxHeight: 'calc(100vh - 120px)' }}
    >
      <div className={`rounded-2xl shadow-lg border overflow-hidden backdrop-blur-sm ${
        isActiveJob
          ? 'bg-white/95 border-blue-200 shadow-blue-100/50'
          : currentJob?.status === 'completed'
            ? 'bg-white/95 border-emerald-200 shadow-emerald-100/50'
            : 'bg-white/95 border-red-200 shadow-red-100/50'
      }`}>
        {/* Header */}
        <div className={`px-3 py-2.5 flex items-center justify-between ${
          isActiveJob
            ? 'bg-blue-50/80'
            : currentJob?.status === 'completed'
              ? 'bg-emerald-50/80'
              : 'bg-red-50/80'
        }`}>
          <div className="flex items-center gap-2 min-w-0">
            {isActiveJob ? (
              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
            ) : currentJob?.status === 'completed' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className={`text-xs font-bold truncate ${
              isActiveJob ? 'text-blue-800' : currentJob?.status === 'completed' ? 'text-emerald-800' : 'text-red-800'
            }`}>
              {isActiveJob
                ? '홈택스 동기화 중...'
                : currentJob?.status === 'completed'
                  ? '동기화 완료'
                  : currentJob?.status === 'cancelled'
                    ? '동기화 취소됨'
                    : '동기화 실패'}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded-lg hover:bg-white/60 transition-colors"
            >
              {expanded ? <Minimize2 className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
            </button>
            {!isActiveJob && (
              <button
                onClick={handleDismiss}
                className="p-1 rounded-lg hover:bg-white/60 transition-colors"
              >
                <X className="w-3.5 h-3.5 text-slate-500" />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        {expanded && (
          <div className="px-3 py-3 space-y-2.5">
            {/* Progress bar */}
            {isActiveJob && (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    {currentJob?.status === 'pending' ? '워커 대기 중...' : '데이터 수집 중...'}
                  </span>
                  <span className="font-bold text-blue-700">{completed}/{total}</span>
                </div>
                <div className="w-full bg-blue-100 rounded-full h-1.5">
                  {total > 0 ? (
                    <div
                      className="h-1.5 bg-blue-600 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(5, percent)}%` }}
                    />
                  ) : (
                    <div className="h-1.5 bg-blue-400 rounded-full animate-pulse w-full" />
                  )}
                </div>
              </>
            )}

            {/* Data types grid */}
            <div className="space-y-1">
              {(currentJob?.data_types || []).map(dt => {
                const isDone = currentJob?.completedTypes?.includes(dt)
                return (
                  <div
                    key={dt}
                    className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg ${
                      isDone
                        ? 'bg-emerald-50 text-emerald-700'
                        : isActiveJob
                          ? 'bg-slate-50 text-slate-600'
                          : currentJob?.status === 'failed'
                            ? 'bg-red-50 text-red-600'
                            : 'bg-slate-50 text-slate-500'
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-500" />
                    ) : isActiveJob ? (
                      <Loader2 className="w-3 h-3 shrink-0 animate-spin text-blue-500" />
                    ) : (
                      <XCircle className="w-3 h-3 shrink-0 text-red-400" />
                    )}
                    <span className="truncate">{DATA_TYPE_LABELS[dt] || dt}</span>
                  </div>
                )
              })}
            </div>

            {/* Error message */}
            {currentJob?.status === 'failed' && currentJob.error_message && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1.5">
                {currentJob.error_message}
              </p>
            )}

            {/* Cancel button for active jobs */}
            {isActiveJob && (
              <button
                onClick={() => cancelSync()}
                disabled={cancelling}
                className="w-full py-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
              >
                {cancelling ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Square className="w-3 h-3" />
                )}
                동기화 취소
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
