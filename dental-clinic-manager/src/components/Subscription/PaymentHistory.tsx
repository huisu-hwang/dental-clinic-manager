'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Clock, RefreshCw, Receipt } from 'lucide-react'
import type { SubscriptionStatusResponse } from '@/types/subscription'

const PAYMENT_STATUS = {
  paid: { label: '결제 완료', color: 'text-green-600', icon: CheckCircle },
  failed: { label: '결제 실패', color: 'text-red-600', icon: XCircle },
  cancelled: { label: '취소', color: 'text-gray-500', icon: XCircle },
  refunded: { label: '환불', color: 'text-gray-500', icon: XCircle },
  pending: { label: '처리 중', color: 'text-amber-600', icon: Clock },
} as const

export default function PaymentHistory() {
  const [payments, setPayments] = useState<SubscriptionStatusResponse['payments']>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchPayments() {
      try {
        const res = await fetch('/api/subscription/status')
        const data: SubscriptionStatusResponse = await res.json()
        setPayments(data.payments ?? [])
      } catch {
        // 오류 무시
      } finally {
        setLoading(false)
      }
    }
    fetchPayments()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (payments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <Receipt className="mb-2 h-10 w-10" />
        <p className="text-sm">결제 내역이 없습니다</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-600">결제일</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">내용</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">금액</th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">상태</th>
            <th className="px-4 py-3 text-center font-medium text-gray-600">세금계산서</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {payments.map(payment => {
            const statusConfig =
              PAYMENT_STATUS[payment.status as keyof typeof PAYMENT_STATUS] ?? PAYMENT_STATUS.pending
            const StatusIcon = statusConfig.icon
            const date = payment.paid_at || payment.failed_at || payment.created_at

            return (
              <tr key={payment.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600">
                  {date ? new Date(date).toLocaleDateString('ko-KR') : '-'}
                </td>
                <td className="px-4 py-3 text-gray-800">
                  {payment.order_name ?? '-'}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  {payment.amount.toLocaleString()}원
                </td>
                <td className="px-4 py-3">
                  <div className={`flex items-center justify-center gap-1 ${statusConfig.color}`}>
                    <StatusIcon className="h-3.5 w-3.5" />
                    <span className="text-xs">{statusConfig.label}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  {payment.tax_invoice_num ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      발행됨
                    </span>
                  ) : payment.status === 'paid' ? (
                    <span className="text-xs text-gray-400">발행 예정</span>
                  ) : (
                    <span className="text-xs text-gray-300">-</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
