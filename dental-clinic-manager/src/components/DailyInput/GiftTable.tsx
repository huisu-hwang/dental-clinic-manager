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
  // 선택된 선물들의 총 수량 계산
  const getUsedQuantity = (giftName: string) => {
    return giftRows.reduce((total, row) => {
      if (row.gift_type === giftName) {
        return total + (row.quantity || 1)
      }
      return total
    }, 0)
  }

  // 사용 가능한 재고 계산 (원래 재고 - 선택된 수량)
  const getAvailableInventory = (giftType: string, currentRowIndex?: number) => {
    if (!giftType || giftType === '없음') return 0

    const gift = giftInventory.find(item => item.name === giftType)
    if (!gift) return 0

    // 현재 행을 제외한 다른 행들에서 사용된 수량 계산
    const usedQuantity = giftRows.reduce((total, row, index) => {
      // 현재 수정 중인 행은 제외
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

    // 선물 종류가 변경되면 사용 가능한 재고 확인
    if (field === 'gift_type' && value !== '없음') {
      const availableStock = getAvailableInventory(value as string, index)
      if (availableStock < newRows[index].quantity) {
        newRows[index].quantity = Math.max(1, availableStock)
      }
    }

    // 수량이 변경되면 재고 한도 확인
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
                    readOnly={isReadOnly}
                  />
                </td>
                <td className="p-2">
                  <div className="space-y-1">
                    <select
                      className="w-full p-2 border rounded-md"
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
                            {item.name} ({availableQty}개 남음)
                          </option>
                        )
                      })}
                    </select>
                  </div>
                </td>
                <td className="p-2">
                  <select
                    className="w-full p-2 border rounded-md"
                    value={row.quantity}
                    onChange={(e) => updateRow(index, 'quantity', parseInt(e.target.value))}
                    disabled={row.gift_type === '없음' || isReadOnly}
                  >
                    {(() => {
                      const maxQuantity = row.gift_type === '없음'
                        ? 10
                        : Math.min(getAvailableInventory(row.gift_type, index) + (row.quantity || 1), 10)
                      return Array.from({ length: Math.max(1, maxQuantity) }, (_, i) => i + 1).map(num => (
                        <option key={num} value={num}>{num}개</option>
                      ))
                    })()}
                  </select>
                </td>
                <td className="p-2">
                  <select
                    className="w-full p-2 border rounded-md"
                    value={row.naver_review}
                    onChange={(e) => updateRow(index, 'naver_review', e.target.value as 'O' | 'X')}
                    disabled={isReadOnly}
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
                    readOnly={isReadOnly}
                  />
                </td>
                <td className="p-2 text-center">
                  <button
                    className="text-red-500 hover:text-red-700 p-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => removeRow(index)}
                    disabled={isReadOnly}
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
        className="mt-4 text-blue-600 font-semibold text-sm py-2 px-4 rounded-md hover:bg-blue-50 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isReadOnly}
      >
        <Plus className="w-4 h-4" />
        <span>선물/리뷰 기록 추가</span>
      </button>
    </div>
  )
}