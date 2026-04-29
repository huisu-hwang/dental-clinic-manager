'use client'

import { useState, useEffect } from 'react'
import { X, Coins, Plus, Minus, Loader2 } from 'lucide-react'
import { referralService } from '@/lib/referralService'
import type { PointReason } from '@/types/referral'

interface Props {
  clinicId: string
  open: boolean
  onClose: () => void
  patient: { id: string; patient_name: string } | null
  referralId?: string
  defaultDelta?: number
  defaultReason?: PointReason
  defaultNote?: string
  onSaved: () => void
}

export default function PointAdjustModal({ clinicId, open, onClose, patient, referralId, defaultDelta = 0, defaultReason = 'manual_add', defaultNote = '', onSaved }: Props) {
  const [direction, setDirection] = useState<'add' | 'use'>(defaultDelta < 0 ? 'use' : 'add')
  const [amount, setAmount] = useState<number>(Math.abs(defaultDelta) || 0)
  const [reason, setReason] = useState<PointReason>(defaultReason)
  const [note, setNote] = useState<string>(defaultNote)
  const [currentBalance, setCurrentBalance] = useState<number>(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !patient) return
    setDirection(defaultDelta < 0 ? 'use' : 'add')
    setAmount(Math.abs(defaultDelta) || 0)
    setReason(defaultReason)
    setNote(defaultNote)
    setError(null)
    referralService.getBalance(clinicId, patient.id).then(setCurrentBalance).catch(() => setCurrentBalance(0))
  }, [open, patient, clinicId, defaultDelta, defaultReason, defaultNote])

  if (!open || !patient) return null

  const handleSubmit = async () => {
    if (amount <= 0) { setError('금액을 입력해주세요.'); return }
    setSubmitting(true); setError(null)
    try {
      const delta = direction === 'add' ? amount : -amount
      const finalReason: PointReason = direction === 'use' ? 'manual_use' : reason
      await referralService.addPoints({
        clinicId,
        dentwebPatientId: patient.id,
        delta,
        reason: finalReason,
        referralId,
        note: note.trim() || undefined,
      })
      onSaved()
      onClose()
    } catch (e) {
      console.error(e)
      setError('저장에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white shadow-[var(--shadow-at-card)]" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--at-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--at-success-bg)] text-[var(--at-success)]">
              <Coins className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold text-[var(--at-text-primary)]">포인트 조정</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-[var(--at-text-weak)] hover:bg-[var(--at-surface-hover)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-lg bg-[var(--at-surface-alt)] px-3 py-2.5">
            <div className="text-xs text-[var(--at-text-secondary)]">{patient.patient_name}님 현재 잔액</div>
            <div className="mt-0.5 text-xl font-semibold text-[var(--at-accent)]">{currentBalance.toLocaleString()} P</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection('add')}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                direction === 'add'
                  ? 'border-[var(--at-success)] bg-[var(--at-success-bg)] text-[var(--at-success)]'
                  : 'border-[var(--at-border)] bg-white text-[var(--at-text-secondary)] hover:bg-[var(--at-surface-hover)]'
              }`}
            >
              <Plus className="h-4 w-4" /> 적립
            </button>
            <button
              type="button"
              onClick={() => setDirection('use')}
              className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                direction === 'use'
                  ? 'border-[var(--at-error)] bg-[var(--at-error-bg)] text-[var(--at-error)]'
                  : 'border-[var(--at-border)] bg-white text-[var(--at-text-secondary)] hover:bg-[var(--at-surface-hover)]'
              }`}
            >
              <Minus className="h-4 w-4" /> 사용
            </button>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--at-text-primary)]">금액 (P)</label>
            <input
              type="number"
              min={0}
              step={100}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--at-border)] px-3 py-2 text-sm focus:border-[var(--at-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--at-accent)]"
            />
          </div>

          {direction === 'add' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--at-text-primary)]">적립 사유</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as PointReason)}
                className="w-full rounded-lg border border-[var(--at-border)] px-3 py-2 text-sm focus:border-[var(--at-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--at-accent)]"
              >
                <option value="referral_reward">소개 감사</option>
                <option value="referral_welcome">신환 환영</option>
                <option value="manual_add">수동 적립</option>
              </select>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--at-text-primary)]">메모 (선택)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 김OO님 소개 감사"
              className="w-full rounded-lg border border-[var(--at-border)] px-3 py-2 text-sm focus:border-[var(--at-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--at-accent)]"
            />
          </div>

          {error && <div className="rounded-lg bg-[var(--at-error-bg)] px-3 py-2 text-sm text-[var(--at-error)]">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--at-border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-[var(--at-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--at-text-primary)] hover:bg-[var(--at-surface-hover)] disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || amount <= 0}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              direction === 'add' ? 'bg-[var(--at-success)] hover:opacity-90' : 'bg-[var(--at-error)] hover:opacity-90'
            }`}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            저장
          </button>
        </div>
      </div>
    </div>
  )
}
