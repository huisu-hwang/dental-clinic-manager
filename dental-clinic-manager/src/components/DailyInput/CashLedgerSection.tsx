'use client'

import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'

// 기본 화폐 종류 (50원, 10원 제외)
const DEFAULT_DENOMINATION_OPTIONS = [
  { label: '5만원권', value: 50000 },
  { label: '1만원권', value: 10000 },
  { label: '5천원권', value: 5000 },
  { label: '1천원권', value: 1000 },
  { label: '500원', value: 500 },
  { label: '100원', value: 100 },
]

// 현금 항목 타입
export interface CashItem {
  id: string
  label: string
  value: number
  count: number
}

// 현금 데이터 타입 (배열 형태)
export type CashData = CashItem[]

// 기본 빈 데이터
export const DEFAULT_CASH_DATA: CashData = []

// 총액 계산 함수
export function calculateTotal(items: CashData): number {
  return items.reduce((sum, item) => sum + item.value * item.count, 0)
}

// 숫자 포맷팅
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount)
}

// ID 생성
function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

interface CashCardProps {
  title: string
  subtitle: string
  items: CashData
  onChange: (items: CashData) => void
  isReadOnly: boolean
  cardColor: 'blue' | 'green'
}

function CashCard({ title, subtitle, items, onChange, isReadOnly, cardColor }: CashCardProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newValue, setNewValue] = useState('')

  const total = useMemo(() => calculateTotal(items), [items])

  const handleCountChange = (id: string, count: number) => {
    onChange(items.map(item =>
      item.id === id ? { ...item, count: Math.max(0, count) } : item
    ))
  }

  const handleRemoveItem = (id: string) => {
    onChange(items.filter(item => item.id !== id))
  }

  const handleAddPreset = (preset: { label: string; value: number }) => {
    // 이미 있는 화폐인지 확인
    const exists = items.some(item => item.value === preset.value)
    if (exists) return

    onChange([...items, {
      id: generateId(),
      label: preset.label,
      value: preset.value,
      count: 0
    }])
  }

  const handleAddCustom = () => {
    if (!newLabel.trim() || !newValue) return
    const value = parseInt(newValue)
    if (isNaN(value) || value <= 0) return

    onChange([...items, {
      id: generateId(),
      label: newLabel.trim(),
      value,
      count: 0
    }])
    setNewLabel('')
    setNewValue('')
    setShowAddForm(false)
  }

  const bgClass = cardColor === 'blue' ? 'bg-blue-50' : 'bg-green-50'
  const borderClass = cardColor === 'blue' ? 'border-blue-200' : 'border-green-200'
  const headerBgClass = cardColor === 'blue' ? 'bg-blue-100' : 'bg-green-100'
  const titleClass = cardColor === 'blue' ? 'text-blue-800' : 'text-green-800'
  const subtitleClass = cardColor === 'blue' ? 'text-blue-600' : 'text-green-600'
  const buttonClass = cardColor === 'blue' ? 'text-blue-600 hover:bg-blue-100' : 'text-green-600 hover:bg-green-100'

  // 아직 추가되지 않은 기본 화폐 목록
  const availablePresets = DEFAULT_DENOMINATION_OPTIONS.filter(
    preset => !items.some(item => item.value === preset.value)
  )

  return (
    <div className={`rounded-lg border ${borderClass} ${bgClass} overflow-hidden`}>
      {/* 카드 헤더 */}
      <div className={`px-3 sm:px-4 py-2 sm:py-3 ${headerBgClass}`}>
        <h4 className={`font-semibold text-sm sm:text-base ${titleClass}`}>{title}</h4>
        <p className={`text-xs ${subtitleClass}`}>{subtitle}</p>
      </div>

      {/* 화폐 입력 영역 */}
      <div className="p-3 sm:p-4">
        {items.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-2">화폐를 추가해주세요</p>
        ) : (
          <div className="space-y-2">
            {items.sort((a, b) => b.value - a.value).map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">
                  {item.label}
                </span>
                <input
                  type="number"
                  min="0"
                  value={item.count || ''}
                  placeholder="0"
                  onChange={(e) => handleCountChange(item.id, parseInt(e.target.value) || 0)}
                  className="w-16 sm:w-20 px-2 py-1.5 text-right text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  readOnly={isReadOnly}
                />
                <span className="text-xs text-slate-500 w-6">개</span>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.id)}
                    className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 화폐 추가 영역 */}
        {!isReadOnly && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            {/* 기본 화폐 빠른 추가 */}
            {availablePresets.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {availablePresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => handleAddPreset(preset)}
                    className={`px-2 py-1 text-xs rounded-md border border-current ${buttonClass} transition-colors`}
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>
            )}

            {/* 사용자 정의 화폐 추가 */}
            {showAddForm ? (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="명칭"
                  className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-slate-300 rounded-md"
                />
                <input
                  type="number"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="단위(원)"
                  className="w-24 px-2 py-1.5 text-sm border border-slate-300 rounded-md"
                />
                <button
                  type="button"
                  onClick={handleAddCustom}
                  className="px-2 py-1.5 text-sm bg-slate-600 text-white rounded-md hover:bg-slate-700"
                >
                  추가
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setNewLabel(''); setNewValue(''); }}
                  className="p-1.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className={`flex items-center gap-1 text-xs ${buttonClass} px-2 py-1 rounded-md transition-colors`}
              >
                <Plus className="w-3 h-3" />
                직접 입력
              </button>
            )}
          </div>
        )}
      </div>

      {/* 합계 */}
      <div className={`px-3 sm:px-4 py-3 ${headerBgClass} border-t ${borderClass}`}>
        <div className="flex items-center justify-between">
          <span className={`font-medium text-sm ${titleClass}`}>합계</span>
          <span className={`text-lg sm:text-xl font-bold ${titleClass}`}>
            {formatCurrency(total)}원
          </span>
        </div>
      </div>
    </div>
  )
}

interface CashLedgerSectionProps {
  carriedForward: CashData
  closingBalance: CashData
  onCarriedForwardChange: (items: CashData) => void
  onClosingBalanceChange: (items: CashData) => void
  isReadOnly: boolean
}

export default function CashLedgerSection({
  carriedForward,
  closingBalance,
  onCarriedForwardChange,
  onClosingBalanceChange,
  isReadOnly,
}: CashLedgerSectionProps) {
  const carriedForwardTotal = useMemo(() => calculateTotal(carriedForward), [carriedForward])
  const closingBalanceTotal = useMemo(() => calculateTotal(closingBalance), [closingBalance])
  const difference = closingBalanceTotal - carriedForwardTotal

  return (
    <div className="space-y-4">
      {/* 요약 정보 */}
      <div className="bg-slate-50 rounded-lg p-3 sm:p-4 border border-slate-200">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-slate-500 mb-1">전일 이월액</p>
            <p className="text-sm sm:text-lg font-bold text-blue-600">
              {formatCurrency(carriedForwardTotal)}원
            </p>
          </div>
          <div className="flex items-center justify-center">
            <span className="text-slate-400">→</span>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">금일 잔액</p>
            <p className="text-sm sm:text-lg font-bold text-green-600">
              {formatCurrency(closingBalanceTotal)}원
            </p>
          </div>
        </div>
        {difference !== 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200 text-center">
            <p className="text-xs text-slate-500 mb-1">증감</p>
            <p className={`text-sm font-semibold ${difference > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {difference > 0 ? '+' : ''}{formatCurrency(difference)}원
            </p>
          </div>
        )}
      </div>

      {/* 상세 입력 카드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CashCard
          title="전일 이월액"
          subtitle="전날에서 넘겨받은 현금"
          items={carriedForward}
          onChange={onCarriedForwardChange}
          isReadOnly={isReadOnly}
          cardColor="blue"
        />
        <CashCard
          title="금일 잔액"
          subtitle="오늘 남은 현금"
          items={closingBalance}
          onChange={onClosingBalanceChange}
          isReadOnly={isReadOnly}
          cardColor="green"
        />
      </div>
    </div>
  )
}
