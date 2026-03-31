'use client'

import { useState, useEffect } from 'react'
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline'

interface PeriodCost {
  totalUsd: number
  totalKrw: number
  changePercent: number | null
}

interface SummaryData {
  today: PeriodCost
  week: PeriodCost
  month: PeriodCost
  exchangeRate: number
}

function formatUsd(amount: number) {
  return `$${amount.toFixed(4)}`
}

function formatKrw(amount: number) {
  return `₩${Math.round(amount).toLocaleString('ko-KR')}`
}

function ChangeIndicator({ percent }: { percent: number | null }) {
  if (percent === null) return null
  if (percent === 0) return <span className="text-xs text-slate-400">변동 없음</span>

  const isUp = percent > 0
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${isUp ? 'text-red-500' : 'text-emerald-600'}`}>
      {isUp ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />}
      {Math.abs(percent).toFixed(1)}%
    </span>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
      <div className="h-4 bg-slate-200 rounded w-24 mb-4" />
      <div className="h-8 bg-slate-200 rounded w-32 mb-2" />
      <div className="h-4 bg-slate-200 rounded w-24 mb-3" />
      <div className="h-3 bg-slate-200 rounded w-16" />
    </div>
  )
}

interface CardProps {
  label: string
  compareLabel: string
  data: PeriodCost
  accentColor: string
}

function SummaryCard({ label, compareLabel, data, accentColor }: CardProps) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-5 border-l-4 ${accentColor}`}>
      <div className="text-sm font-medium text-slate-500 mb-3">{label}</div>
      <div className="text-2xl font-bold text-slate-800 mb-1">{formatUsd(data.totalUsd)}</div>
      <div className="text-sm text-slate-500 mb-3">{formatKrw(data.totalKrw)}</div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">{compareLabel} 대비</span>
        <ChangeIndicator percent={data.changePercent} />
      </div>
    </div>
  )
}

export default function CostSummaryCards() {
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSummary = async () => {
      setLoading(true)
      setError(null)
      try {
        const today = new Date().toISOString().split('T')[0]
        const [dayRes, weekRes, monthRes, settingsRes] = await Promise.all([
          fetch(`/api/marketing/costs?period=day&date=${today}`),
          fetch(`/api/marketing/costs?period=week&date=${today}`),
          fetch(`/api/marketing/costs?period=month&date=${today}`),
          fetch('/api/marketing/costs/settings'),
        ])

        const [dayJson, weekJson, monthJson, settingsJson] = await Promise.all([
          dayRes.json(),
          weekRes.json(),
          monthRes.json(),
          settingsRes.json(),
        ])

        const exchangeRate = settingsJson?.data?.find((s: { model: string; usd_to_krw: number }) => s.model === 'exchange_rate')?.usd_to_krw ?? 1380

        const toKrw = (usd: number) => usd * exchangeRate

        const extractPeriod = (json: { data?: { totalUsd?: number; changePercent?: number } }): PeriodCost => {
          const totalUsd = json?.data?.totalUsd ?? 0
          return {
            totalUsd,
            totalKrw: toKrw(totalUsd),
            changePercent: json?.data?.changePercent ?? null,
          }
        }

        setData({
          today: extractPeriod(dayJson),
          week: extractPeriod(weekJson),
          month: extractPeriod(monthJson),
          exchangeRate,
        })
      } catch (err) {
        console.error('비용 요약 로딩 실패:', err)
        setError('데이터를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }

    fetchSummary()
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
        {error ?? '데이터를 불러오지 못했습니다.'}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <SummaryCard
        label="오늘 총 비용"
        compareLabel="전일"
        data={data.today}
        accentColor="border-l-emerald-400"
      />
      <SummaryCard
        label="이번 주 총 비용"
        compareLabel="전주"
        data={data.week}
        accentColor="border-l-blue-400"
      />
      <SummaryCard
        label="이번 달 총 비용"
        compareLabel="전월"
        data={data.month}
        accentColor="border-l-purple-400"
      />
    </div>
  )
}
