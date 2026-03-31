'use client'

import { useState, useEffect } from 'react'

type Period = 'day' | 'week' | 'month'

interface ChartDataPoint {
  label: string
  usd: number
  krw: number
}

interface ChartResponse {
  breakdown?: { date: string; costUsd: number; costKrw: number; callCount: number }[]
  exchangeRate?: number
}

const PERIOD_LABELS: Record<Period, string> = {
  day: '일별',
  week: '주별',
  month: '월별',
}

function formatUsd(amount: number) {
  return `$${amount.toFixed(4)}`
}

function formatKrw(amount: number) {
  return `₩${Math.round(amount).toLocaleString('ko-KR')}`
}

interface BarProps {
  point: ChartDataPoint
  maxUsd: number
}

function Bar({ point, maxUsd }: BarProps) {
  const [hovered, setHovered] = useState(false)
  const heightPct = maxUsd > 0 ? (point.usd / maxUsd) * 100 : 0

  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-w-0 group relative">
      {/* 툴팁 */}
      {hovered && (
        <div className="absolute bottom-full mb-2 z-10 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg pointer-events-none">
          <div className="font-medium">{point.label}</div>
          <div>{formatUsd(point.usd)}</div>
          <div className="text-slate-300">{formatKrw(point.krw)}</div>
          {/* 말풍선 화살표 */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
        </div>
      )}

      {/* 막대 영역 (높이 고정) */}
      <div className="w-full flex items-end justify-center" style={{ height: '160px' }}>
        <div
          className="w-4/5 rounded-t-md bg-emerald-400 hover:bg-emerald-500 transition-colors cursor-pointer"
          style={{ height: `${Math.max(heightPct, point.usd > 0 ? 2 : 0)}%` }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        />
      </div>

      {/* X축 레이블 */}
      <div className="text-xs text-slate-400 truncate w-full text-center">{point.label}</div>
    </div>
  )
}

function SkeletonChart() {
  return (
    <div className="animate-pulse">
      <div className="flex items-end gap-1 h-40">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-slate-200 rounded-t-md"
            style={{ height: `${20 + Math.random() * 60}%` }}
          />
        ))}
      </div>
      <div className="flex gap-1 mt-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex-1 h-3 bg-slate-200 rounded" />
        ))}
      </div>
    </div>
  )
}

export default function CostChart() {
  const [period, setPeriod] = useState<Period>('day')
  const [points, setPoints] = useState<ChartDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchChart = async () => {
      setLoading(true)
      setError(null)
      try {
        const today = new Date().toISOString().split('T')[0]
        const res = await fetch(`/api/marketing/costs?period=${period}&date=${today}`)
        const json: ChartResponse = await res.json()
        const exchangeRate = json?.exchangeRate ?? 1380
        setPoints((json?.breakdown ?? []).map(b => ({
          label: b.date.slice(5), // MM-DD
          usd: b.costUsd,
          krw: b.costKrw || b.costUsd * exchangeRate,
        })))
      } catch (err) {
        console.error('차트 데이터 로딩 실패:', err)
        setError('차트 데이터를 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }

    fetchChart()
  }, [period])

  const maxUsd = points.length > 0 ? Math.max(...points.map((p) => p.usd), 0.000001) : 0.000001
  const totalUsd = points.reduce((sum, p) => sum + p.usd, 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">기간별 비용 추이</h2>
          {!loading && !error && (
            <p className="text-xs text-slate-400 mt-0.5">
              합계: {formatUsd(totalUsd)}
            </p>
          )}
        </div>

        {/* 탭 */}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
          {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                period === key
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 차트 영역 */}
      {loading ? (
        <SkeletonChart />
      ) : error ? (
        <div className="flex items-center justify-center h-40 text-sm text-red-500">{error}</div>
      ) : points.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-sm text-slate-400">
          데이터가 없습니다.
        </div>
      ) : (
        <div className="flex gap-1 items-end">
          {points.map((point, i) => (
            <Bar key={i} point={point} maxUsd={maxUsd} />
          ))}
        </div>
      )}
    </div>
  )
}
