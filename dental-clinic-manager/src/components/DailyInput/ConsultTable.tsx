'use client'

import { Plus, X } from 'lucide-react'
import type { ConsultRowData } from '@/types'

interface ConsultTableProps {
  consultRows: ConsultRowData[]
  onConsultRowsChange: (rows: ConsultRowData[]) => void
  isReadOnly: boolean
}

export default function ConsultTable({ consultRows, onConsultRowsChange, isReadOnly }: ConsultTableProps) {
  const addRow = () => {
    const newRow: ConsultRowData = {
      patient_name: '',
      consult_content: '',
      consult_status: 'O',
      remarks: ''
    }
    onConsultRowsChange([...consultRows, newRow])
  }

  const removeRow = (index: number) => {
    const newRows = consultRows.filter((_, i) => i !== index)
    onConsultRowsChange(newRows)
  }

  const updateRow = (index: number, field: keyof ConsultRowData, value: string) => {
    const newRows = [...consultRows]
    newRows[index] = { ...newRows[index], [field]: value }
    onConsultRowsChange(newRows)
  }

  return (
    <div>
      {/* 데스크탑: 테이블 형식 */}
      <div className="hidden sm:block overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">환자명</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">상담내용</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-32">진행여부</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">참고사항</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {consultRows.map((row, index) => (
              <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-2">
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="홍길동"
                    value={row.patient_name}
                    onChange={(e) => updateRow(index, 'patient_name', e.target.value)}
                    readOnly={isReadOnly}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="상담 내용 요약"
                    value={row.consult_content}
                    onChange={(e) => updateRow(index, 'consult_content', e.target.value)}
                    readOnly={isReadOnly}
                  />
                </td>
                <td className="px-4 py-2">
                  <select
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white appearance-none cursor-pointer"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
                    value={row.consult_status}
                    onChange={(e) => updateRow(index, 'consult_status', e.target.value as 'O' | 'X')}
                    disabled={isReadOnly}
                  >
                    <option value="O">O</option>
                    <option value="X">X</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="참고 사항"
                    value={row.remarks}
                    onChange={(e) => updateRow(index, 'remarks', e.target.value)}
                    readOnly={isReadOnly}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => removeRow(index)}
                    disabled={isReadOnly}
                    title="삭제"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일: 카드 형식 */}
      <div className="sm:hidden space-y-3">
        {consultRows.map((row, index) => (
          <div key={index} className="border border-slate-200 rounded-lg p-3 bg-white">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs font-medium text-slate-500">#{index + 1}</span>
              <button
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => removeRow(index)}
                disabled={isReadOnly}
                title="삭제"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">환자명</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="홍길동"
                  value={row.patient_name}
                  onChange={(e) => updateRow(index, 'patient_name', e.target.value)}
                  readOnly={isReadOnly}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">상담내용</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="상담 내용 요약"
                  value={row.consult_content}
                  onChange={(e) => updateRow(index, 'consult_content', e.target.value)}
                  readOnly={isReadOnly}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">진행여부</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white appearance-none cursor-pointer"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
                    value={row.consult_status}
                    onChange={(e) => updateRow(index, 'consult_status', e.target.value as 'O' | 'X')}
                    disabled={isReadOnly}
                  >
                    <option value="O">O</option>
                    <option value="X">X</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">참고사항</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="참고 사항"
                    value={row.remarks}
                    onChange={(e) => updateRow(index, 'remarks', e.target.value)}
                    readOnly={isReadOnly}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={addRow}
        className="mt-3 inline-flex items-center px-3 py-2 sm:py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto justify-center sm:justify-start"
        disabled={isReadOnly}
      >
        <Plus className="w-4 h-4 mr-1" />
        행 추가
      </button>
    </div>
  )
}
