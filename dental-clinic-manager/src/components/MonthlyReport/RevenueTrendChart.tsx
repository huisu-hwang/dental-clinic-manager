'use client'

import { useMemo, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import type { MonthlyRevenuePoint } from '@/types/monthlyReport'

interface RevenueTrendChartProps {
  data: MonthlyRevenuePoint[]
  targetYear: number
  targetMonth: number
}

type ViewMode = 'timeline' | 'overlay'

function formatKrwShort(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`
  if (value >= 10_000) return `${Math.round(value / 10_000).toLocaleString()}만`
  return value.toLocaleString()
}

function timelineLabel(year: number, month: number): string {
  return `${String(year).slice(2)}.${String(month).padStart(2, '0')}`
}

const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

// 연도별 라인 색상 — 진하기로 시간 흐름 표현 (오래된 → 옅게, 최근 → 진하게)
const YEAR_COLOR_PALETTE = ['#86efac', '#34d399', '#10b981', '#059669']

export default function RevenueTrendChart({ data, targetYear, targetMonth }: RevenueTrendChartProps) {
  const [view, setView] = useState<ViewMode>('timeline')

  // 시계열 데이터 (전체 기간을 그대로 시간순으로)
  const timelineData = useMemo(() => data.map((d) => ({
    label: timelineLabel(d.year, d.month),
    year: d.year,
    month: d.month,
    total: d.total_revenue,
    isTarget: d.year === targetYear && d.month === targetMonth,
  })), [data, targetYear, targetMonth])

  const targetIndex = timelineData.findIndex((d) => d.isTarget)
  const hasData = timelineData.some((d) => d.total > 0)
  const monthsCount = timelineData.length
  const xInterval = monthsCount > 24 ? 2 : monthsCount > 12 ? 1 : 0

  // 겹쳐보기 데이터: target 기준 최근 3개 연도를 1~12월 X축에 동시에 그리기
  const overlay = useMemo(() => {
    const years: number[] = []
    for (let i = 2; i >= 0; i--) years.push(targetYear - i)
    const valueByYearMonth = new Map<string, number>()
    for (const d of data) {
      valueByYearMonth.set(`${d.year}-${d.month}`, d.total_revenue)
    }
    const rows = MONTH_LABELS.map((label, idx) => {
      const m = idx + 1
      const row: Record<string, string | number | null> = { month: label }
      for (const y of years) {
        const v = valueByYearMonth.get(`${y}-${m}`)
        row[String(y)] = v === undefined ? null : v
      }
      return row
    })
    return { years, rows }
  }, [data, targetYear])

  const overlayHasData = overlay.years.some((y) =>
    overlay.rows.some((row) => typeof row[String(y)] === 'number' && (row[String(y)] as number) > 0),
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>월 매출 변화</CardTitle>
          <div className="inline-flex rounded-xl bg-at-surface-alt p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setView('timeline')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                view === 'timeline'
                  ? 'bg-white text-at-text shadow-sm'
                  : 'text-at-text-secondary hover:text-at-text'
              }`}
            >
              최근 3개년 추이
            </button>
            <button
              type="button"
              onClick={() => setView('overlay')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                view === 'overlay'
                  ? 'bg-white text-at-text shadow-sm'
                  : 'text-at-text-secondary hover:text-at-text'
              }`}
            >
              연도별 겹쳐보기
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {view === 'timeline' ? (
          !hasData ? (
            <div className="h-72 flex items-center justify-center text-at-text-secondary text-sm">
              매출 데이터가 없습니다. 경영 현황에서 월별 매출을 입력하세요.
            </div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" stroke="#6b7280" fontSize={11} interval={xInterval} minTickGap={20} />
                  <YAxis stroke="#6b7280" fontSize={12} tickFormatter={formatKrwShort} />
                  <Tooltip
                    formatter={(value) => [`${Number(value).toLocaleString()}원`, '총 매출']}
                    labelFormatter={(label) => `20${label}`}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
                  />
                  {targetIndex >= 0 && (
                    <ReferenceLine x={timelineData[targetIndex].label} stroke="#6366f1" strokeDasharray="3 3" />
                  )}
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fill="url(#revenueGradient)"
                    dot={{ r: 2.5, fill: '#10b981' }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )
        ) : (
          !overlayHasData ? (
            <div className="h-72 flex items-center justify-center text-at-text-secondary text-sm">
              비교할 데이터가 부족합니다. 매출 동기화가 완료되면 자동 표시됩니다.
            </div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overlay.rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#6b7280" fontSize={12} />
                  <YAxis stroke="#6b7280" fontSize={12} tickFormatter={formatKrwShort} />
                  <Tooltip
                    formatter={(value, name) => {
                      if (value === null || value === undefined) return ['—', `${name}년`]
                      return [`${Number(value).toLocaleString()}원`, `${name}년`]
                    }}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
                  />
                  <Legend formatter={(value: string) => `${value}년`} />
                  {overlay.years.map((y, idx) => {
                    const isTargetYear = y === targetYear
                    return (
                      <Line
                        key={y}
                        type="monotone"
                        dataKey={String(y)}
                        name={String(y)}
                        stroke={YEAR_COLOR_PALETTE[idx + (4 - overlay.years.length)] ?? '#10b981'}
                        strokeWidth={isTargetYear ? 3 : 2}
                        dot={{ r: isTargetYear ? 4 : 3 }}
                        activeDot={{ r: 6 }}
                        connectNulls={false}
                      />
                    )
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )
        )}
      </CardContent>
    </Card>
  )
}
