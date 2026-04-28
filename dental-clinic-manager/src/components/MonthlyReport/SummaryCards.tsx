'use client'

import { Card, CardContent } from '@/components/ui/card'
import type { MonthlyReportSummary } from '@/types/monthlyReport'
import { TrendingUp, TrendingDown, Wallet, UserPlus, Compass, Cake } from 'lucide-react'

interface SummaryCardsProps {
  summary: MonthlyReportSummary
}

function formatKrw(value: number): string {
  if (!Number.isFinite(value)) return '0원'
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(1)}억`
  }
  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(0)}만`
  }
  return `${value.toLocaleString()}`
}

function DeltaPill({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null || !Number.isFinite(pct)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-at-text-weak">
        <span>—</span>
        <span>{label}</span>
      </span>
    )
  }
  const positive = pct >= 0
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        positive ? 'text-emerald-600' : 'text-rose-600'
      }`}
    >
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      <span>{positive ? '+' : ''}{pct.toFixed(1)}%</span>
      <span className="text-at-text-weak">{label}</span>
    </span>
  )
}

export default function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-5 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-at-text-secondary">총 매출</p>
          </div>
          <p className="text-2xl font-bold text-at-text">
            {summary.has_revenue_data ? `${formatKrw(summary.total_revenue)}원` : '데이터 없음'}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <DeltaPill pct={summary.total_revenue_mom_pct} label="전월 대비" />
            <DeltaPill pct={summary.total_revenue_yoy_pct} label="전년 동월" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-sm font-medium text-at-text-secondary">신환 수</p>
          </div>
          <p className="text-2xl font-bold text-at-text">
            {summary.has_new_patient_data ? `${summary.new_patient_count}명` : '데이터 없음'}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <DeltaPill pct={summary.new_patient_mom_pct} label="전월 대비" />
            <DeltaPill pct={summary.new_patient_yoy_pct} label="전년 동월" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Compass className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-sm font-medium text-at-text-secondary">주요 유입경로</p>
          </div>
          {summary.has_acquisition_channel_data && summary.top_channel ? (
            <>
              <p className="text-2xl font-bold text-at-text">{summary.top_channel}</p>
              <p className="text-xs text-at-text-secondary">
                {summary.top_channel_pct !== null
                  ? `전체 신환의 ${summary.top_channel_pct.toFixed(1)}% · 총 ${summary.channel_count}개 경로`
                  : `총 ${summary.channel_count}개 경로`}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-at-text-weak">데이터 없음</p>
              <p className="text-xs text-at-text-secondary">덴트웹 동기화 후 표시됩니다</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Cake className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-sm font-medium text-at-text-secondary">평균 연령</p>
          </div>
          {summary.avg_age !== null ? (
            <>
              <p className="text-2xl font-bold text-at-text">{summary.avg_age.toFixed(1)}세</p>
              <p className="text-xs text-at-text-secondary">신환 등록 시점 기준</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-at-text-weak">—</p>
              <p className="text-xs text-at-text-secondary">생년월일 데이터 없음</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
