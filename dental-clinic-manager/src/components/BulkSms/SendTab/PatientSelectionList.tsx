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
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-500" />
          <h3 className="font-medium text-gray-900">
            발송 대상 {patients.length}명 (선택 {selectedIds.size}명)
          </h3>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={e => onToggleAll(e.target.checked)}
            className="rounded border-gray-300"
          />
          전체 선택
        </label>
      </div>

      {(excludedCount > 0 || noPhoneCount > 0) && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-600">
          {excludedCount > 0 && <span>리콜 제외 {excludedCount}명 </span>}
          {noPhoneCount > 0 && <span>· 전화번호 없는 환자 {noPhoneCount}명 </span>}
          자동 제외됨
        </div>
      )}

      <div className="max-h-[400px] overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">조회 중...</div>
        ) : patients.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">조건에 맞는 환자가 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
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
                <tr key={p.dentweb_patient_id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.dentweb_patient_id)}
                      onChange={() => onToggle(p.dentweb_patient_id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-900">{p.patient_name}</td>
                  <td className="px-3 py-2 text-gray-700 tabular-nums">{p.phone_number}</td>
                  <td className="px-3 py-2 text-gray-500">{p.last_visit_date ?? '-'}</td>
                  <td className="px-3 py-2 text-gray-500">{p.last_treatment_type ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
