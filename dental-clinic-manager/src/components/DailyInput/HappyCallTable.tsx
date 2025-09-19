'use client'

import { useState } from 'react'
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
    if (happyCallRows.length <= 1) return
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
        <h2 className="text-xl font-bold border-b pb-3">[3] 환자 해피콜 결과</h2>
        <button
          onClick={addRow}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
        >
          행 추가
        </button>
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
                  {happyCallRows.length > 1 && (
                    <button
                      onClick={() => removeRow(index)}
                      className="text-red-500 hover:text-red-700 p-1"
                      title="행 삭제"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd"></path>
                      </svg>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}