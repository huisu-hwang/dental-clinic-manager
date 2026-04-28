'use client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import type { MonthlyChannelPoint } from '@/types/monthlyReport'

interface AcquisitionChannelChartProps {
  data: MonthlyChannelPoint[]
  targetYear: number
  targetMonth: number
}

const CHANNEL_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#9ca3af']

function monthLabel(year: number, month: number): string {
  return `${String(year).slice(2)}.${String(month).padStart(2, '0')}`
}

export default function AcquisitionChannelChart({ data, targetYear, targetMonth }: AcquisitionChannelChartProps) {
  const target = data.find((d) => d.year === targetYear && d.month === targetMonth)
  const targetChannels = target ? Object.entries(target.channels).map(([name, value]) => ({ name, value })) : []
  const targetSorted = targetChannels.sort((a, b) => b.value - a.value)

  // 모든 채널 키 추출 (정렬: 합계 큰 순)
  const channelTotals = new Map<string, number>()
  for (const point of data) {
    for (const [k, v] of Object.entries(point.channels)) {
      channelTotals.set(k, (channelTotals.get(k) ?? 0) + v)
    }
  }
  const allChannels = Array.from(channelTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)

  // 100% Stacked: 월별 채널 비율
  const stackedData = data.map((point) => {
    const row: Record<string, number | string> = { label: monthLabel(point.year, point.month) }
    const total = point.total
    for (const ch of allChannels) {
      const v = point.channels[ch] ?? 0
      row[ch] = total > 0 ? Math.round((v / total) * 1000) / 10 : 0
    }
    return row
  })

  const hasAnyChannel = allChannels.some((c) => c !== '미분류' && (channelTotals.get(c) ?? 0) > 0)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>유입 경로 분포 (이번 달)</CardTitle>
        </CardHeader>
        <CardContent>
          {!hasAnyChannel ? (
            <div className="h-72 flex flex-col items-center justify-center text-center px-4">
              <p className="text-sm text-at-text-secondary">유입 경로 데이터가 없습니다</p>
              <p className="text-xs text-at-text-weak mt-1">덴트웹 환자 통계의 내원경로/고객구분 컬럼이 동기화되면 자동 표시됩니다</p>
            </div>
          ) : targetSorted.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-at-text-secondary text-sm">
              이번 달 신환 데이터가 없습니다
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={targetSorted}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={45}
                    dataKey="value"
                    nameKey="name"
                    label={(entry) => `${entry.name}: ${entry.value}`}
                  >
                    {targetSorted.map((_, idx) => (
                      <Cell key={idx} fill={CHANNEL_COLORS[idx % CHANNEL_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${Number(value)}명`, '']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>유입 경로 변화 (12개월 비율)</CardTitle>
        </CardHeader>
        <CardContent>
          {!hasAnyChannel ? (
            <div className="h-72 flex items-center justify-center text-at-text-secondary text-sm">
              유입 경로 데이터가 누적되면 추이가 표시됩니다
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stackedData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" stroke="#6b7280" fontSize={12} />
                  <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <Tooltip
                    formatter={(value, name) => [`${Number(value).toFixed(1)}%`, String(name)]}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }}
                  />
                  <Legend />
                  {allChannels.map((ch, idx) => (
                    <Bar
                      key={ch}
                      dataKey={ch}
                      stackId="channel"
                      fill={CHANNEL_COLORS[idx % CHANNEL_COLORS.length]}
                      name={ch}
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
