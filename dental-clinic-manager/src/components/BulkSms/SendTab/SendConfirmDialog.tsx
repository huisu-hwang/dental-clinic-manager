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
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">발송 확인</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-3 text-sm">
          <div>
            <span className="text-gray-500">발송 대상:</span>
            <span className="ml-2 font-semibold text-gray-900">{selectedCount}명</span>
          </div>
          {preview && (
            <>
              <div>
                <span className="text-gray-500">메시지 유형:</span>
                <span className="ml-2 font-medium">{preview.msg_type}</span>
                <span className="ml-2 text-xs text-gray-400">({preview.bytes} 바이트)</span>
              </div>
              <div>
                <p className="text-gray-500 mb-1">미리보기 ({sampleName || '홍길동'} 기준)</p>
                <div className="bg-gray-50 border border-gray-200 rounded p-3 whitespace-pre-wrap text-gray-800 text-xs">{preview.preview}</div>
              </div>
            </>
          )}
          <div>
            <span className="text-gray-500">발송 방식:</span>
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

        <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} disabled={sending} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50">취소</button>
          <button
            onClick={onConfirm}
            disabled={sending}
            className="px-4 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? '발송 중...' : `${selectedCount}명에게 발송`}
          </button>
        </div>
      </div>
    </div>
  )
}
