'use client'

import { useMemo } from 'react'

// 고정 화폐 종류 (변경 불가)
const FIXED_DENOMINATIONS = [
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

// 기본 데이터 (모든 화폐 종류, 개수 0)
export const DEFAULT_CASH_DATA: CashData = FIXED_DENOMINATIONS.map((d, index) => ({
  id: `fixed-${index}`,
  label: d.label,
  value: d.value,
  count: 0
}))

// 총액 계산 함수
export function calculateTotal(items: CashData): number {
  return items.reduce((sum, item) => sum + item.value * item.count, 0)
}

// 숫자 포맷팅
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount)
}

// 저장된 데이터를 고정 화폐 형식으로 정규화
function normalizeToFixed(items: CashData): CashData {
  return FIXED_DENOMINATIONS.map((d, index) => {
    const existing = items.find(item => item.value === d.value)
    return {
      id: `fixed-${index}`,
      label: d.label,
      value: d.value,
      count: existing?.count || 0
    }
  })
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
  // 항상 고정 화폐로 정규화
  const normalizedItems = useMemo(() => normalizeToFixed(items), [items])
  const total = useMemo(() => calculateTotal(normalizedItems), [normalizedItems])

  const handleCountChange = (value: number, count: number) => {
    const updated = normalizedItems.map(item =>
      item.value === value ? { ...item, count: Math.max(0, count) } : item
    )
    onChange(updated)
  }

  const bgClass = cardColor === 'blue' ? 'bg-blue-50' : 'bg-green-50'
  const borderClass = cardColor === 'blue' ? 'border-blue-200' : 'border-green-200'
  const headerBgClass = cardColor === 'blue' ? 'bg-blue-100' : 'bg-green-100'
  const titleClass = cardColor === 'blue' ? 'text-blue-800' : 'text-green-800'
  const subtitleClass = cardColor === 'blue' ? 'text-blue-600' : 'text-green-600'

  return (
    <div className={`rounded-lg border ${borderClass} ${bgClass} overflow-hidden`}>
      {/* 카드 헤더 */}
      <div className={`px-3 sm:px-4 py-2 sm:py-3 ${headerBgClass}`}>
        <h4 className={`font-semibold text-sm sm:text-base ${titleClass}`}>{title}</h4>
        <p className={`text-xs ${subtitleClass}`}>{subtitle}</p>
      </div>

      {/* 화폐 입력 영역 */}
      <div className="p-3 sm:p-4">
        <div className="space-y-2">
          {normalizedItems.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="text-sm text-slate-700 w-20 sm:w-24">
                {item.label}
              </span>
              <input
                type="number"
                min="0"
                value={item.count || ''}
                placeholder="0"
                onChange={(e) => handleCountChange(item.value, parseInt(e.target.value) || 0)}
                className="w-16 sm:w-20 px-2 py-1.5 text-right text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                readOnly={isReadOnly}
              />
              <span className="text-xs text-slate-500 w-6">개</span>
              <span className="text-xs text-slate-400 flex-1 text-right">
                {item.count > 0 && `= ${formatCurrency(item.value * item.count)}원`}
              </span>
            </div>
          ))}
        </div>
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
  const carriedForwardTotal = useMemo(() => calculateTotal(normalizeToFixed(carriedForward)), [carriedForward])
  const closingBalanceTotal = useMemo(() => calculateTotal(normalizeToFixed(closingBalance)), [closingBalance])
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
