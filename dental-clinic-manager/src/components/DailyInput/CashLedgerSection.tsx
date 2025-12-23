'use client'

import { useMemo } from 'react'
import type { CashDenominations } from '@/types'

// 화폐 종류 정의
const DENOMINATIONS = [
  { key: 'bill_50000', label: '5만원권', value: 50000, type: 'bill' },
  { key: 'bill_10000', label: '1만원권', value: 10000, type: 'bill' },
  { key: 'bill_5000', label: '5천원권', value: 5000, type: 'bill' },
  { key: 'bill_1000', label: '1천원권', value: 1000, type: 'bill' },
  { key: 'coin_500', label: '500원', value: 500, type: 'coin' },
  { key: 'coin_100', label: '100원', value: 100, type: 'coin' },
  { key: 'coin_50', label: '50원', value: 50, type: 'coin' },
  { key: 'coin_10', label: '10원', value: 10, type: 'coin' },
] as const

// 기본 화폐 데이터
export const DEFAULT_DENOMINATIONS: CashDenominations = {
  bill_50000: 0,
  bill_10000: 0,
  bill_5000: 0,
  bill_1000: 0,
  coin_500: 0,
  coin_100: 0,
  coin_50: 0,
  coin_10: 0,
}

// 총액 계산 함수
export function calculateTotal(denominations: CashDenominations): number {
  return DENOMINATIONS.reduce((sum, denom) => {
    return sum + (denominations[denom.key as keyof CashDenominations] || 0) * denom.value
  }, 0)
}

// 숫자 포맷팅
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount)
}

interface CashInputRowProps {
  label: string
  value: number
  onChange: (value: number) => void
  unitValue: number
  isReadOnly: boolean
  type: 'bill' | 'coin'
}

function CashInputRow({ label, value, onChange, unitValue, isReadOnly, type }: CashInputRowProps) {
  const subtotal = value * unitValue

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <span className={`text-xs sm:text-sm w-16 sm:w-20 ${type === 'bill' ? 'text-green-700' : 'text-amber-700'}`}>
        {label}
      </span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        className="w-16 sm:w-20 px-2 py-1.5 text-right text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        readOnly={isReadOnly}
      />
      <span className="text-slate-400 text-xs">×</span>
      <span className="text-slate-500 text-xs sm:text-sm w-12 sm:w-14 text-right">
        {formatCurrency(unitValue)}
      </span>
      <span className="text-slate-400 text-xs">=</span>
      <span className="text-sm font-medium text-slate-700 w-20 sm:w-24 text-right">
        {formatCurrency(subtotal)}원
      </span>
    </div>
  )
}

interface CashCardProps {
  title: string
  subtitle: string
  denominations: CashDenominations
  onChange: (denominations: CashDenominations) => void
  isReadOnly: boolean
  cardColor: 'blue' | 'green'
}

function CashCard({ title, subtitle, denominations, onChange, isReadOnly, cardColor }: CashCardProps) {
  const total = useMemo(() => calculateTotal(denominations), [denominations])

  const handleChange = (key: keyof CashDenominations, value: number) => {
    onChange({
      ...denominations,
      [key]: value,
    })
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
      <div className="p-3 sm:p-4 space-y-2">
        {/* 지폐 */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-green-600 uppercase tracking-wide">지폐</span>
          {DENOMINATIONS.filter(d => d.type === 'bill').map((denom) => (
            <CashInputRow
              key={denom.key}
              label={denom.label}
              value={denominations[denom.key as keyof CashDenominations]}
              onChange={(value) => handleChange(denom.key as keyof CashDenominations, value)}
              unitValue={denom.value}
              isReadOnly={isReadOnly}
              type="bill"
            />
          ))}
        </div>

        {/* 구분선 */}
        <div className="border-t border-slate-200 my-2" />

        {/* 동전 */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-amber-600 uppercase tracking-wide">동전</span>
          {DENOMINATIONS.filter(d => d.type === 'coin').map((denom) => (
            <CashInputRow
              key={denom.key}
              label={denom.label}
              value={denominations[denom.key as keyof CashDenominations]}
              onChange={(value) => handleChange(denom.key as keyof CashDenominations, value)}
              unitValue={denom.value}
              isReadOnly={isReadOnly}
              type="coin"
            />
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
  carriedForward: CashDenominations
  closingBalance: CashDenominations
  onCarriedForwardChange: (denominations: CashDenominations) => void
  onClosingBalanceChange: (denominations: CashDenominations) => void
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
          denominations={carriedForward}
          onChange={onCarriedForwardChange}
          isReadOnly={isReadOnly}
          cardColor="blue"
        />
        <CashCard
          title="금일 잔액"
          subtitle="오늘 남은 현금"
          denominations={closingBalance}
          onChange={onClosingBalanceChange}
          isReadOnly={isReadOnly}
          cardColor="green"
        />
      </div>
    </div>
  )
}
