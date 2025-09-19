'use client'

import { Plus, X } from 'lucide-react'
import type { ConsultRowData } from '@/types'

interface ConsultTableProps {
  consultRows: ConsultRowData[]
  onConsultRowsChange: (rows: ConsultRowData[]) => void
}

export default function ConsultTable({ consultRows, onConsultRowsChange }: ConsultTableProps) {
  const addRow = () => {
    const newRow: ConsultRowData = {
      patient_name: '',
      consult_content: '',
      consult_status: 'O',
      hold_reason: ''
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
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
      <h2 className="text-xl font-bold mb-4 border-b pb-3">[1] 치과 환자 상담 결과</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-100 text-slate-600 uppercase">
            <tr>
              <th className="p-3">환자명</th>
              <th className="p-3">상담내용</th>
              <th className="p-3">진행여부</th>
              <th className="p-3">보류사유</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {consultRows.map((row, index) => (
              <tr key={index} className="border-b">
                <td className="p-2">
                  <input
                    type="text"
                    className="w-full p-2 border rounded-md"
                    placeholder="홍길동"
                    value={row.patient_name}
                    onChange={(e) => updateRow(index, 'patient_name', e.target.value)}
                  />
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    className="w-full p-2 border rounded-md"
                    placeholder="상담 내용 요약"
                    value={row.consult_content}
                    onChange={(e) => updateRow(index, 'consult_content', e.target.value)}
                  />
                </td>
                <td className="p-2">
                  <select
                    className="w-full p-2 border rounded-md"
                    value={row.consult_status}
                    onChange={(e) => updateRow(index, 'consult_status', e.target.value as 'O' | 'X')}
                  >
                    <option value="O">O</option>
                    <option value="X">X</option>
                  </select>
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    className="w-full p-2 border rounded-md"
                    placeholder="보류 사유 (선택)"
                    value={row.hold_reason}
                    onChange={(e) => updateRow(index, 'hold_reason', e.target.value)}
                  />
                </td>
                <td className="p-2 text-center">
                  <button
                    className="text-red-500 hover:text-red-700 p-1"
                    onClick={() => removeRow(index)}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={addRow}
        className="mt-4 text-blue-600 font-semibold text-sm py-2 px-4 rounded-md hover:bg-blue-50 flex items-center space-x-2"
      >
        <Plus className="w-4 h-4" />
        <span>상담 기록 추가</span>
      </button>
    </div>
  )
}