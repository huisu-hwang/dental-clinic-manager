'use client'

import { Plus, X } from 'lucide-react'
import type { GiftRowData, GiftInventory } from '@/types'

interface GiftTableProps {
  giftRows: GiftRowData[]
  onGiftRowsChange: (rows: GiftRowData[]) => void
  giftInventory: GiftInventory[]
  isReadOnly: boolean
}

export default function GiftTable({ giftRows, onGiftRowsChange, giftInventory, isReadOnly }: GiftTableProps) {
  const getAvailableInventory = (giftType: string, currentRowIndex?: number) => {
    if (!giftType || giftType === '없음') return 0

    const gift = giftInventory.find(item => item.name === giftType)
    if (!gift) return 0

    const usedQuantity = giftRows.reduce((total, row, index) => {
      if (currentRowIndex !== undefined && index === currentRowIndex) {
        return total
      }
      if (row.gift_type === giftType) {
        return total + (row.quantity || 1)
      }
      return total
    }, 0)

    return Math.max(0, gift.stock - usedQuantity)
  }

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

    if (field === 'gift_type' && value !== '없음') {
      const availableStock = getAvailableInventory(value as string, index)
      if (availableStock < newRows[index].quantity) {
        newRows[index].quantity = Math.max(1, availableStock)
      }
    }

    if (field === 'quantity') {
      const availableStock = getAvailableInventory(newRows[index].gift_type, index)
      if ((value as number) > availableStock) {
        newRows[index].quantity = availableStock
        alert(`재고가 부족합니다. 사용 가능한 수량: ${availableStock}개`)
        return
      }
    }

    onGiftRowsChange(newRows)
  }

  return (
    <div>
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">환자명</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">선물 종류</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-20">수량</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-28">네이버 리뷰</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">비고</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {giftRows.map((row, index) => (
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
                  <select
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={row.gift_type}
                    onChange={(e) => updateRow(index, 'gift_type', e.target.value)}
                    disabled={isReadOnly}
                  >
                    <option value="없음">없음</option>
                    {giftInventory.map(item => {
                      const availableQty = getAvailableInventory(item.name, index)
                      return (
                        <option
                          key={item.id}
                          value={item.name}
                          disabled={availableQty <= 0}
                        >
                          {item.name} ({availableQty}개)
                        </option>
                      )
                    })}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={row.quantity}
                    onChange={(e) => updateRow(index, 'quantity', parseInt(e.target.value))}
                    disabled={row.gift_type === '없음' || isReadOnly}
                  >
                    {(() => {
                      const maxQuantity = row.gift_type === '없음'
                        ? 10
                        : Math.min(getAvailableInventory(row.gift_type, index) + (row.quantity || 1), 10)
                      return Array.from({ length: Math.max(1, maxQuantity) }, (_, i) => i + 1).map(num => (
                        <option key={num} value={num}>{num}</option>
                      ))
                    })()}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <select
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={row.naver_review}
                    onChange={(e) => updateRow(index, 'naver_review', e.target.value as 'O' | 'X')}
                    disabled={isReadOnly}
                  >
                    <option value="X">X (미작성)</option>
                    <option value="O">O (작성)</option>
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="비고"
                    value={row.notes}
                    onChange={(e) => updateRow(index, 'notes', e.target.value)}
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
