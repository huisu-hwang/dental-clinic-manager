'use client'

import { Plus, X } from 'lucide-react'
import type { GiftRowData, GiftInventory } from '@/types'

interface GiftTableProps {
  giftRows: GiftRowData[]
  onGiftRowsChange: (rows: GiftRowData[]) => void
  giftInventory: GiftInventory[]
}

export default function GiftTable({ giftRows, onGiftRowsChange, giftInventory }: GiftTableProps) {
  const addRow = () => {
    const newRow: GiftRowData = {
      patient_name: '',
      gift_type: '없음',
      quantity: 1,
      naver_review: 'X',
      notes: ''
    }
    onGiftRowsChange([...giftRows, newRow])
  }

  const removeRow = (index: number) => {
    const newRows = giftRows.filter((_, i) => i !== index)
    onGiftRowsChange(newRows)
  }

  const updateRow = (index: number, field: keyof GiftRowData, value: string | number) => {
    const newRows = [...giftRows]
    newRows[index] = { ...newRows[index], [field]: value }
    onGiftRowsChange(newRows)
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
      <h2 className="text-xl font-bold mb-4 border-b pb-3">[3] 환자 선물 및 리뷰 관리</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-100 text-slate-600 uppercase">
            <tr>
              <th className="p-3">환자명</th>
              <th className="p-3">선물 종류</th>
              <th className="p-3">수량</th>
              <th className="p-3">네이버 리뷰 여부</th>
              <th className="p-3">비고</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {giftRows.map((row, index) => (
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
                  <select
                    className="w-full p-2 border rounded-md"
                    value={row.gift_type}
                    onChange={(e) => updateRow(index, 'gift_type', e.target.value)}
                  >
                    <option value="없음">없음</option>
                    {giftInventory.map(item => (
                      <option key={item.id} value={item.name}>
                        {item.name} ({item.stock}개 남음)
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  <select
                    className="w-full p-2 border rounded-md"
                    value={row.quantity}
                    onChange={(e) => updateRow(index, 'quantity', parseInt(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                      <option key={num} value={num}>{num}개</option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  <select
                    className="w-full p-2 border rounded-md"
                    value={row.naver_review}
                    onChange={(e) => updateRow(index, 'naver_review', e.target.value as 'O' | 'X')}
                  >
                    <option value="X">X</option>
                    <option value="O">O</option>
                  </select>
                </td>
                <td className="p-2">
                  <input
                    type="text"
                    className="w-full p-2 border rounded-md"
                    placeholder="비고 (선택)"
                    value={row.notes}
                    onChange={(e) => updateRow(index, 'notes', e.target.value)}
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
        <span>선물/리뷰 기록 추가</span>
      </button>
    </div>
  )
}