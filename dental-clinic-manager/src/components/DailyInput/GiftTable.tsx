'use client'

import { useMemo } from 'react'
import { Plus, X } from 'lucide-react'
import type { GiftRowData, GiftInventory, GiftLog, GiftCategory } from '@/types'

interface GiftTableProps {
  giftRows: GiftRowData[]
  onGiftRowsChange: (rows: GiftRowData[]) => void
  giftInventory: GiftInventory[]
  giftCategories?: GiftCategory[]  // 선물 카테고리 목록
  giftLogs?: GiftLog[]      // 저장된 선물 사용 기록
  baseUsageByGift?: Record<string, number>  // 전체 giftLogs 기반 사용량 (dashboard에서 계산)
  currentDate?: string      // 현재 입력 중인 보고서 날짜
  isReadOnly: boolean
}

export default function GiftTable({ giftRows, onGiftRowsChange, giftInventory, giftCategories = [], giftLogs = [], baseUsageByGift = {}, currentDate = '', isReadOnly }: GiftTableProps) {
  // 현재 날짜의 저장된 사용량 계산 (baseUsageByGift에서 제외할 양)
  const currentDateSavedUsage = useMemo(() => {
    const usage: Record<string, number> = {}
    for (const log of giftLogs) {
      if (log.gift_type && log.gift_type !== '없음' && log.date === currentDate) {
        usage[log.gift_type] = (usage[log.gift_type] || 0) + (log.quantity || 1)
      }
    }
    return usage
  }, [giftLogs, currentDate])

  // 실제 재고 계산 함수
  // 공식: 실제 재고 = 입고 재고 - 전체 사용량 + 현재 날짜 저장 사용량 - 현재 입력 사용량
  // (현재 날짜 저장 사용량은 현재 입력으로 대체되므로 더해줌)
  const getAvailableInventory = (giftType: string, currentRowIndex?: number) => {
    if (!giftType || giftType === '없음') return 0

    const gift = giftInventory.find(item => item.name === giftType)
    if (!gift) return 0

    // 전체 저장된 사용량 (dashboard에서 계산된 값)
    const totalSavedUsage = baseUsageByGift[giftType] || 0

    // 현재 날짜의 저장된 사용량 (이 값은 현재 입력으로 대체됨)
    const currentDateUsage = currentDateSavedUsage[giftType] || 0

    // 현재 입력 중인 giftRows에서의 사용량 (자기 자신 제외)
    const currentInputUsage = giftRows.reduce((total, row, index) => {
      if (currentRowIndex !== undefined && index === currentRowIndex) {
        return total
      }
      if (row.gift_type === giftType && row.patient_name?.trim()) {
        return total + (row.quantity || 1)
      }
      return total
    }, 0)

    // 실제 남은 재고 = 입고 재고 - 전체 사용량 + 현재 날짜 저장 사용량 - 현재 입력 사용량
    return Math.max(0, gift.stock - totalSavedUsage + currentDateUsage - currentInputUsage)
  }

  // 카테고리 ID로 카테고리 정보 가져오기
  const getCategoryForGift = (giftName: string) => {
    const gift = giftInventory.find(item => item.name === giftName)
    if (!gift || !gift.category_id) return null
    return giftCategories.find(cat => cat.id === gift.category_id) || null
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

    // 선물 종류 변경 시: 재고가 부족하면 수량 조정
    if (field === 'gift_type' && value !== '없음') {
      const gift = giftInventory.find(item => item.name === value)
      if (gift) {
        const availableStock = getAvailableInventory(value as string, index)
        if (availableStock < newRows[index].quantity) {
          newRows[index].quantity = Math.max(1, availableStock)
        }
      }
      // giftInventory에 없는 선물이면 수량 체크 건너뜀 (이미 저장된 데이터)
    }

    // 수량 변경 시: 재고 체크 (giftInventory에 있는 선물만)
    if (field === 'quantity') {
      const gift = giftInventory.find(item => item.name === newRows[index].gift_type)
      if (gift) {
        const availableStock = getAvailableInventory(newRows[index].gift_type, index)
        if ((value as number) > availableStock && availableStock > 0) {
          newRows[index].quantity = Math.max(1, availableStock)
          alert(`재고가 부족합니다. 사용 가능한 수량: ${availableStock}개`)
        }
      }
      // giftInventory에 없는 선물이면 재고 체크 없이 수량 변경 허용
    }

    onGiftRowsChange(newRows)
  }

  // 카테고리별로 선물 그룹핑 (드롭다운용)
  const groupedInventory = useMemo(() => {
    const groups: { category: GiftCategory | null; items: GiftInventory[] }[] = []
    const categorized: Record<number, GiftInventory[]> = {}
    const uncategorized: GiftInventory[] = []

    for (const item of giftInventory) {
      if (item.category_id) {
        if (!categorized[item.category_id]) {
          categorized[item.category_id] = []
        }
        categorized[item.category_id].push(item)
      } else {
        uncategorized.push(item)
      }
    }

    // 카테고리 순서대로 그룹 생성
    for (const cat of giftCategories) {
      if (categorized[cat.id]?.length > 0) {
        groups.push({ category: cat, items: categorized[cat.id] })
      }
    }

    // 미분류 항목 추가
    if (uncategorized.length > 0) {
      groups.push({ category: null, items: uncategorized })
    }

    return groups
  }, [giftInventory, giftCategories])

  return (
    <div>
      {/* 데스크탑: 테이블 형식 */}
      <div className="hidden sm:block overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">환자명</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">선물 종류</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-32">수량</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-28">리뷰</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">비고</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {giftRows.map((row, index) => {
              const category = getCategoryForGift(row.gift_type)
              return (
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
                    <div className="flex flex-col gap-1">
                      <select
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white appearance-none cursor-pointer"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
                        value={row.gift_type}
                        onChange={(e) => updateRow(index, 'gift_type', e.target.value)}
                        disabled={isReadOnly}
                      >
                        <option value="없음">없음</option>
                        {groupedInventory.map((group, groupIdx) => (
                          <optgroup key={groupIdx} label={group.category?.name || '미분류'}>
                            {group.items.map(item => {
                              const availableQty = getAvailableInventory(item.name, index)
                              const isSelected = row.gift_type === item.name
                              return (
                                <option
                                  key={item.id}
                                  value={item.name}
                                  disabled={availableQty <= 0 && !isSelected}
                                >
                                  {isSelected ? item.name : `${item.name} (${availableQty}개)`}
                                </option>
                              )
                            })}
                          </optgroup>
                        ))}
                      </select>
                      {category && (
                        <span
                          className="inline-flex items-center self-start px-2 py-0.5 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: category.color }}
                        >
                          {category.name}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <select
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.25rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.25em 1.25em', paddingRight: '1.5rem' }}
                      value={row.quantity}
                      onChange={(e) => updateRow(index, 'quantity', parseInt(e.target.value))}
                      disabled={row.gift_type === '없음' || isReadOnly}
                    >
                      {(() => {
                        // 선물 종류가 '없음'이면 기본 10개 옵션
                        if (row.gift_type === '없음') {
                          return Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
                            <option key={num} value={num}>{num}</option>
                          ))
                        }
                        // 선물이 선택된 경우: 실제 재고 기준으로 최대값 계산
                        const gift = giftInventory.find(item => item.name === row.gift_type)
                        const totalStock = gift?.stock || 0
                        const totalSavedUsage = baseUsageByGift[row.gift_type] || 0  // 전체 저장 사용량
                        const currentDateUsage = currentDateSavedUsage[row.gift_type] || 0  // 현재 날짜 저장 사용량
                        // 실제 남은 재고 = 입고 재고 - 전체 사용량 + 현재 날짜 사용량 (현재 입력으로 대체됨)
                        const actualStock = totalStock - totalSavedUsage + currentDateUsage
                        const usedByOthers = giftRows.reduce((total, r, idx) => {
                          if (idx === index || r.gift_type !== row.gift_type) return total
                          if (!r.patient_name?.trim()) return total  // 환자명이 없으면 제외
                          return total + (r.quantity || 1)
                        }, 0)
                        const availableForThis = actualStock - usedByOthers
                        const maxQuantity = Math.min(Math.max(availableForThis, 1), 10)

                        return Array.from({ length: Math.max(1, maxQuantity) }, (_, i) => i + 1).map(num => {
                          const remaining = actualStock - usedByOthers - num
                          return (
                            <option key={num} value={num}>
                              {num}개 (남음:{remaining >= 0 ? remaining : 0})
                            </option>
                          )
                        })
                      })()}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
                      value={row.naver_review}
                      onChange={(e) => updateRow(index, 'naver_review', e.target.value as 'O' | 'X')}
                      disabled={isReadOnly}
                    >
                      <option value="X">X</option>
                      <option value="O">O</option>
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
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 모바일: 카드 형식 */}
      <div className="sm:hidden space-y-3">
        {giftRows.map((row, index) => {
          const category = getCategoryForGift(row.gift_type)
          return (
            <div key={index} className="border border-slate-200 rounded-lg p-3 bg-white">
              <div className="flex justify-between items-start mb-3">
                <span className="text-xs font-medium text-slate-500">#{index + 1}</span>
                <button
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => removeRow(index)}
                  disabled={isReadOnly}
                  title="삭제"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">환자명</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="홍길동"
                    value={row.patient_name}
                    onChange={(e) => updateRow(index, 'patient_name', e.target.value)}
                    readOnly={isReadOnly}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">선물 종류</label>
                    <select
                      className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
                      value={row.gift_type}
                      onChange={(e) => updateRow(index, 'gift_type', e.target.value)}
                      disabled={isReadOnly}
                    >
                      <option value="없음">없음</option>
                      {groupedInventory.map((group, groupIdx) => (
                        <optgroup key={groupIdx} label={group.category?.name || '미분류'}>
                          {group.items.map(item => {
                            const availableQty = getAvailableInventory(item.name, index)
                            const isSelected = row.gift_type === item.name
                            return (
                              <option
                                key={item.id}
                                value={item.name}
                                disabled={availableQty <= 0 && !isSelected}
                              >
                                {isSelected ? item.name : `${item.name} (${availableQty}개)`}
                              </option>
                            )
                          })}
                        </optgroup>
                      ))}
                    </select>
                    {category && (
                      <span
                        className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: category.color }}
                      >
                        {category.name}
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">수량</label>
                    <select
                      className="w-full px-2 py-2 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.25rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.25em 1.25em', paddingRight: '1.5rem' }}
                      value={row.quantity}
                      onChange={(e) => updateRow(index, 'quantity', parseInt(e.target.value))}
                      disabled={row.gift_type === '없음' || isReadOnly}
                    >
                      {(() => {
                        // 선물 종류가 '없음'이면 기본 10개 옵션
                        if (row.gift_type === '없음') {
                          return Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
                            <option key={num} value={num}>{num}</option>
                          ))
                        }
                        // 선물이 선택된 경우: 실제 재고 기준으로 최대값 계산
                        const gift = giftInventory.find(item => item.name === row.gift_type)
                        const totalStock = gift?.stock || 0
                        const totalSavedUsage = baseUsageByGift[row.gift_type] || 0  // 전체 저장 사용량
                        const currentDateUsage = currentDateSavedUsage[row.gift_type] || 0  // 현재 날짜 저장 사용량
                        // 실제 남은 재고 = 입고 재고 - 전체 사용량 + 현재 날짜 사용량 (현재 입력으로 대체됨)
                        const actualStock = totalStock - totalSavedUsage + currentDateUsage
                        const usedByOthers = giftRows.reduce((total, r, idx) => {
                          if (idx === index || r.gift_type !== row.gift_type) return total
                          if (!r.patient_name?.trim()) return total  // 환자명이 없으면 제외
                          return total + (r.quantity || 1)
                        }, 0)
                        const availableForThis = actualStock - usedByOthers
                        const maxQuantity = Math.min(Math.max(availableForThis, 1), 10)

                        return Array.from({ length: Math.max(1, maxQuantity) }, (_, i) => i + 1).map(num => {
                          const remaining = actualStock - usedByOthers - num
                          return (
                            <option key={num} value={num}>
                              {num}개 (남음:{remaining >= 0 ? remaining : 0})
                            </option>
                          )
                        })
                      })()}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">리뷰</label>
                    <select
                      className="w-full px-2 py-2 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.25rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.25em 1.25em', paddingRight: '1.5rem' }}
                      value={row.naver_review}
                      onChange={(e) => updateRow(index, 'naver_review', e.target.value as 'O' | 'X')}
                      disabled={isReadOnly}
                    >
                      <option value="X">X</option>
                      <option value="O">O</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">비고</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="비고"
                      value={row.notes}
                      onChange={(e) => updateRow(index, 'notes', e.target.value)}
                      readOnly={isReadOnly}
                    />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <button
        onClick={addRow}
        className="mt-3 inline-flex items-center px-3 py-2 sm:py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto justify-center sm:justify-start"
        disabled={isReadOnly}
      >
        <Plus className="w-4 h-4 mr-1" />
        행 추가
      </button>
    </div>
  )
}
