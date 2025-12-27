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
  { key: 'bill_50000', label: '5만원권', value: 50000, type: 'bill' },
  { key: 'bill_10000', label: '1만원권', value: 10000, type: 'bill' },
  { key: 'bill_5000', label: '5천원권', value: 5000, type: 'bill' },
  { key: 'bill_1000', label: '1천원권', value: 1000, type: 'bill' },
  { key: 'coin_500', label: '500원', value: 500, type: 'coin' },
  { key: 'coin_100', label: '100원', value: 100, type: 'coin' },
] as const

type DenominationKey = typeof CURRENCY_DENOMINATIONS[number]['key']
type PrevDenominationKey = `prev_${DenominationKey}`
type CurrDenominationKey = `curr_${DenominationKey}`

// 공통 denomination 타입 (렌더링 함수용)
interface DenominationItem {
  key: DenominationKey
  label: string
  value: number
  type: 'bill' | 'coin'
  fullKey: string
  count: number
  amount: number
}

export default function CashRegisterTable({
  cashRegisterData,
  onCashRegisterDataChange,
  isReadOnly
}: CashRegisterTableProps) {

  // 전일 이월액 화폐별 금액 계산
  const prevDenominationAmounts = useMemo((): DenominationItem[] => {
    return CURRENCY_DENOMINATIONS.map(denom => {
      const key = `prev_${denom.key}` as PrevDenominationKey
      const count = cashRegisterData[key] || 0
      return {
        key: denom.key,
        label: denom.label,
        value: denom.value,
        type: denom.type,
        fullKey: key,
        count,
        amount: count * denom.value
      }
    })
  }, [cashRegisterData])

  // 금일 잔액 화폐별 금액 계산
  const currDenominationAmounts = useMemo((): DenominationItem[] => {
    return CURRENCY_DENOMINATIONS.map(denom => {
      const key = `curr_${denom.key}` as CurrDenominationKey
      const count = cashRegisterData[key] || 0
      return {
        key: denom.key,
        label: denom.label,
        value: denom.value,
        type: denom.type,
        fullKey: key,
        count,
        amount: count * denom.value
      }
    })
  }, [cashRegisterData])

  // 전일 이월액 총액
  const previousTotal = useMemo(() => {
    return prevDenominationAmounts.reduce((sum, d) => sum + d.amount, 0)
  }, [prevDenominationAmounts])

  // 금일 잔액 총액
  const currentTotal = useMemo(() => {
    return currDenominationAmounts.reduce((sum, d) => sum + d.amount, 0)
  }, [currDenominationAmounts])

  // 차액 계산 (금일 잔액 - 전일 이월액)
  const balanceDifference = useMemo(() => {
    return currentTotal - previousTotal
  }, [currentTotal, previousTotal])

  const updatePrevDenomination = (key: string, value: number) => {
    onCashRegisterDataChange({
      ...cashRegisterData,
      [key]: Math.max(0, value)
    })
  }

  const updateCurrDenomination = (key: string, value: number) => {
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

  // 공통 테이블 렌더링 함수 - 데스크탑
  const renderDenominationTable = (
    title: string,
    denominations: DenominationItem[],
    total: number,
    updateFn: (key: string, value: number) => void,
    bgColor: string,
    totalBgColor: string
  ) => (
    <div className="hidden sm:block">
      <h4 className="text-sm font-medium text-slate-700 mb-3">{title}</h4>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className={`${bgColor} border-b border-slate-200`}>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">화폐</th>
              <th className="px-4 py-2 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-32">개수</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider w-40">금액</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {denominations.map((denom) => (
              <tr key={denom.fullKey} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                    denom.type === 'bill'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {denom.label}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min="0"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-md text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={denom.count || ''}
                    onChange={(e) => updateFn(denom.fullKey, parseInt(e.target.value) || 0)}
                    placeholder="0"
                    readOnly={isReadOnly}
                  />
                </td>
                <td className="px-4 py-2 text-right font-mono text-slate-700">
                  {formatCurrency(denom.amount)}원
                </td>
              </tr>
            ))}
            {/* 총액 행 */}
            <tr className={`${totalBgColor} font-medium`}>
              <td className="px-4 py-3" colSpan={2}>
                합계
              </td>
              <td className="px-4 py-3 text-right font-mono text-lg">
                {formatCurrency(total)}원
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )

  // 공통 테이블 렌더링 함수 - 모바일
  const renderDenominationMobile = (
    title: string,
    denominations: DenominationItem[],
    total: number,
    updateFn: (key: string, value: number) => void,
    totalBgColor: string,
    totalTextColor: string
  ) => (
    <div className="sm:hidden">
      <h4 className="text-sm font-medium text-slate-700 mb-3">{title}</h4>
      <div className="grid grid-cols-2 gap-2">
        {denominations.map((denom) => (
          <div key={denom.fullKey} className="border border-slate-200 rounded-lg p-3 bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                denom.type === 'bill'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {denom.label}
              </span>
            </div>
            <input
              type="number"
              min="0"
              className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-1"
              value={denom.count || ''}
              onChange={(e) => updateFn(denom.fullKey, parseInt(e.target.value) || 0)}
              placeholder="0"
              readOnly={isReadOnly}
            />
            <div className="text-right text-xs font-mono text-slate-600">
              {formatCurrency(denom.amount)}원
            </div>
          </div>
        ))}
      </div>
      {/* 모바일 총액 */}
      <div className={`mt-3 ${totalBgColor} rounded-lg p-3 flex justify-between items-center`}>
        <span className={`text-sm font-medium ${totalTextColor}`}>합계</span>
        <span className={`text-lg font-mono font-bold ${totalTextColor}`}>{formatCurrency(total)}원</span>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* 전일 이월액 */}
      <div className="bg-orange-50/30 rounded-xl p-4 border border-orange-100">
        {renderDenominationTable(
          '전일 이월액 (화폐별 개수)',
          prevDenominationAmounts,
          previousTotal,
          updatePrevDenomination,
          'bg-orange-50',
          'bg-orange-100 text-orange-800'
        )}
        {renderDenominationMobile(
          '전일 이월액 (화폐별 개수)',
          prevDenominationAmounts,
          previousTotal,
          updatePrevDenomination,
          'bg-orange-100',
          'text-orange-800'
        )}
      </div>

      {/* 금일 잔액 */}
      <div className="bg-blue-50/30 rounded-xl p-4 border border-blue-100">
        {renderDenominationTable(
          '금일 잔액 (화폐별 개수)',
          currDenominationAmounts,
          currentTotal,
          updateCurrDenomination,
          'bg-blue-50',
          'bg-blue-100 text-blue-800'
        )}
        {renderDenominationMobile(
          '금일 잔액 (화폐별 개수)',
          currDenominationAmounts,
          currentTotal,
          updateCurrDenomination,
          'bg-blue-100',
          'text-blue-800'
        )}
      </div>

      {/* 차액 계산 결과 */}
      <div className="bg-gradient-to-r from-slate-100 to-slate-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-slate-700 mb-3">계산 결과</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 전일 이월액 */}
          <div className="bg-white rounded-lg p-3 border border-orange-200">
            <div className="text-xs text-slate-500 mb-1">전일 이월액</div>
            <div className="text-lg font-mono font-bold text-orange-600">
              {formatCurrency(previousTotal)}원
            </div>
          </div>

          {/* 금일 잔액 */}
          <div className="bg-white rounded-lg p-3 border border-blue-200">
            <div className="text-xs text-slate-500 mb-1">금일 잔액</div>
            <div className="text-lg font-mono font-bold text-blue-600">
              {formatCurrency(currentTotal)}원
            </div>
          </div>

          {/* 차액 */}
          <div className="bg-white rounded-lg p-3 border border-slate-200">
            <div className="text-xs text-slate-500 mb-1">차액 (금일 - 전일)</div>
            <div className={`text-lg font-mono font-bold ${
              balanceDifference > 0 ? 'text-green-600' :
              balanceDifference < 0 ? 'text-red-600' : 'text-slate-600'
            }`}>
              {balanceDifference > 0 ? '+' : ''}{formatCurrency(balanceDifference)}원
            </div>
          </div>
        </div>
      </div>

      {/* 비고 */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
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
