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

export default function CashRegisterTable({
  cashRegisterData,
  onCashRegisterDataChange,
  isReadOnly
}: CashRegisterTableProps) {

  // 화폐별 금액 계산
  const denominationAmounts = useMemo(() => {
    return CURRENCY_DENOMINATIONS.map(denom => ({
      ...denom,
      count: cashRegisterData[denom.key as DenominationKey],
      amount: cashRegisterData[denom.key as DenominationKey] * denom.value
    }))
  }, [cashRegisterData])

  // 현금 총액 계산
  const totalCash = useMemo(() => {
    return denominationAmounts.reduce((sum, d) => sum + d.amount, 0)
  }, [denominationAmounts])

  // 차액 계산 (금일 잔액 - 전일 이월액)
  const balanceDifference = useMemo(() => {
    return cashRegisterData.current_balance - cashRegisterData.previous_balance
  }, [cashRegisterData.current_balance, cashRegisterData.previous_balance])

  // 예상 잔액과 실제 잔액의 차이 (실제 잔액 - (전일 이월액 + 현금 총액))
  // 이 값이 0이면 정확히 맞음, 양수면 돈이 더 있음, 음수면 돈이 부족함
  const expectedVsActual = useMemo(() => {
    const expectedBalance = cashRegisterData.previous_balance + totalCash
    return cashRegisterData.current_balance - expectedBalance
  }, [cashRegisterData.previous_balance, cashRegisterData.current_balance, totalCash])

  const updateDenomination = (key: DenominationKey, value: number) => {
    onCashRegisterDataChange({
      ...cashRegisterData,
      [key]: Math.max(0, value)
    })
  }

  const updateBalance = (field: 'previous_balance' | 'current_balance', value: number) => {
    onCashRegisterDataChange({
      ...cashRegisterData,
      [field]: Math.max(0, value)
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

  return (
    <div className="space-y-4">
      {/* 화폐별 개수 입력 - 데스크탑 */}
      <div className="hidden sm:block">
        <h4 className="text-sm font-medium text-slate-700 mb-3">화폐별 개수</h4>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">화폐</th>
                <th className="px-4 py-2 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider w-32">개수</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider w-40">금액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {denominationAmounts.map((denom) => (
                <tr key={denom.key} className="hover:bg-slate-50/50 transition-colors">
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
                      onChange={(e) => updateDenomination(denom.key, parseInt(e.target.value) || 0)}
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
              <tr className="bg-blue-50 font-medium">
                <td className="px-4 py-3 text-blue-800" colSpan={2}>
                  현금 총액
                </td>
                <td className="px-4 py-3 text-right font-mono text-blue-800 text-lg">
                  {formatCurrency(totalCash)}원
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 화폐별 개수 입력 - 모바일 */}
      <div className="sm:hidden">
        <h4 className="text-sm font-medium text-slate-700 mb-3">화폐별 개수</h4>
        <div className="grid grid-cols-2 gap-2">
          {denominationAmounts.map((denom) => (
            <div key={denom.key} className="border border-slate-200 rounded-lg p-3 bg-white">
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
                onChange={(e) => updateDenomination(denom.key, parseInt(e.target.value) || 0)}
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
        <div className="mt-3 bg-blue-50 rounded-lg p-3 flex justify-between items-center">
          <span className="text-sm font-medium text-blue-800">현금 총액</span>
          <span className="text-lg font-mono font-bold text-blue-800">{formatCurrency(totalCash)}원</span>
        </div>
      </div>

      {/* 이월액/잔액 입력 */}
      <div>
        <h4 className="text-sm font-medium text-slate-700 mb-3">이월액 및 잔액</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* 전일 이월액 */}
          <div className="bg-slate-50 rounded-lg p-4">
            <label className="block text-xs font-medium text-slate-600 mb-2">
              전일 이월액
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={cashRegisterData.previous_balance || ''}
                onChange={(e) => updateBalance('previous_balance', parseInt(e.target.value) || 0)}
                placeholder="0"
                readOnly={isReadOnly}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">원</span>
            </div>
            <div className="mt-2 text-right text-xs text-slate-500 font-mono">
              {formatCurrency(cashRegisterData.previous_balance)}원
            </div>
          </div>

          {/* 금일 잔액 */}
          <div className="bg-slate-50 rounded-lg p-4">
            <label className="block text-xs font-medium text-slate-600 mb-2">
              금일 잔액
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={cashRegisterData.current_balance || ''}
                onChange={(e) => updateBalance('current_balance', parseInt(e.target.value) || 0)}
                placeholder="0"
                readOnly={isReadOnly}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">원</span>
            </div>
            <div className="mt-2 text-right text-xs text-slate-500 font-mono">
              {formatCurrency(cashRegisterData.current_balance)}원
            </div>
          </div>
        </div>
      </div>

      {/* 차액 계산 결과 */}
      <div className="bg-gradient-to-r from-slate-100 to-slate-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-slate-700 mb-3">계산 결과</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* 잔액 차이 */}
          <div className="bg-white rounded-lg p-3 border border-slate-200">
            <div className="text-xs text-slate-500 mb-1">잔액 변동 (금일 - 전일)</div>
            <div className={`text-lg font-mono font-bold ${
              balanceDifference > 0 ? 'text-green-600' :
              balanceDifference < 0 ? 'text-red-600' : 'text-slate-600'
            }`}>
              {balanceDifference > 0 ? '+' : ''}{formatCurrency(balanceDifference)}원
            </div>
          </div>

          {/* 과부족액 */}
          <div className="bg-white rounded-lg p-3 border border-slate-200">
            <div className="text-xs text-slate-500 mb-1">과부족액 (실제 - 예상)</div>
            <div className={`text-lg font-mono font-bold ${
              expectedVsActual > 0 ? 'text-blue-600' :
              expectedVsActual < 0 ? 'text-red-600' : 'text-green-600'
            }`}>
              {expectedVsActual > 0 ? '+' : ''}{formatCurrency(expectedVsActual)}원
              {expectedVsActual === 0 && <span className="text-xs ml-2 text-green-600">정확</span>}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              예상: {formatCurrency(cashRegisterData.previous_balance + totalCash)}원
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
