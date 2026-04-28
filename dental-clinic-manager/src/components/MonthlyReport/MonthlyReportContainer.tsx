'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/Button'
import { ChevronLeft, ChevronRight, RefreshCw, FileBarChart2 } from 'lucide-react'
import type { MonthlyReport } from '@/types/monthlyReport'
import SummaryCards from './SummaryCards'
import RevenueTrendChart from './RevenueTrendChart'
import NewPatientTrendChart from './NewPatientTrendChart'
import AcquisitionChannelChart from './AcquisitionChannelChart'
import AgeDistributionChart from './AgeDistributionChart'

interface AvailableMonth {
  year: number
  month: number
  generated_at: string
  generated_by: 'cron' | 'manual'
}

export default function MonthlyReportContainer() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { hasPermission, isLoading: permLoading } = usePermissions()

  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [availableMonths, setAvailableMonths] = useState<AvailableMonth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)

  const queryYear = searchParams?.get('year')
  const queryMonth = searchParams?.get('month')

  const canManage = user?.role === 'owner' || user?.role === 'master_admin'

  // 권한 체크
  useEffect(() => {
    if (permLoading) return
    if (!hasPermission('monthly_report_view')) {
      setAccessDenied(true)
    }
  }, [permLoading, hasPermission])

  const loadReport = useCallback(async (year?: number, month?: number) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (year && month) {
        params.set('year', String(year))
        params.set('month', String(month))
      }
      const url = `/api/monthly-report${params.toString() ? `?${params}` : ''}`
      const res = await fetch(url)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? '보고서를 불러오지 못했습니다')
      }
      const json = await res.json()
      setReport(json.report ?? null)
      setAvailableMonths(json.available_months ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (accessDenied) return
    const y = queryYear ? parseInt(queryYear, 10) : undefined
    const m = queryMonth ? parseInt(queryMonth, 10) : undefined
    loadReport(y, m)
  }, [accessDenied, queryYear, queryMonth, loadReport])

  const handleRegenerate = async () => {
    if (!report && !canManage) return
    setRegenerating(true)
    setError(null)
    try {
      const targetYear = report?.year ?? new Date().getFullYear()
      const targetMonth = report?.month ?? Math.max(1, new Date().getMonth())
      const res = await fetch('/api/monthly-report/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: targetYear, month: targetMonth }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? '재생성 실패')
      }
      const json = await res.json()
      setReport(json.report)
      // 사용 가능한 월 목록도 재조회
      await loadReport(targetYear, targetMonth)
    } catch (e) {
      setError(e instanceof Error ? e.message : '재생성 중 오류 발생')
    } finally {
      setRegenerating(false)
    }
  }

  const handleGenerateLatest = async () => {
    setRegenerating(true)
    setError(null)
    try {
      // 직전 달 생성
      const now = new Date()
      let year = now.getFullYear()
      let month = now.getMonth() // 0-11이므로 직전월은 그대로
      if (month === 0) {
        year -= 1
        month = 12
      }
      const res = await fetch('/api/monthly-report/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error ?? '생성 실패')
      }
      const json = await res.json()
      setReport(json.report)
      await loadReport(year, month)
    } catch (e) {
      setError(e instanceof Error ? e.message : '생성 중 오류 발생')
    } finally {
      setRegenerating(false)
    }
  }

  const navigateMonth = (delta: number) => {
    if (!report) return
    let y = report.year
    let m = report.month + delta
    if (m > 12) {
      m = 1
      y += 1
    } else if (m < 1) {
      m = 12
      y -= 1
    }
    const params = new URLSearchParams()
    params.set('year', String(y))
    params.set('month', String(m))
    router.push(`/dashboard/monthly-report?${params}`)
  }

  const monthOptions = useMemo(() => {
    return availableMonths.map((m) => ({
      value: `${m.year}-${m.month}`,
      label: `${m.year}년 ${m.month}월`,
      year: m.year,
      month: m.month,
    }))
  }, [availableMonths])

  if (permLoading || loading) {
    return (
      <div className="p-4 sm:p-6 min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent" />
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-at-text-secondary">월간 성과 보고서 조회 권한이 없습니다.</p>
            <Button onClick={() => router.push('/dashboard')} className="mt-4">대시보드로</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-screen-2xl mx-auto">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <FileBarChart2 className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-at-text">월간 성과 보고서</h1>
            <p className="text-sm text-at-text-secondary">매출·신환·유입경로·연령대를 한눈에</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {report && monthOptions.length > 1 && (
            <select
              value={`${report.year}-${report.month}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-').map(Number)
                navigateMonth(0)
                router.push(`/dashboard/monthly-report?year=${y}&month=${m}`)
              }}
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-at-text"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
          {report && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)} aria-label="이전 달">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => navigateMonth(1)} aria-label="다음 달">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
          {canManage && report && (
            <Button
              variant="outline"
              onClick={handleRegenerate}
              disabled={regenerating}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
              재생성
            </Button>
          )}
        </div>
      </div>

      {/* 에러 표시 */}
      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-red-600">{error}</CardContent>
        </Card>
      )}

      {/* 보고서 없음 상태 */}
      {!report && (
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <FileBarChart2 className="w-12 h-12 text-at-text-weak mx-auto" />
            <div>
              <p className="text-at-text font-semibold">아직 생성된 보고서가 없습니다</p>
              <p className="text-sm text-at-text-secondary mt-1">
                매월 1일 새벽에 자동 생성됩니다. 지금 직전 달 보고서를 만들어볼 수도 있습니다.
              </p>
            </div>
            {canManage && (
              <Button onClick={handleGenerateLatest} disabled={regenerating} className="gap-2">
                <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
                직전 달 보고서 생성
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* 보고서 본체 */}
      {report && (
        <>
          <div>
            <p className="text-sm text-at-text-secondary mb-1">
              {report.generated_by === 'cron' ? '자동 생성' : '수동 생성'} ·{' '}
              {new Date(report.generated_at).toLocaleString('ko-KR')}
            </p>
            <h2 className="text-lg font-bold text-at-text">
              {report.year}년 {report.month}월 성과
            </h2>
          </div>

          <SummaryCards summary={report.summary} />

          <RevenueTrendChart
            data={report.revenue_data}
            targetYear={report.year}
            targetMonth={report.month}
          />

          <NewPatientTrendChart
            data={report.new_patient_data}
            targetYear={report.year}
            targetMonth={report.month}
          />

          <AcquisitionChannelChart
            data={report.acquisition_channel_data}
            targetYear={report.year}
            targetMonth={report.month}
          />

          <AgeDistributionChart
            data={report.age_distribution_data}
            targetYear={report.year}
            targetMonth={report.month}
          />
        </>
      )}
    </div>
  )
}
