'use client'

import { Plus, X } from 'lucide-react'
import type { HappyCallRowData } from '@/types'

interface HappyCallTableProps {
  happyCallRows: HappyCallRowData[]
  onHappyCallRowsChange: (rows: HappyCallRowData[]) => void
  isReadOnly: boolean
}

export default function HappyCallTable({ happyCallRows, onHappyCallRowsChange, isReadOnly }: HappyCallTableProps) {
  const addRow = () => {
    const newRows = [...happyCallRows, { patient_name: '', treatment: '', notes: '' }]
    onHappyCallRowsChange(newRows)
  }

  const removeRow = (index: number) => {
    const newRows = happyCallRows.filter((_, i) => i !== index)
    onHappyCallRowsChange(newRows)
  }

  const updateRow = (index: number, field: keyof HappyCallRowData, value: string) => {
    const newRows = happyCallRows.map((row, i) =>
      i === index ? { ...row, [field]: value } : row
    )
    onHappyCallRowsChange(newRows)
  }

  return (
    <div>
      {/* 데스크탑: 테이블 형식 */}
      <div className="hidden sm:block overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">환자명</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">진료 내용</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">특이사항</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {happyCallRows.map((row, index) => (
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
                    placeholder="진료 내용"
                    value={row.treatment}
                    onChange={(e) => updateRow(index, 'treatment', e.target.value)}
                    readOnly={isReadOnly}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="특이사항"
                    value={row.notes}
                    onChange={(e) => updateRow(index, 'notes', e.target.value)}
                    readOnly={isReadOnly}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => removeRow(index)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="삭제"
                    disabled={isReadOnly}
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
        {happyCallRows.map((row, index) => (
          <div key={index} className="border border-slate-200 rounded-lg p-3 bg-white">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs font-medium text-slate-500">#{index + 1}</span>
              <button
                onClick={() => removeRow(index)}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="삭제"
                disabled={isReadOnly}
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
                <label className="block text-xs font-medium text-slate-600 mb-1">진료 내용</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="진료 내용"
                  value={row.treatment}
                  onChange={(e) => updateRow(index, 'treatment', e.target.value)}
                  readOnly={isReadOnly}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">특이사항</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="특이사항"
                  value={row.notes}
                  onChange={(e) => updateRow(index, 'notes', e.target.value)}
                  readOnly={isReadOnly}
                />
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
