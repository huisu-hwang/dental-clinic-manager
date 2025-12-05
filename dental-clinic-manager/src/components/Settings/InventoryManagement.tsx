'use client'

import { useState } from 'react'
import { Settings, Package, Plus, Edit3, Trash2 } from 'lucide-react'
import type { GiftInventory } from '@/types'

interface InventoryManagementProps {
  giftInventory: GiftInventory[]
  onAddGiftItem: (name: string, stock: number) => void
  onUpdateStock: (id: number, quantity: number) => void
  onDeleteGiftItem: (id: number, name: string) => void
}

const SectionHeader = ({ number, title, icon: Icon }: { number: number; title: string; icon: React.ElementType }) => (
  <div className="flex items-center space-x-3 pb-3 mb-4 border-b border-slate-200">
    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600">
      <Icon className="w-4 h-4" />
    </div>
    <h3 className="text-base font-semibold text-slate-800">
      <span className="text-blue-600 mr-1">{number}.</span>
      {title}
    </h3>
  </div>
)

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
    <div>
      {/* 블루 그라데이션 헤더 - 스크롤 시 고정 */}
      <div className="sticky top-14 z-10 bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-xl shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">설정</h2>
            <p className="text-blue-100 text-sm">Settings & Inventory Management</p>
          </div>
        </div>
      </div>

      {/* 콘텐츠 영역 */}
      <div className="bg-white border-x border-b border-slate-200 rounded-b-xl p-6 space-y-8">
        {/* 새 선물 추가 */}
        <div>
          <SectionHeader number={1} title="신규 선물 추가" icon={Plus} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <input
              type="text"
              placeholder="새 선물 이름 (예: 치실)"
              className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={newGiftName}
              onChange={(e) => setNewGiftName(e.target.value)}
            />
            <input
              type="number"
              placeholder="초기 재고 수량"
              className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={newGiftStock}
              onChange={(e) => setNewGiftStock(parseInt(e.target.value) || 0)}
            />
            <button
              onClick={handleAddGift}
              className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              신규 추가
            </button>
          </div>
        </div>

        {/* 선물 및 재고 관리 */}
        <div>
          <SectionHeader number={2} title="선물 및 재고 관리" icon={Package} />
          {giftInventory.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-lg">
              <Package className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600">등록된 선물이 없습니다.</p>
              <p className="text-slate-500 text-sm">위에서 새 선물을 추가해주세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {giftInventory.map(item => (
                <div key={item.id} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-center bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <span className="md:col-span-2 font-semibold text-slate-800">{item.name}</span>
                  <span className="text-sm text-slate-600">
                    현재 재고: <span className="font-bold text-blue-600">{item.stock}</span> 개
                  </span>
                  <input
                    type="number"
                    placeholder="추가/차감 수량"
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    value={stockUpdates[item.id] || ''}
                    onChange={(e) => setStockUpdates(prev => ({
                      ...prev,
                      [item.id]: parseInt(e.target.value) || 0
                    }))}
                  />
                  <button
                    onClick={() => handleStockUpdate(item.id)}
                    className="flex items-center justify-center bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 text-sm transition-colors"
                  >
                    <Edit3 className="w-4 h-4 mr-1" />
                    재고 수정
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`'${item.name}' 선물을 삭제하시겠습니까? 관련 재고 기록도 모두 사라집니다.`)) {
                        onDeleteGiftItem(item.id, item.name)
                      }
                    }}
                    className="flex items-center justify-center bg-red-600 text-white p-2 rounded-lg hover:bg-red-700 text-sm transition-colors"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
