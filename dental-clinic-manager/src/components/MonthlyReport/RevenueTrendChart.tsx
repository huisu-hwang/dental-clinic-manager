'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { MonthlyRevenuePoint } from '@/types/monthlyReport'

interface RevenueTrendChartProps {
  data: MonthlyRevenuePoint[]
  targetYear: number
  targetMonth: number
}

function formatKrwShort(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`
  if (value >= 10_000) return `${Math.round(value / 10_000).toLocaleString()}만`
  return value.toLocaleString()
}

function monthLabel(year: number, month: number): string {
  return `${String(year).slice(2)}.${String(month).padStart(2, '0')}`
}

export default function RevenueTrendChart({ data, targetYear, targetMonth }: RevenueTrendChartProps) {
  const chartData = data.map((d) => ({
    label: monthLabel(d.year, d.month),
    year: d.year,
    month: d.month,
    total: d.total_revenue,
    isTarget: d.year === targetYear && d.month === targetMonth,
  }))

  const targetIndex = chartData.findIndex((d) => d.isTarget)
  const hasData = chartData.some((d) => d.total > 0)
  const monthsCount = chartData.length

  // 36개월 표시 시 모든 라벨을 그리면 빽빽해지므로 일정 간격마다 표시
  const xInterval = monthsCount > 24 ? 2 : monthsCount > 12 ? 1 : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>월 매출 변화 (최근 3개년)</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-72 flex items-center justify-center text-at-text-secondary text-sm">
            매출 데이터가 없습니다. 경영 현황에서 월별 매출을 입력하세요.
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="label"
                  stroke="#6b7280"
                  fontSize={11}
                  interval={xInterval}
                  minTickGap={20}
                />
                <YAxis stroke="#6b7280" fontSize={12} tickFormatter={formatKrwShort} />
                <Tooltip
                  formatter={(value) => [`${Number(value).toLocaleString()}원`, '총 매출']}
                  labelFormatter={(label) => `20${label}`}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
                {targetIndex >= 0 && (
                  <ReferenceLine x={chartData[targetIndex].label} stroke="#6366f1" strokeDasharray="3 3" />
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
        )}
      </CardContent>
    </Card>
  )
}
