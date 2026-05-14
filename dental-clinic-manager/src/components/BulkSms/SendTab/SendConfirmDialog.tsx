'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  selectedCount: number
  message: string
  sampleName: string
  excludeRecallExcluded: boolean
  mode: 'immediate' | 'scheduled'
  scheduledAt?: string
  sending: boolean
}

export default function SendConfirmDialog({
  open, onClose, onConfirm, selectedCount, message, sampleName,
  excludeRecallExcluded, mode, scheduledAt, sending,
}: Props) {
  const [preview, setPreview] = useState<{ preview: string; msg_type: 'SMS' | 'LMS'; bytes: number } | null>(null)

  useEffect(() => {
    if (!open) return
    fetch('/api/bulk-sms/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, samplePatientName: sampleName || '홍길동' }),
    }).then(r => r.json()).then(d => { if (d.success) setPreview({ preview: d.preview, msg_type: d.msg_type, bytes: d.bytes }) })
  }, [open, message, sampleName])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--at-border)]">
          <h2 className="text-lg font-semibold text-[var(--at-text-primary)]">발송 확인</h2>
          <button onClick={onClose} className="text-[var(--at-text-weak)] hover:text-[var(--at-text-secondary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-3 text-sm">
          <div>
            <span className="text-[var(--at-text-secondary)]">발송 대상:</span>
            <span className="ml-2 font-semibold text-[var(--at-text-primary)]">{selectedCount}명</span>
          </div>
          {preview && (
            <>
              <div>
                <span className="text-[var(--at-text-secondary)]">메시지 유형:</span>
                <span className="ml-2 font-medium">{preview.msg_type}</span>
                <span className="ml-2 text-xs text-[var(--at-text-weak)]">({preview.bytes} 바이트)</span>
              </div>
              <div>
                <p className="text-[var(--at-text-secondary)] mb-1">미리보기 ({sampleName || '홍길동'} 기준)</p>
                <div className="bg-[var(--at-surface-alt)] border border-[var(--at-border)] rounded p-3 whitespace-pre-wrap text-[var(--at-text-primary)] text-xs">{preview.preview}</div>
              </div>
            </>
          )}
          <div>
            <span className="text-[var(--at-text-secondary)]">발송 방식:</span>
            <span className="ml-2 font-medium">
              {mode === 'immediate' ? '즉시 발송' : `예약 발송 (${scheduledAt ? new Date(scheduledAt).toLocaleString('ko-KR') : '-'})`}
            </span>
          </div>
          {!excludeRecallExcluded && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
              <p className="text-amber-800 text-xs">리콜 제외 환자도 포함되어 발송됩니다.</p>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[var(--at-border)] flex justify-end gap-2">
          <button onClick={onClose} disabled={sending} className="px-3 py-1.5 text-sm rounded-lg border border-[var(--at-border)] hover:bg-[var(--at-surface-alt)]">취소</button>
          <button
            onClick={onConfirm}
            disabled={sending}
            className="px-4 py-1.5 text-sm rounded-lg bg-[var(--at-accent)] text-white hover:opacity-90 disabled:opacity-50"
          >
            {sending ? '발송 중...' : `${selectedCount}명에게 발송`}
          </button>
        </div>
      </div>
    </div>
  )
}
