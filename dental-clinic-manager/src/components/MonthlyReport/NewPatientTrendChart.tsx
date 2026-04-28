'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import type { MonthlyNewPatientPoint } from '@/types/monthlyReport'

interface NewPatientTrendChartProps {
  data: MonthlyNewPatientPoint[]
  targetYear: number
  targetMonth: number
}

function monthLabel(year: number, month: number): string {
  return `${String(year).slice(2)}.${String(month).padStart(2, '0')}`
}

function calcAverage(data: MonthlyNewPatientPoint[]): number {
  if (data.length === 0) return 0
  const total = data.reduce((sum, d) => sum + d.count, 0)
  return Math.round((total / data.length) * 10) / 10
}

export default function NewPatientTrendChart({ data, targetYear, targetMonth }: NewPatientTrendChartProps) {
  const chartData = data.map((d) => ({
    label: monthLabel(d.year, d.month),
    year: d.year,
    month: d.month,
    count: d.count,
    isTarget: d.year === targetYear && d.month === targetMonth,
  }))
  const hasData = chartData.some((d) => d.count > 0)
  const avg = calcAverage(data)

  return (
    <Card>
      <CardHeader>
        <CardTitle>신환 수 추이 (최근 12개월)</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-72 flex items-center justify-center text-at-text-secondary text-sm">
            신환 데이터가 없습니다. 덴트웹 동기화를 활성화하면 자동으로 표시됩니다.
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} allowDecimals={false} />
                <Tooltip
                  formatter={(value) => [`${Number(value)}명`, '신환 수']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
                {avg > 0 && (
                  <ReferenceLine
                    y={avg}
                    stroke="#6b7280"
                    strokeDasharray="4 4"
                    label={{ value: `평균 ${avg}명`, position: 'right', fill: '#6b7280', fontSize: 11 }}
                  />
                )}
                <Bar dataKey="count" name="신환 수" radius={[8, 8, 0, 0]}>
                  {chartData.map((d, idx) => (
                    <Cell key={idx} fill={d.isTarget ? '#6366f1' : '#a5b4fc'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
