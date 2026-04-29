'use client'

import { useState, useEffect } from 'react'
import { X, Users, Loader2 } from 'lucide-react'
import { referralService } from '@/lib/referralService'
import type { FamilyCandidate } from '@/types/referral'

interface Props {
  clinicId: string
  candidate: FamilyCandidate | null
  open: boolean
  onClose: () => void
  onConfirmed: () => void
}

export default function FamilyConfirmModal({ clinicId, candidate, open, onClose, onConfirmed }: Props) {
  const [familyName, setFamilyName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!candidate) return
    const last = candidate.members[0]?.patient_name?.[0] ?? ''
    setFamilyName(last ? `${last}OO 가족` : '가족')
    setSelected(new Set(candidate.members.map(m => m.id)))
    setError(null)
  }, [candidate])

  if (!open || !candidate) return null

  const toggle = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const handleSubmit = async () => {
    if (selected.size < 2) { setError('가족 구성원은 최소 2명 이상이어야 합니다.'); return }
    if (!familyName.trim()) { setError('가족 이름을 입력해주세요.'); return }
    setSubmitting(true); setError(null)
    try {
      await referralService.confirmFamily({
        clinicId,
        familyName: familyName.trim(),
        memberIds: Array.from(selected),
      })
      onConfirmed()
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
      <div className="w-full max-w-lg rounded-xl bg-white shadow-[var(--shadow-at-card)]" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--at-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3eaff] text-[var(--at-purple)]">
              <Users className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold text-[var(--at-text-primary)]">가족 확정</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-[var(--at-text-weak)] hover:bg-[var(--at-surface-hover)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--at-text-primary)]">가족 이름</label>
            <input
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              className="w-full rounded-lg border border-[var(--at-border)] px-3 py-2 text-sm focus:border-[var(--at-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--at-accent)]"
            />
          </div>

          <div>
            <p className="mb-2 text-xs text-[var(--at-text-secondary)]">
              동일 전화번호({candidate.group_key})를 공유하는 환자들입니다. 가족이 아닌 분은 체크 해제하세요.
            </p>
            <div className="divide-y divide-[var(--at-border)] rounded-lg border border-[var(--at-border)]">
              {candidate.members.map(m => (
                <label key={m.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-[var(--at-surface-hover)]">
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onChange={() => toggle(m.id)}
                    className="h-4 w-4 rounded border-[var(--at-border)] text-[var(--at-accent)] focus:ring-[var(--at-accent)]"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--at-text-primary)]">
                      {m.patient_name}
                      {m.gender && <span className="text-xs text-[var(--at-text-weak)]">({m.gender === 'M' ? '남' : m.gender === 'F' ? '여' : m.gender})</span>}
                    </div>
                    <div className="text-xs text-[var(--at-text-secondary)]">
                      {m.chart_number ?? '차트 없음'} · {m.birth_date ?? '생년월일 없음'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
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
            disabled={submitting || selected.size < 2}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--at-purple)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            확정 ({selected.size}명)
          </button>
        </div>
      </div>
    </div>
  )
}
