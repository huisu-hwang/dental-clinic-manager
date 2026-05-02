'use client'
import { useEffect, useState } from 'react'
import { TrendingUp, RefreshCw } from 'lucide-react'
import type { SubscriptionPlan } from '@/types/subscription'

interface Props {
  plans: SubscriptionPlan[]
  onSelect: (plan: SubscriptionPlan) => void
}

interface Snapshot {
  year: number
  month: number
  realized_profit: number
  unrealized_profit: number
  expected_fee: number
}

export default function PerformanceSection({ plans, onSelect }: Props) {
  const investment = plans.find((p) => p.feature_id === 'investment')
  const [current, setCurrent] = useState<Snapshot | null>(null)
  const [history, setHistory] = useState<Snapshot[]>([])
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    try {
      const res = await fetch('/api/investment/profit-snapshot/latest?months=4')
      if (!res.ok) return
      const data: Snapshot[] = await res.json()
      const [first, ...rest] = data
      setCurrent(first ?? null)
      setHistory(rest)
    } catch {
      // ignore
    }
  }
  useEffect(() => { load() }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await fetch('/api/investment/profit-snapshot/refresh', { method: 'POST' })
      await load()
    } finally { setRefreshing(false) }
  }

  if (!investment) return null

  return (
    <section aria-labelledby="performance-heading" className="space-y-3">
      <div className="rounded-md bg-emerald-500/10 px-3 py-2">
        <h2 id="performance-heading" className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
          <TrendingUp className="h-4 w-4" /> 성과 연동
        </h2>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/30">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">주식 자동매매</div>
            <div className="mt-1 text-sm font-bold text-gray-900 dark:text-gray-100">구독료 0원 · 수익의 5%</div>
            <div className="text-xs text-gray-600 dark:text-gray-300">매월 실현 수익이 있을 때만 정산됩니다.</div>
          </div>
          <button type="button" onClick={() => onSelect(investment)}
            className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700">
            시작하기
          </button>
        </div>

        <div className="mt-4 border-t border-emerald-200 pt-3 text-sm dark:border-emerald-800">
          <div className="flex items-center justify-between">
            <div>이번 달 ({current ? `${current.year}-${String(current.month).padStart(2, '0')}` : '—'})</div>
            <button type="button" onClick={handleRefresh} disabled={refreshing}
              className="flex items-center gap-1 text-xs text-emerald-700 hover:underline">
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> 새로고침
            </button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div>실현 수익<br/><b>{(current?.realized_profit ?? 0).toLocaleString()}원</b></div>
            <div>평가 수익<br/><span>{(current?.unrealized_profit ?? 0).toLocaleString()}원</span></div>
            <div>예정 정산 5%<br/><b>{(current?.expected_fee ?? 0).toLocaleString()}원</b></div>
          </div>
        </div>

        {history.length > 0 && (
          <div className="mt-4 border-t border-emerald-200 pt-3 text-xs dark:border-emerald-800">
            <div className="mb-1 font-semibold">지난 3개월</div>
            <ul className="space-y-1">
              {history.slice(0, 3).map((h) => (
                <li key={`${h.year}-${h.month}`} className="flex justify-between">
                  <span>{h.year}-{String(h.month).padStart(2, '0')}</span>
                  <span>수익 {h.realized_profit.toLocaleString()} / 정산 {h.expected_fee.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
