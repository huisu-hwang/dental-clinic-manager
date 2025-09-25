'use client'

import React from 'react'
import { Plus, X } from 'lucide-react'
import type { HappyCallRowData } from '@/types'

interface HappyCallTableProps {
  happyCallRows: HappyCallRowData[]
  onHappyCallRowsChange: (rows: HappyCallRowData[]) => void
}

export default function HappyCallTable({ happyCallRows, onHappyCallRowsChange }: HappyCallTableProps) {
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
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">[4] 환자 해피콜 결과</h2>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-slate-100 text-slate-600 uppercase">
            <tr>
              <th className="p-3 border border-slate-300">환자명</th>
              <th className="p-3 border border-slate-300">진료</th>
              <th className="p-3 border border-slate-300">특이사항</th>
              <th className="p-3 border border-slate-300 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {happyCallRows.map((row, index) => (
              <tr key={index} className="bg-white border-b hover:bg-slate-50">
                <td className="p-2 border border-slate-300">
                  <input
                    type="text"
                    className="w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="홍길동"
                    value={row.patient_name}
                    onChange={(e) => updateRow(index, 'patient_name', e.target.value)}
                  />
                </td>
                <td className="p-2 border border-slate-300">
                  <input
                    type="text"
                    className="w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="진료 내용"
                    value={row.treatment}
                    onChange={(e) => updateRow(index, 'treatment', e.target.value)}
                  />
                </td>
                <td className="p-2 border border-slate-300">
                  <input
                    type="text"
                    className="w-full p-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="특이사항 (선택)"
                    value={row.notes}
                    onChange={(e) => updateRow(index, 'notes', e.target.value)}
                  />
                </td>
                <td className="p-2 border border-slate-300 text-center">
                  <button
                    onClick={() => removeRow(index)}
                    className="text-red-500 hover:text-red-700 p-1"
                    title="행 삭제"
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
        <span>해피콜 기록 추가</span>
      </button>
    </div>
  )
}