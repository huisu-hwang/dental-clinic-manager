'use client'

import { Users } from 'lucide-react'
import type { BulkSmsEligiblePatient } from '@/types/bulkSms'

interface Props {
  patients: BulkSmsEligiblePatient[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (checked: boolean) => void
  excludedCount: number
  noPhoneCount: number
  loading?: boolean
}

export default function PatientSelectionList({
  patients, selectedIds, onToggle, onToggleAll, excludedCount, noPhoneCount, loading
}: Props) {
  const allChecked = patients.length > 0 && patients.every(p => selectedIds.has(p.dentweb_patient_id))

  return (
    <div className="bg-[var(--at-surface)] border border-[var(--at-border)] rounded-xl">
      <div className="px-4 py-3 border-b border-[var(--at-border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[var(--at-text-secondary)]" />
          <h3 className="font-medium text-[var(--at-text-primary)]">
            발송 대상 {patients.length}명 (선택 {selectedIds.size}명)
          </h3>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-[var(--at-text-secondary)]">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={e => onToggleAll(e.target.checked)}
            className="rounded border-[var(--at-border)]"
          />
          전체 선택
        </label>
      </div>

      {(excludedCount > 0 || noPhoneCount > 0) && (
        <div className="px-4 py-2 bg-[var(--at-surface-alt)] border-b border-[var(--at-border)] text-xs text-[var(--at-text-secondary)]">
          {excludedCount > 0 && <span>리콜 제외 {excludedCount}명 </span>}
          {noPhoneCount > 0 && <span>· 전화번호 없는 환자 {noPhoneCount}명 </span>}
          자동 제외됨
        </div>
      )}

      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-sm text-[var(--at-text-weak)]">조회 중...</div>
        ) : patients.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--at-text-weak)]">조건에 맞는 환자가 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[var(--at-surface-alt)] text-xs text-[var(--at-text-secondary)]">
              <tr>
                <th className="w-10 px-3 py-2"></th>
                <th className="px-3 py-2 text-left">이름</th>
                <th className="px-3 py-2 text-left">전화번호</th>
                <th className="px-3 py-2 text-left">최종 내원</th>
                <th className="px-3 py-2 text-left">진료</th>
              </tr>
            </thead>
            <tbody>
              {patients.map(p => (
                <tr key={p.dentweb_patient_id} className="border-t border-[var(--at-border)] hover:bg-[var(--at-surface-alt)]">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.dentweb_patient_id)}
                      onChange={() => onToggle(p.dentweb_patient_id)}
                      className="rounded border-[var(--at-border)]"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-[var(--at-text-primary)]">{p.patient_name}</td>
                  <td className="px-3 py-2 text-[var(--at-text-primary)] tabular-nums">{p.phone_number}</td>
                  <td className="px-3 py-2 text-[var(--at-text-secondary)]">{p.last_visit_date ?? '-'}</td>
                  <td className="px-3 py-2 text-[var(--at-text-secondary)]">{p.last_treatment_type ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
