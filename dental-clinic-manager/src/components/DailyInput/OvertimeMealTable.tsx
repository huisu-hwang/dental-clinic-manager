'use client'

import { useState, useEffect, useCallback } from 'react'
import type { OvertimeMealRowData } from '@/types'
import { overtimeMealService } from '@/lib/overtimeMealService'

interface OvertimeMealTableProps {
  clinicId: string
  date: string
  isReadOnly: boolean
  rows: OvertimeMealRowData[]
  onRowsChange: (rows: OvertimeMealRowData[]) => void
}

export default function OvertimeMealTable({ clinicId, date, isReadOnly, rows, onRowsChange }: OvertimeMealTableProps) {

  const handleCheckboxChange = (index: number, field: 'has_lunch_overtime' | 'has_dinner_overtime' | 'has_extra_overtime') => {
    if (isReadOnly) return
    const newRows = [...rows]
    newRows[index] = { ...newRows[index], [field]: !newRows[index][field] }
    onRowsChange(newRows)
  }

  const handleNotesChange = (index: number, value: string) => {
    if (isReadOnly) return
    const newRows = [...rows]
    newRows[index] = { ...newRows[index], notes: value }
    onRowsChange(newRows)
  }

  // 요약 통계
  const lunchCount = rows.filter(r => r.has_lunch_overtime).length
  const dinnerCount = rows.filter(r => r.has_dinner_overtime).length
  const extraCount = rows.filter(r => r.has_extra_overtime).length

  if (rows.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-slate-400">
        직원 정보를 불러오는 중...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-orange-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-orange-600">{lunchCount}</div>
          <div className="text-xs text-slate-500 mt-0.5">점심 OT</div>
        </div>
        <div className="bg-violet-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-violet-600">{dinnerCount}</div>
          <div className="text-xs text-slate-500 mt-0.5">저녁 OT</div>
        </div>
        <div className="bg-rose-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-rose-600">{extraCount}</div>
          <div className="text-xs text-slate-500 mt-0.5">오버타임</div>
        </div>
      </div>

      {/* 직원별 체크 테이블 */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">직원명</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-orange-600 w-16">점심</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-violet-600 w-16">저녁</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-rose-600 w-16">OT</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">비고</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, idx) => (
              <tr key={row.user_id} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">
                  {row.user_name}
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={row.has_lunch_overtime}
                    onChange={() => handleCheckboxChange(idx, 'has_lunch_overtime')}
                    disabled={isReadOnly}
                    className="w-4 h-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 cursor-pointer disabled:cursor-default"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={row.has_dinner_overtime}
                    onChange={() => handleCheckboxChange(idx, 'has_dinner_overtime')}
                    disabled={isReadOnly}
                    className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer disabled:cursor-default"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={row.has_extra_overtime}
                    onChange={() => handleCheckboxChange(idx, 'has_extra_overtime')}
                    disabled={isReadOnly}
                    className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer disabled:cursor-default"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={row.notes}
                    onChange={(e) => handleNotesChange(idx, e.target.value)}
                    readOnly={isReadOnly}
                    placeholder="비고"
                    className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
