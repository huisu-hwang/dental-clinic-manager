'use client'

import { useState } from 'react'
import { Sparkles, X, Loader2 } from 'lucide-react'
import MessageByteCounter from '@/components/BulkSms/shared/MessageByteCounter'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (content: string) => void
}

const EXAMPLES = [
  '5월 가정의달 맞이 가족 검진 안내',
  '여름 휴가철 임시 휴진 안내 (8/1~8/4)',
  '3개월 이상 미내원 환자에게 정기 검진 권유',
  '신규 임플란트 상담 무료 캠페인',
  '잇몸의 날 기념 스케일링 할인 행사',
]

export default function AiGenerateModal({ open, onClose, onSelect }: Props) {
  const [situation, setSituation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<string[]>([])

  if (!open) return null

  const reset = () => {
    setSituation('')
    setLoading(false)
    setError(null)
    setCandidates([])
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const generate = async () => {
    if (!situation.trim()) {
      setError('상황을 입력해주세요')
      return
    }
    setLoading(true)
    setError(null)
    setCandidates([])
    try {
      const res = await fetch('/api/bulk-sms/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ situation }),
      })
      const d = await res.json()
      if (!d.success) {
        setError(d.error || '생성에 실패했습니다')
      } else {
        setCandidates(d.candidates || [])
      }
    } catch {
      setError('네트워크 오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (content: string) => {
    onSelect(content)
    handleClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={handleClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--at-border)]">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--at-accent-tag)] text-[var(--at-accent)]">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-semibold text-[var(--at-text-primary)]">AI로 메시지 작성</h3>
              <p className="text-xs text-[var(--at-text-secondary)]">상황을 적어주시면 후보 3개를 만들어드립니다</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded hover:bg-[var(--at-surface-alt)]"
            aria-label="닫기"
          >
            <X className="w-4 h-4 text-[var(--at-text-secondary)]" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--at-text-primary)] mb-1.5">
              어떤 상황의 문자인가요?
            </label>
            <textarea
              value={situation}
              onChange={e => setSituation(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="예: 8월 1일~4일 여름 휴가로 휴진합니다. 응급 진료가 필요한 환자에게 미리 안내가 필요합니다."
              className="w-full px-3 py-2 border border-[var(--at-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--at-accent)]"
              disabled={loading}
            />
            <div className="mt-1 flex justify-between items-center">
              <span className="text-xs text-[var(--at-text-weak)]">{situation.length} / 500</span>
            </div>
          </div>

          {/* 예시 칩 */}
          <div>
            <div className="text-xs text-[var(--at-text-secondary)] mb-1.5">예시 — 클릭하면 자동 입력됩니다</div>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map(ex => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setSituation(ex)}
                  disabled={loading}
                  className="text-xs px-2.5 py-1 rounded-full border border-[var(--at-border)] text-[var(--at-text-primary)] hover:bg-[var(--at-surface-alt)] disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          {/* 생성 버튼 */}
          <button
            type="button"
            onClick={generate}
            disabled={loading || !situation.trim()}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[var(--at-accent)] text-white font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                생성 중...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                후보 3개 생성하기
              </>
            )}
          </button>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-[var(--at-error-bg)] border border-red-200 text-sm text-[var(--at-error)]">
              {error}
            </div>
          )}

          {/* 후보 목록 */}
          {candidates.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-[var(--at-text-primary)]">
                생성된 후보 {candidates.length}개
              </div>
              {candidates.map((c, i) => (
                <div
                  key={i}
                  className="border border-[var(--at-border)] rounded-lg p-3 hover:border-[var(--at-accent)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-[var(--at-text-secondary)] mb-1.5">
                        후보 {i + 1}
                      </div>
                      <p className="text-sm text-[var(--at-text-primary)] whitespace-pre-wrap break-words">
                        {c}
                      </p>
                      <div className="mt-2 flex justify-end">
                        <MessageByteCounter text={c} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelect(c)}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--at-accent)] text-white text-sm font-medium hover:opacity-90"
                    >
                      이 메시지 사용
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={generate}
                disabled={loading}
                className="w-full text-sm py-2 rounded-lg border border-[var(--at-border)] text-[var(--at-text-secondary)] hover:bg-[var(--at-surface-alt)] disabled:opacity-50"
              >
                다시 생성하기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
