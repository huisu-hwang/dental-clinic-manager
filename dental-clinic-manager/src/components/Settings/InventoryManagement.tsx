'use client'

import { useState } from 'react'
import type { GiftInventory } from '@/types'

interface InventoryManagementProps {
  giftInventory: GiftInventory[]
  onAddGiftItem: (name: string, stock: number) => void
  onUpdateStock: (id: number, quantity: number) => void
  onDeleteGiftItem: (id: number, name: string) => void
}

export default function InventoryManagement({
  giftInventory,
  onAddGiftItem,
  onUpdateStock,
  onDeleteGiftItem
}: InventoryManagementProps) {
  const [newGiftName, setNewGiftName] = useState('')
  const [newGiftStock, setNewGiftStock] = useState(0)
  const [stockUpdates, setStockUpdates] = useState<Record<number, number>>({})

  const handleAddGift = () => {
    if (!newGiftName.trim()) {
      alert('선물 이름을 입력해주세요.')
      return
    }
    
    if (giftInventory.find(g => g.name === newGiftName.trim())) {
      alert('이미 존재하는 선물 종류입니다.')
      return
    }

    onAddGiftItem(newGiftName.trim(), newGiftStock)
    setNewGiftName('')
    setNewGiftStock(0)
  }

  const handleStockUpdate = (id: number) => {
    const quantity = stockUpdates[id]
    if (!quantity || quantity === 0) {
      alert('변경할 재고 수량을 입력해주세요. (양수: 추가, 음수: 차감)')
      return
    }

    onUpdateStock(id, quantity)
    setStockUpdates(prev => ({ ...prev, [id]: 0 }))
  }

  return (
    <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200 space-y-6">
      <h2 className="text-2xl font-bold border-b pb-4">설정</h2>
      
      <div>
        <h3 className="text-xl font-semibold mb-3">선물 종류 및 재고 관리</h3>
        
        {/* 새 선물 추가 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4 p-4 border rounded-md bg-slate-50">
          <input
            type="text"
            placeholder="새 선물 이름 (예: 치실)"
            className="w-full p-2 border border-slate-300 rounded-md"
            value={newGiftName}
            onChange={(e) => setNewGiftName(e.target.value)}
          />
          <input
            type="number"
            placeholder="초기 재고 수량"
            className="w-full p-2 border border-slate-300 rounded-md"
            value={newGiftStock}
            onChange={(e) => setNewGiftStock(parseInt(e.target.value) || 0)}
          />
          <button
            onClick={handleAddGift}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md"
          >
            신규 추가
          </button>
        </div>

        {/* 기존 선물 목록 */}
        <div className="space-y-2">
          {giftInventory.map(item => (
            <div key={item.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center bg-slate-100 p-2 rounded-md">
              <span className="md:col-span-2 font-semibold">{item.name}</span>
              <span className="text-sm">
                현재 재고: <span className="font-bold text-blue-600">{item.stock}</span> 개
              </span>
              <input
                type="number"
                placeholder="추가/차감 수량 (음수 가능)"
                className="w-full p-2 border rounded-md"
                value={stockUpdates[item.id] || ''}
                onChange={(e) => setStockUpdates(prev => ({
                  ...prev,
                  [item.id]: parseInt(e.target.value) || 0
                }))}
              />
              <button
                onClick={() => handleStockUpdate(item.id)}
                className="bg-green-500 text-white p-2 rounded-md hover:bg-green-600 text-sm"
              >
                재고 수정
              </button>
              <button
                onClick={() => {
                  if (confirm(`'${item.name}' 선물을 삭제하시겠습니까? 관련 재고 기록도 모두 사라집니다.`)) {
                    onDeleteGiftItem(item.id, item.name)
                  }
                }}
                className="bg-red-500 text-white p-2 rounded-md hover:bg-red-600 text-sm"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 재고 관리 도구 */}
      <div>
        <h3 className="text-xl font-semibold mb-3">재고 관리 도구</h3>

      </div>
    </div>
  )
}