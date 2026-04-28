'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import type { MonthlyAgeGroupPoint } from '@/types/monthlyReport'
import { AGE_GROUP_ORDER, AGE_GROUP_LABELS, AGE_GROUP_COLORS } from '@/types/monthlyReport'

interface AgeDistributionChartProps {
  data: MonthlyAgeGroupPoint[]
  targetYear: number
  targetMonth: number
}

function monthLabel(year: number, month: number): string {
  return `${String(year).slice(2)}.${String(month).padStart(2, '0')}`
}

export default function AgeDistributionChart({ data, targetYear, targetMonth }: AgeDistributionChartProps) {
  const target = data.find((d) => d.year === targetYear && d.month === targetMonth)
  const targetSlices = target
    ? AGE_GROUP_ORDER
        .filter((g) => target.groups[g] > 0)
        .map((g) => ({
          name: AGE_GROUP_LABELS[g],
          key: g,
          value: target.groups[g],
        }))
    : []

  // 12개월 100% Stacked
  const stackedData = data.map((point) => {
    const row: Record<string, number | string> = { label: monthLabel(point.year, point.month) }
    for (const g of AGE_GROUP_ORDER) {
      const v = point.groups[g] ?? 0
      row[g] = point.total > 0 ? Math.round((v / point.total) * 1000) / 10 : 0
    }
    return row
  })

  const hasAny = data.some((p) => p.total > 0)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>신환 연령대 (이번 달)</CardTitle>
        </CardHeader>
        <CardContent>
          {targetSlices.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-at-text-secondary text-sm">
              이번 달 신환 데이터가 없습니다
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={targetSlices}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={45}
                    dataKey="value"
                    nameKey="name"
                    label={(entry) => `${entry.name}: ${entry.value}`}
                  >
                    {targetSlices.map((s) => (
                      <Cell key={s.key} fill={AGE_GROUP_COLORS[s.key]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${Number(value)}명`, '']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          {target?.avg_age !== null && target?.avg_age !== undefined && (
            <p className="text-xs text-at-text-secondary text-center mt-2">
              평균 연령: <span className="font-semibold text-at-text">{target.avg_age.toFixed(1)}세</span>
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>신환 연령대 변화 (12개월 비율)</CardTitle>
        </CardHeader>
        <CardContent>
          {!hasAny ? (
            <div className="h-72 flex items-center justify-center text-at-text-secondary text-sm">
              신환 데이터가 없습니다
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stackedData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
                  <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <Tooltip
                    formatter={(value, name) => {
                      const key = String(name) as keyof typeof AGE_GROUP_LABELS
                      const label = AGE_GROUP_LABELS[key] ?? String(name)
                      return [`${Number(value).toFixed(1)}%`, label]
                    }}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
                  />
                  <Legend formatter={(value: string) => AGE_GROUP_LABELS[value as keyof typeof AGE_GROUP_LABELS] ?? value} />
                  {AGE_GROUP_ORDER.map((g) => (
                    <Bar
                      key={g}
                      dataKey={g}
                      stackId="age"
                      fill={AGE_GROUP_COLORS[g]}
                      name={g}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
