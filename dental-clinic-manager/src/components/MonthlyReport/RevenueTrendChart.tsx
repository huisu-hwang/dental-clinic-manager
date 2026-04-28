'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
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
    insurance: d.insurance_revenue,
    nonInsurance: d.non_insurance_revenue,
    isTarget: d.year === targetYear && d.month === targetMonth,
  }))

  const targetIndex = chartData.findIndex((d) => d.isTarget)
  const hasData = chartData.some((d) => d.total > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>매출 추이 (최근 12개월)</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-72 flex items-center justify-center text-at-text-secondary text-sm">
            매출 데이터가 없습니다. 경영 현황에서 월별 매출을 입력하세요.
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} tickFormatter={formatKrwShort} />
                <Tooltip
                  formatter={(value) => [`${Number(value).toLocaleString()}원`, '']}
                  labelFormatter={(label) => `20${label}`}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
                <Legend />
                {targetIndex >= 0 && (
                  <ReferenceLine x={chartData[targetIndex].label} stroke="#6366f1" strokeDasharray="3 3" />
                )}
                <Line type="monotone" dataKey="total" name="총 매출" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="insurance" name="보험" stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="nonInsurance" name="비보험" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
