'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, AlertCircle, Loader2, Trash2, CheckCircle2 } from 'lucide-react'
import { referralService } from '@/lib/referralService'
import type { FamilyCandidate, ConfirmedFamily } from '@/types/referral'
import FamilyConfirmModal from './FamilyConfirmModal'

interface Props {
  clinicId: string
  refreshKey: number
}

export default function FamilyTab({ clinicId, refreshKey }: Props) {
  const [candidates, setCandidates] = useState<FamilyCandidate[]>([])
  const [confirmed, setConfirmed] = useState<ConfirmedFamily[]>([])
  const [loading, setLoading] = useState(false)
  const [target, setTarget] = useState<FamilyCandidate | null>(null)
  const [internalKey, setInternalKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, f] = await Promise.all([
        referralService.suggestFamilies(clinicId, 30),
        referralService.listConfirmedFamilies(clinicId),
      ])
      setCandidates(c); setConfirmed(f)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [clinicId])

  useEffect(() => { load() }, [load, refreshKey, internalKey])

  const handleDelete = async (familyId: string) => {
    if (!window.confirm('이 가족 묶음을 해제하시겠습니까?')) return
    try {
      await referralService.deleteFamily(familyId)
      setInternalKey(k => k + 1)
    } catch (e) {
      console.error(e)
      alert('삭제에 실패했습니다.')
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-[var(--at-border)] bg-white p-5 shadow-[var(--shadow-at-soft)]">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--at-warning-bg)] text-[var(--at-warning)]">
            <AlertCircle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[var(--at-text-primary)]">추정 가족</h2>
            <p className="text-xs text-[var(--at-text-secondary)]">동일 전화번호를 공유하는 환자들을 가족 후보로 자동 추정합니다. 확인 후 확정하세요.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center text-[var(--at-text-weak)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : candidates.length === 0 ? (
          <div className="rounded-lg bg-[var(--at-surface-alt)] p-8 text-center text-sm text-[var(--at-text-weak)]">
            추정할 가족 후보가 없습니다.
          </div>
        ) : (
          <ul className="space-y-2">
            {candidates.map(c => (
              <li key={c.group_key} className="rounded-lg border border-[var(--at-border)] p-3 hover:border-[var(--at-warning)]">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[var(--at-warning-bg)] px-2 py-0.5 text-xs font-medium text-[var(--at-warning)]">
                      추정
                    </span>
                    <span className="text-sm text-[var(--at-text-secondary)]">{c.group_key}</span>
                    <span className="text-xs text-[var(--at-text-weak)]">· {c.member_count}명</span>
                  </div>
                  <button
                    onClick={() => setTarget(c)}
                    className="rounded-md bg-[var(--at-purple)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                  >
                    가족으로 확정
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {c.members.map(m => (
                    <span key={m.id} className="rounded-md bg-[var(--at-surface-alt)] px-2 py-1 text-[var(--at-text-primary)]">
                      {m.patient_name}
                      {m.birth_date && <span className="ml-1 text-[var(--at-text-weak)]">{m.birth_date.slice(0, 7)}</span>}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-[var(--at-border)] bg-white p-5 shadow-[var(--shadow-at-soft)]">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f3eaff] text-[var(--at-purple)]">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[var(--at-text-primary)]">확정된 가족</h2>
            <p className="text-xs text-[var(--at-text-secondary)]">현재 {confirmed.length}개 가족이 등록되어 있습니다.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center text-[var(--at-text-weak)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : confirmed.length === 0 ? (
          <div className="rounded-lg bg-[var(--at-surface-alt)] p-8 text-center text-sm text-[var(--at-text-weak)]">
            아직 확정된 가족이 없습니다.
          </div>
        ) : (
          <ul className="space-y-2">
            {confirmed.map(f => (
              <li key={f.id} className="rounded-lg border border-[var(--at-border)] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[var(--at-purple)]" />
                    <span className="font-medium text-[var(--at-text-primary)]">{f.family_name}</span>
                    <span className="text-xs text-[var(--at-text-weak)]">{f.members.length}명</span>
                  </div>
                  <button
                    onClick={() => handleDelete(f.id)}
                    title="해제"
                    className="rounded-md p-1 text-[var(--at-text-weak)] hover:bg-[var(--at-error-bg)] hover:text-[var(--at-error)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {f.members.map(m => (
                    <span key={m.id} className="rounded-md bg-[#f3eaff] px-2 py-1 text-[var(--at-purple)]">
                      {m.patient_name}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <FamilyConfirmModal
        clinicId={clinicId}
        candidate={target}
        open={!!target}
        onClose={() => setTarget(null)}
        onConfirmed={() => setInternalKey(k => k + 1)}
      />
    </div>
  )
}
