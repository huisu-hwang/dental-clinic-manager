'use client'

import { useMemo } from 'react'
import type { CashRegisterRowData } from '@/types'

interface CashRegisterTableProps {
  cashRegisterData: CashRegisterRowData
  onCashRegisterDataChange: (data: CashRegisterRowData) => void
  isReadOnly: boolean
}

// 화폐 단위 정의
const CURRENCY_DENOMINATIONS = [
  { key: 'bill_50000', label: '5만원권', shortLabel: '5만', value: 50000, type: 'bill' },
  { key: 'bill_10000', label: '1만원권', shortLabel: '1만', value: 10000, type: 'bill' },
  { key: 'bill_5000', label: '5천원권', shortLabel: '5천', value: 5000, type: 'bill' },
  { key: 'bill_1000', label: '1천원권', shortLabel: '1천', value: 1000, type: 'bill' },
  { key: 'coin_500', label: '500원', shortLabel: '500', value: 500, type: 'coin' },
  { key: 'coin_100', label: '100원', shortLabel: '100', value: 100, type: 'coin' },
] as const

type DenominationKey = typeof CURRENCY_DENOMINATIONS[number]['key']
type PrevDenominationKey = `prev_${DenominationKey}`
type CurrDenominationKey = `curr_${DenominationKey}`

export default function CashRegisterTable({
  cashRegisterData,
  onCashRegisterDataChange,
  isReadOnly
}: CashRegisterTableProps) {

  // 전일 이월액 총액
  const previousTotal = useMemo(() => {
    return CURRENCY_DENOMINATIONS.reduce((sum, denom) => {
      const key = `prev_${denom.key}` as PrevDenominationKey
      return sum + (cashRegisterData[key] || 0) * denom.value
    }, 0)
  }, [cashRegisterData])

  // 금일 잔액 총액
  const currentTotal = useMemo(() => {
    return CURRENCY_DENOMINATIONS.reduce((sum, denom) => {
      const key = `curr_${denom.key}` as CurrDenominationKey
      return sum + (cashRegisterData[key] || 0) * denom.value
    }, 0)
  }, [cashRegisterData])

  // 차액 계산 (금일 잔액 - 전일 이월액)
  const balanceDifference = useMemo(() => {
    return currentTotal - previousTotal
  }, [currentTotal, previousTotal])

  const updateDenomination = (key: string, value: number) => {
    onCashRegisterDataChange({
      ...cashRegisterData,
      [key]: Math.max(0, value)
    })
  }

  const updateNotes = (value: string) => {
    onCashRegisterDataChange({
      ...cashRegisterData,
      notes: value
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount)
  }

  const getPrevCount = (denomKey: string) => {
    const key = `prev_${denomKey}` as PrevDenominationKey
    return cashRegisterData[key] || 0
  }

  const getCurrCount = (denomKey: string) => {
    const key = `curr_${denomKey}` as CurrDenominationKey
    return cashRegisterData[key] || 0
  }

  return (
    <div className="space-y-4">
      {/* 데스크탑: 컴팩트 테이블 */}
      <div className="hidden sm:block">
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 w-24">구분</th>
                {CURRENCY_DENOMINATIONS.map(denom => (
                  <th key={denom.key} className="px-2 py-2 text-center text-xs font-semibold text-slate-600 min-w-[70px]">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${
                      denom.type === 'bill' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {denom.shortLabel}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 w-32">합계액</th>
              </tr>
            </thead>
            <tbody>
              {/* 전일 이월액 행 */}
              <tr className="bg-orange-50/50 border-b border-slate-100">
                <td className="px-3 py-2 font-medium text-orange-700 text-xs whitespace-nowrap">전일이월액</td>
                {CURRENCY_DENOMINATIONS.map(denom => (
                  <td key={`prev_${denom.key}`} className="px-1 py-1.5">
                    <input
                      type="number"
                      min="0"
                      className="w-full px-2 py-1 border border-slate-200 rounded text-sm text-center focus:ring-1 focus:ring-orange-400 focus:border-orange-400 bg-white"
                      value={getPrevCount(denom.key) || ''}
                      onChange={(e) => updateDenomination(`prev_${denom.key}`, parseInt(e.target.value) || 0)}
                      placeholder="0"
                      readOnly={isReadOnly}
                    />
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-mono font-semibold text-orange-700">
                  {formatCurrency(previousTotal)}원
                </td>
              </tr>
              {/* 금일 잔액 행 */}
              <tr className="bg-blue-50/50">
                <td className="px-3 py-2 font-medium text-blue-700 text-xs whitespace-nowrap">금일잔액</td>
                {CURRENCY_DENOMINATIONS.map(denom => (
                  <td key={`curr_${denom.key}`} className="px-1 py-1.5">
                    <input
                      type="number"
                      min="0"
                      className="w-full px-2 py-1 border border-slate-200 rounded text-sm text-center focus:ring-1 focus:ring-blue-400 focus:border-blue-400 bg-white"
                      value={getCurrCount(denom.key) || ''}
                      onChange={(e) => updateDenomination(`curr_${denom.key}`, parseInt(e.target.value) || 0)}
                      placeholder="0"
                      readOnly={isReadOnly}
                    />
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-mono font-semibold text-blue-700">
                  {formatCurrency(currentTotal)}원
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 차액 표시 - 데스크탑 */}
        <div className="mt-3 flex items-center justify-end gap-2">
          <span className="text-sm text-slate-600">차액 (금일 - 전일):</span>
          <span className={`text-lg font-mono font-bold ${
            balanceDifference > 0 ? 'text-green-600' :
            balanceDifference < 0 ? 'text-red-600' : 'text-slate-600'
          }`}>
            {balanceDifference > 0 ? '+' : ''}{formatCurrency(balanceDifference)}원
          </span>
        </div>
      </div>

      {/* 모바일: 가로 스크롤 테이블 */}
      <div className="sm:hidden">
        <div className="border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-max min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600 sticky left-0 bg-slate-50 z-10 min-w-[72px]">구분</th>
                {CURRENCY_DENOMINATIONS.map(denom => (
                  <th key={denom.key} className="px-1 py-2 text-center text-xs font-semibold text-slate-600 min-w-[60px]">
                    <span className={`inline-block px-1 py-0.5 rounded text-xs ${
                      denom.type === 'bill' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {denom.shortLabel}
                    </span>
                  </th>
                ))}
                <th className="px-2 py-2 text-right text-xs font-semibold text-slate-600 min-w-[90px]">합계</th>
              </tr>
            </thead>
            <tbody>
              {/* 전일 이월액 행 */}
              <tr className="bg-orange-50/50 border-b border-slate-100">
                <td className="px-2 py-2 font-medium text-orange-700 text-xs whitespace-nowrap sticky left-0 bg-orange-50/80 z-10">전일이월</td>
                {CURRENCY_DENOMINATIONS.map(denom => (
                  <td key={`prev_${denom.key}`} className="px-0.5 py-1">
                    <input
                      type="number"
                      min="0"
                      className="w-14 px-1 py-1 border border-slate-200 rounded text-xs text-center focus:ring-1 focus:ring-orange-400 focus:border-orange-400 bg-white"
                      value={getPrevCount(denom.key) || ''}
                      onChange={(e) => updateDenomination(`prev_${denom.key}`, parseInt(e.target.value) || 0)}
                      placeholder="0"
                      readOnly={isReadOnly}
                    />
                  </td>
                ))}
                <td className="px-2 py-2 text-right font-mono font-semibold text-orange-700 text-xs">
                  {formatCurrency(previousTotal)}
                </td>
              </tr>
              {/* 금일 잔액 행 */}
              <tr className="bg-blue-50/50">
                <td className="px-2 py-2 font-medium text-blue-700 text-xs whitespace-nowrap sticky left-0 bg-blue-50/80 z-10">금일잔액</td>
                {CURRENCY_DENOMINATIONS.map(denom => (
                  <td key={`curr_${denom.key}`} className="px-0.5 py-1">
                    <input
                      type="number"
                      min="0"
                      className="w-14 px-1 py-1 border border-slate-200 rounded text-xs text-center focus:ring-1 focus:ring-blue-400 focus:border-blue-400 bg-white"
                      value={getCurrCount(denom.key) || ''}
                      onChange={(e) => updateDenomination(`curr_${denom.key}`, parseInt(e.target.value) || 0)}
                      placeholder="0"
                      readOnly={isReadOnly}
                    />
                  </td>
                ))}
                <td className="px-2 py-2 text-right font-mono font-semibold text-blue-700 text-xs">
                  {formatCurrency(currentTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 차액 표시 - 모바일 */}
        <div className="mt-2 flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
          <span className="text-xs text-slate-600">차액 (금일 - 전일)</span>
          <span className={`text-base font-mono font-bold ${
            balanceDifference > 0 ? 'text-green-600' :
            balanceDifference < 0 ? 'text-red-600' : 'text-slate-600'
          }`}>
            {balanceDifference > 0 ? '+' : ''}{formatCurrency(balanceDifference)}원
          </span>
        </div>
      </div>

      {/* 비고 */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          비고
        </label>
        <textarea
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          rows={2}
          placeholder="현금 출납 관련 특이사항을 기록하세요."
          value={cashRegisterData.notes}
          onChange={(e) => updateNotes(e.target.value)}
          readOnly={isReadOnly}
        />
      </div>
    </div>
  )
}
