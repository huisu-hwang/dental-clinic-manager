'use client'

import { useState } from 'react'
import { X, Heart, Send, Coins, Gift, Loader2 } from 'lucide-react'
import { referralService } from '@/lib/referralService'
import type { PatientSearchResult } from '@/types/referral'
import PatientSearchInput from './PatientSearchInput'

interface Props {
  clinicId: string
  open: boolean
  onClose: () => void
  onCreated: (createdId: string, referrer: PatientSearchResult, referee: PatientSearchResult) => void
  defaultReferrer?: PatientSearchResult | null
  defaultReferee?: PatientSearchResult | null
}

export default function ReferralAddModal({ clinicId, open, onClose, onCreated, defaultReferrer = null, defaultReferee = null }: Props) {
  const [referrer, setReferrer] = useState<PatientSearchResult | null>(defaultReferrer)
  const [referee, setReferee] = useState<PatientSearchResult | null>(defaultReferee)
  const [referredAt, setReferredAt] = useState<string>(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const reset = () => {
    setReferrer(null); setReferee(null); setNote('')
    setReferredAt(new Date().toISOString().slice(0, 10)); setError(null)
  }

  const handleClose = () => {
    if (submitting) return
    reset()
    onClose()
  }

  const handleSubmit = async () => {
    setError(null)
    if (!referrer || !referee) {
      setError('소개해주신 분과 신환을 모두 선택해주세요.')
      return
    }
    if (referrer.id === referee.id) {
      setError('소개자와 신환은 같을 수 없습니다.')
      return
    }
    setSubmitting(true)
    try {
      const created = await referralService.create({
        clinicId,
        referrerId: referrer.id,
        refereeId: referee.id,
        referredAt,
        note: note.trim() || undefined,
      })
      onCreated(created.id, referrer, referee)
      reset()
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? ''
      if (msg.includes('duplicate') || msg.includes('unique')) {
        setError('이미 이 신환에 대해 소개자가 등록되어 있습니다.')
      } else {
        setError('등록에 실패했습니다. 잠시 후 다시 시도해주세요.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={handleClose}>
      <div className="w-full max-w-xl rounded-xl bg-white shadow-[var(--shadow-at-card)]" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--at-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--at-accent-tag)] text-[var(--at-accent)]">
              <Heart className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold text-[var(--at-text-primary)]">소개 등록</h2>
          </div>
          <button onClick={handleClose} className="rounded-md p-1 text-[var(--at-text-weak)] hover:bg-[var(--at-surface-hover)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--at-text-primary)]">
              소개해주신 분 <span className="text-[var(--at-error)]">*</span>
            </label>
            <PatientSearchInput
              clinicId={clinicId}
              selected={referrer}
              onSelect={setReferrer}
              placeholder="기존 환자에서 검색"
              excludeId={referee?.id}
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--at-text-primary)]">
              소개받은 신환 <span className="text-[var(--at-error)]">*</span>
            </label>
            <PatientSearchInput
              clinicId={clinicId}
              selected={referee}
              onSelect={setReferee}
              placeholder="신환을 선택하세요"
              excludeId={referrer?.id}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--at-text-primary)]">소개 일자</label>
              <input
                type="date"
                value={referredAt}
                onChange={(e) => setReferredAt(e.target.value)}
                className="w-full rounded-lg border border-[var(--at-border)] px-3 py-2 text-sm focus:border-[var(--at-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--at-accent)]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--at-text-primary)]">메모 (선택)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="예: 임플란트 상담 권유"
                className="w-full rounded-lg border border-[var(--at-border)] px-3 py-2 text-sm focus:border-[var(--at-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--at-accent)]"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-[var(--at-error-bg)] px-3 py-2 text-sm text-[var(--at-error)]">{error}</div>
          )}

          <div className="rounded-lg bg-[var(--at-surface-alt)] px-3 py-3">
            <p className="mb-2 text-xs font-medium text-[var(--at-text-secondary)]">등록 후 바로 할 수 있는 작업</p>
            <div className="flex flex-wrap gap-2 text-xs text-[var(--at-text-secondary)]">
              <span className="flex items-center gap-1"><Send className="h-3.5 w-3.5" /> 감사 문자 발송</span>
              <span className="flex items-center gap-1"><Coins className="h-3.5 w-3.5" /> 포인트 적립</span>
              <span className="flex items-center gap-1"><Gift className="h-3.5 w-3.5" /> 선물 지급 기록</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--at-border)] px-5 py-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="rounded-lg border border-[var(--at-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--at-text-primary)] hover:bg-[var(--at-surface-hover)] disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !referrer || !referee}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--at-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--at-accent-hover)] disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            등록하기
          </button>
        </div>
      </div>
    </div>
  )
}
