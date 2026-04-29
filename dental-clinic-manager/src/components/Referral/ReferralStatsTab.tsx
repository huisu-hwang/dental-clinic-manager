'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, Loader2 } from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { referralService } from '@/lib/referralService'
import type { MonthlyStatRow } from '@/types/referral'

interface Props {
  clinicId: string
  refreshKey: number
}

export default function ReferralStatsTab({ clinicId, refreshKey }: Props) {
  const [rows, setRows] = useState<MonthlyStatRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    referralService.monthlyStats(clinicId, 12)
      .then(d => { if (!cancelled) setRows(d) })
      .catch(e => { console.error(e); if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [clinicId, refreshKey])

  const chartData = rows.map(r => ({
    name: r.year_month.slice(2).replace('-', '/'),
    소개: r.referral_count,
    결제전환: r.paid_count,
    전환율: r.referral_count > 0 ? Math.round((r.paid_count / r.referral_count) * 1000) / 10 : 0,
  }))

  const totalReferrals = rows.reduce((s, r) => s + r.referral_count, 0)
  const totalPaid = rows.reduce((s, r) => s + r.paid_count, 0)
  const overallRate = totalReferrals > 0 ? Math.round((totalPaid / totalReferrals) * 1000) / 10 : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard label="총 소개 (12개월)" value={`${totalReferrals}건`} tone="accent" />
        <SummaryCard label="첫 결제 전환" value={`${totalPaid}건`} tone="success" />
        <SummaryCard label="평균 전환율" value={`${overallRate}%`} tone="purple" />
      </div>

      <div className="rounded-xl border border-[var(--at-border)] bg-white p-5 shadow-[var(--shadow-at-soft)]">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--at-success-bg)] text-[var(--at-success)]">
            <TrendingUp className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[var(--at-text-primary)]">월별 소개 → 첫 결제 전환</h2>
            <p className="text-xs text-[var(--at-text-secondary)]">최근 12개월 추이입니다. 첫 결제일은 수동 또는 외부 동기화로 채워집니다.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex h-72 items-center justify-center text-[var(--at-text-weak)]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-[var(--at-text-weak)]">
            데이터가 없습니다.
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--at-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--at-text-secondary)' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12, fill: 'var(--at-text-secondary)' }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: 'var(--at-text-secondary)' }} unit="%" />
                <Tooltip
                  contentStyle={{
                    background: 'white',
                    border: '1px solid var(--at-border)',
                    borderRadius: '0.5rem',
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="소개" fill="#1b61c9" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="left" dataKey="결제전환" fill="#1b7a3d" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="전환율" stroke="#6b3fa0" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'accent' | 'success' | 'purple' }) {
  const toneMap = {
    accent: 'text-[var(--at-accent)] bg-[var(--at-accent-tag)]',
    success: 'text-[var(--at-success)] bg-[var(--at-success-bg)]',
    purple: 'text-[var(--at-purple)] bg-[#f3eaff]',
  } as const
  return (
    <div className="rounded-xl border border-[var(--at-border)] bg-white p-4 shadow-[var(--shadow-at-soft)]">
      <div className={`mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${toneMap[tone]}`}>{label}</div>
      <div className="text-2xl font-semibold text-[var(--at-text-primary)]">{value}</div>
    </div>
  )
}
