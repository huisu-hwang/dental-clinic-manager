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
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">환자명</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">상담내용</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-24">진행여부</th>
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
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={row.consult_status}
                    onChange={(e) => updateRow(index, 'consult_status', e.target.value as 'O' | 'X')}
                    disabled={isReadOnly}
                  >
                    <option value="O">O (진행)</option>
                    <option value="X">X (보류)</option>
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
      <button
        onClick={addRow}
        className="mt-3 inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isReadOnly}
      >
        <Plus className="w-4 h-4 mr-1" />
        행 추가
      </button>
    </div>
  )
}
