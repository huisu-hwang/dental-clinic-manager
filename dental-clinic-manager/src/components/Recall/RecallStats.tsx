'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Phone,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Percent,
  Activity,
  PhoneOff,
  UserX,
  AlertCircle,
  MessageSquare,
  Minus
} from 'lucide-react'
import type {
  RecallStats as RecallStatsType,
  RecallPatient,
  PatientRecallStatus,
  RecallStatsPeriod,
  RecallTimeRangeStats,
  RecallDailyTrend
} from '@/types/recall'
import { recallService } from '@/lib/recallService'
import { RECALL_STATUS_LABELS, RECALL_STATUS_COLORS } from '@/types/recall'

interface TodayActivityData {
  totalChanges: number
  appointmentsMade: number
  statusChanges: { status: PatientRecallStatus; count: number }[]
  recentPatients: RecallPatient[]
}

const PERIOD_LABELS: Record<RecallStatsPeriod, string> = {
  daily: '일별',
  weekly: '주별',
  monthly: '월별'
}

const PERIOD_COMPARE_LABELS: Record<RecallStatsPeriod, { current: string; previous: string }> = {
  daily: { current: '오늘', previous: '어제' },
  weekly: { current: '이번 주', previous: '지난 주' },
  monthly: { current: '이번 달', previous: '지난 달' }
}

function calcChangeRate(current: number, previous: number): { rate: number; direction: 'up' | 'down' | 'same' } {
  if (previous === 0 && current === 0) return { rate: 0, direction: 'same' }
  if (previous === 0) return { rate: 100, direction: 'up' }
  const rate = Math.round(((current - previous) / previous) * 100)
  return { rate: Math.abs(rate), direction: rate > 0 ? 'up' : rate < 0 ? 'down' : 'same' }
}

function ChangeIndicator({ current, previous, suffix = '' }: { current: number; previous: number; suffix?: string }) {
  const { rate, direction } = calcChangeRate(current, previous)
  if (direction === 'same') {
    return <span className="text-xs text-at-text-weak flex items-center gap-0.5"><Minus className="w-3 h-3" /> 변동 없음</span>
  }
  const isUp = direction === 'up'
  return (
    <span className={`text-xs flex items-center gap-0.5 ${isUp ? 'text-at-success' : 'text-at-error'}`}>
      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {rate}%{suffix} {isUp ? '증가' : '감소'}
    </span>
  )
}

function TrendChart({ trends }: { trends: RecallDailyTrend[] }) {
  if (trends.length === 0) return null
  const maxTotal = Math.max(...trends.map(t => t.total_processed), 1)

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-1 h-32">
        {trends.map((t, i) => {
          const totalHeight = (t.total_processed / maxTotal) * 100
          const apptHeight = t.total_processed > 0 ? (t.appointment_count / t.total_processed) * totalHeight : 0
          const otherHeight = totalHeight - apptHeight
          const dateObj = new Date(t.date)
          const dayLabel = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`
          const isToday = i === trends.length - 1

          return (
            <div key={t.date} className="flex-1 flex flex-col items-center group relative">
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                <div className="bg-gray-800 text-white text-xs rounded-xl px-2 py-1.5 whitespace-nowrap">
                  <p className="font-medium">{t.date}</p>
                  <p>처리: {t.total_processed}건</p>
                  <p>예약: {t.appointment_count}건</p>
                  <p>성공률: {t.success_rate}%</p>
                </div>
              </div>
              <div className="w-full flex flex-col justify-end h-full">
                {t.total_processed > 0 ? (
                  <>
                    <div className="w-full bg-at-tag rounded-t transition-all" style={{ height: `${otherHeight}%`, minHeight: otherHeight > 0 ? '2px' : 0 }} />
                    <div className="w-full bg-at-success rounded-b transition-all" style={{ height: `${apptHeight}%`, minHeight: apptHeight > 0 ? '2px' : 0 }} />
                  </>
                ) : (
                  <div className="w-full bg-at-surface-alt rounded" style={{ height: '2px' }} />
                )}
              </div>
              <span className={`text-[10px] mt-1 ${isToday ? 'text-at-accent font-bold' : 'text-at-text-weak'}`}>
                {dayLabel}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-center gap-4 text-xs text-at-text-weak">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-at-success rounded-sm inline-block" /> 예약 성공</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-at-tag rounded-sm inline-block" /> 기타 처리</span>
      </div>
    </div>
  )
}

export default function RecallStats() {
  const [stats, setStats] = useState<RecallStatsType | null>(null)
  const [todayActivity, setTodayActivity] = useState<TodayActivityData | null>(null)
  const [period, setPeriod] = useState<RecallStatsPeriod>('daily')
  const [timeRangeStats, setTimeRangeStats] = useState<RecallTimeRangeStats | null>(null)
  const [trends, setTrends] = useState<RecallDailyTrend[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingPeriod, setIsLoadingPeriod] = useState(false)

  const loadStats = useCallback(async () => {
    setIsLoading(true)
    const result = await recallService.patients.getStats()
    if (result.success && result.data) setStats(result.data)
    setIsLoading(false)
  }, [])

  const loadTodayActivity = useCallback(async () => {
    const result = await recallService.patients.getTodayActivity()
    if (result.success && result.data) setTodayActivity(result.data)
  }, [])

  const loadTimeRangeStats = useCallback(async (p: RecallStatsPeriod) => {
    setIsLoadingPeriod(true)
    const result = await recallService.patients.getTimeRangeStats(p)
    if (result.success && result.data) setTimeRangeStats(result.data)
    setIsLoadingPeriod(false)
  }, [])

  const loadTrends = useCallback(async () => {
    const result = await recallService.patients.getDailyTrends(14)
    if (result.success && result.data) setTrends(result.data)
  }, [])

  useEffect(() => {
    loadStats()
    loadTodayActivity()
    loadTrends()
  }, [loadStats, loadTodayActivity, loadTrends])

  useEffect(() => { loadTimeRangeStats(period) }, [period, loadTimeRangeStats])

  const getStatusIcon = (status: PatientRecallStatus) => {
    switch (status) {
      case 'appointment_made': return <Calendar className="w-4 h-4" />
      case 'no_answer': return <PhoneOff className="w-4 h-4" />
      case 'call_rejected': return <Phone className="w-4 h-4" />
      case 'visit_refused': return <UserX className="w-4 h-4" />
      case 'invalid_number': return <AlertCircle className="w-4 h-4" />
      default: return <Activity className="w-4 h-4" />
    }
  }

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-at-accent mx-auto mb-4"></div>
        <p className="text-at-text-weak">통계를 불러오는 중...</p>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="py-12 text-center">
        <BarChart3 className="w-12 h-12 text-at-text-weak mx-auto mb-4" />
        <p className="text-at-text-weak">통계 데이터가 없습니다.</p>
      </div>
    )
  }

  const chartData = [
    { label: '예약 성공', value: stats.appointment_count, color: '#22c55e' },
    { label: '거부/실패', value: stats.rejected_count + stats.invalid_count, color: '#ef4444' },
    { label: '리콜 전', value: stats.pending_count, color: '#9ca3af' },
    { label: '연락 진행', value: stats.contacted_count - stats.appointment_count, color: '#3b82f6' }
  ].filter(d => d.value > 0)

  const total = chartData.reduce((sum, d) => sum + d.value, 0)
  const cur = timeRangeStats?.current
  const prev = timeRangeStats?.previous
  const compareLabels = PERIOD_COMPARE_LABELS[period]

  return (
    <div className="space-y-6">
      {/* 주요 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between">
            <Users className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.total_patients}</span>
          </div>
          <p className="text-blue-100 mt-2">전체 환자</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between">
            <Calendar className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.appointment_count}</span>
          </div>
          <p className="text-green-100 mt-2">예약 성공</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between">
            <Phone className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.contacted_count}</span>
          </div>
          <p className="text-purple-100 mt-2">연락 완료</p>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 text-white">
          <div className="flex items-center justify-between">
            <Percent className="w-8 h-8 opacity-80" />
            <span className="text-3xl font-bold">{stats.success_rate}%</span>
          </div>
          <p className="text-orange-100 mt-2">성공률</p>
        </div>
      </div>

      {/* 기간별 통계 */}
      <div className="bg-white rounded-xl border border-at-border p-6 shadow-at-card">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-at-text flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-at-accent" />
            기간별 리콜 통계
          </h3>
          <div className="flex bg-at-surface-alt rounded-xl p-0.5">
            {(['daily', 'weekly', 'monthly'] as RecallStatsPeriod[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm font-medium rounded-xl transition-all ${
                  period === p ? 'bg-white text-at-accent shadow-sm' : 'text-at-text-weak hover:text-at-text-secondary'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {isLoadingPeriod ? (
          <div className="py-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent mx-auto mb-3"></div>
            <p className="text-at-text-weak text-sm">로딩 중...</p>
          </div>
        ) : cur && prev ? (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-sm text-at-text-weak">
              <Clock className="w-4 h-4" />
              <span className="font-medium text-at-text">{compareLabels.current}</span>
              <span className="text-at-text-weak">({timeRangeStats?.periodLabel})</span>
              <span className="text-at-border">vs</span>
              <span>{compareLabels.previous}</span>
              <span className="text-at-text-weak">({timeRangeStats?.previousLabel})</span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-at-surface-alt rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-at-text-weak">총 처리</span>
                  <Activity className="w-4 h-4 text-at-text-weak" />
                </div>
                <p className="text-2xl font-bold text-at-text">{cur.total_processed}</p>
                <div className="mt-1"><ChangeIndicator current={cur.total_processed} previous={prev.total_processed} /></div>
                <p className="text-xs text-at-text-weak mt-0.5">{compareLabels.previous}: {prev.total_processed}건</p>
              </div>

              <div className="bg-at-success-bg rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-at-text-weak">예약 성공</span>
                  <Calendar className="w-4 h-4 text-at-success" />
                </div>
                <p className="text-2xl font-bold text-at-success">{cur.appointment_count}</p>
                <div className="mt-1"><ChangeIndicator current={cur.appointment_count} previous={prev.appointment_count} /></div>
                <p className="text-xs text-at-text-weak mt-0.5">{compareLabels.previous}: {prev.appointment_count}건</p>
              </div>

              <div className="bg-at-accent-light rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-at-text-weak">성공률</span>
                  <Percent className="w-4 h-4 text-at-accent" />
                </div>
                <p className="text-2xl font-bold text-at-accent">{cur.success_rate}%</p>
                <div className="mt-1"><ChangeIndicator current={cur.success_rate} previous={prev.success_rate} suffix="p" /></div>
                <p className="text-xs text-at-text-weak mt-0.5">{compareLabels.previous}: {prev.success_rate}%</p>
              </div>

              <div className="bg-at-accent-light rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-at-text-weak">문자 발송</span>
                  <MessageSquare className="w-4 h-4 text-at-accent" />
                </div>
                <p className="text-2xl font-bold text-at-accent">{cur.sms_sent_count}</p>
                <div className="mt-1"><ChangeIndicator current={cur.sms_sent_count} previous={prev.sms_sent_count} /></div>
                <p className="text-xs text-at-text-weak mt-0.5">{compareLabels.previous}: {prev.sms_sent_count}건</p>
              </div>
            </div>

            <div className="bg-at-surface-alt rounded-xl p-4">
              <p className="text-sm font-medium text-at-text-secondary mb-3">{compareLabels.current} 상태별 상세</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="flex items-center gap-2">
                  <PhoneOff className="w-4 h-4 text-at-warning" />
                  <div>
                    <p className="text-sm font-medium text-at-text">{cur.no_answer_count}</p>
                    <p className="text-xs text-at-text-weak">부재중</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-at-error" />
                  <div>
                    <p className="text-sm font-medium text-at-text">{cur.call_rejected_count}</p>
                    <p className="text-xs text-at-text-weak">통화거부</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <UserX className="w-4 h-4 text-at-error" />
                  <div>
                    <p className="text-sm font-medium text-at-text">{cur.visit_refused_count}</p>
                    <p className="text-xs text-at-text-weak">내원거부</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-purple-500" />
                  <div>
                    <p className="text-sm font-medium text-at-text">{cur.invalid_number_count}</p>
                    <p className="text-xs text-at-text-weak">없는번호</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-at-text-weak text-sm">기간별 통계 데이터가 없습니다.</div>
        )}
      </div>

      {/* 최근 14일 추이 차트 */}
      <div className="bg-white rounded-xl border border-at-border p-6 shadow-at-card">
        <h3 className="text-lg font-semibold text-at-text mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-at-accent" />
          최근 14일 추이
        </h3>
        {trends.length > 0 ? <TrendChart trends={trends} /> : (
          <div className="py-8 text-center text-at-text-weak text-sm">추이 데이터가 없습니다.</div>
        )}
      </div>

      {/* 상태별 분포 + 오늘 활동 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-at-border p-6 shadow-at-card">
          <h3 className="text-lg font-semibold text-at-text mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-at-accent" />
            전체 상태별 분포
          </h3>
          <div className="space-y-3">
            {[
              { label: '리콜 전', value: stats.pending_count, barClass: 'bg-at-border' },
              { label: '연락 진행', value: stats.contacted_count - stats.appointment_count, barClass: 'bg-at-accent' },
              { label: '예약 성공', value: stats.appointment_count, barClass: 'bg-at-success' },
              { label: '거부/실패', value: stats.rejected_count + stats.invalid_count, barClass: 'bg-at-error' },
            ].map(({ label, value, barClass }) => (
              <div key={label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-at-text-secondary">{label}</span>
                  <span className="font-medium">{value}명</span>
                </div>
                <div className="w-full bg-at-surface-alt rounded-full h-2">
                  <div className={`${barClass} h-2 rounded-full transition-all`} style={{ width: `${total > 0 ? (value / total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-at-border p-6 shadow-at-card">
          <h3 className="text-lg font-semibold text-at-text mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-at-accent" />
            오늘 활동
          </h3>

          {todayActivity ? (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-4 bg-at-accent-light rounded-xl">
                  <Activity className="w-6 h-6 text-at-accent mx-auto mb-2" />
                  <p className="text-2xl font-bold text-at-text">{todayActivity.totalChanges}</p>
                  <p className="text-sm text-at-accent">총 처리</p>
                </div>
                <div className="text-center p-4 bg-at-success-bg rounded-xl">
                  <Calendar className="w-6 h-6 text-at-success mx-auto mb-2" />
                  <p className="text-2xl font-bold text-at-success">{todayActivity.appointmentsMade}</p>
                  <p className="text-sm text-at-success">예약 성공</p>
                </div>
              </div>

              {todayActivity.statusChanges.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-at-text-secondary mb-2">상태별 처리 현황</p>
                  <div className="flex flex-wrap gap-2">
                    {todayActivity.statusChanges.map(({ status, count }) => (
                      <div key={status} className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium ${RECALL_STATUS_COLORS[status]}`}>
                        {getStatusIcon(status)}
                        {RECALL_STATUS_LABELS[status]}: {count}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {todayActivity.recentPatients.length > 0 && (
                <div className="pt-4 border-t border-at-border">
                  <p className="text-sm font-medium text-at-text-secondary mb-2">최근 처리 환자</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {todayActivity.recentPatients.slice(0, 5).map(patient => (
                      <div key={patient.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(patient.status)}
                          <span className="font-medium">{patient.patient_name}</span>
                          <span className={`px-2 py-0.5 rounded text-xs ${RECALL_STATUS_COLORS[patient.status]}`}>
                            {RECALL_STATUS_LABELS[patient.status]}
                          </span>
                        </div>
                        <span className="text-at-text-weak text-xs">
                          {patient.recall_datetime && new Date(patient.recall_datetime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-at-text-weak">
              <Activity className="w-8 h-8 mx-auto mb-2 text-at-text-weak" />
              <p>오늘 활동 내역이 없습니다.</p>
            </div>
          )}
        </div>
      </div>

      {/* 진행률 */}
      <div className="bg-white rounded-xl border border-at-border p-6 shadow-at-card">
        <h3 className="text-lg font-semibold text-at-text mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-at-accent" />
          전체 진행률
        </h3>
        <div className="relative pt-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-at-text-secondary">진행: {stats.contacted_count}/{stats.total_patients}</span>
            <span className="text-sm font-medium text-at-accent">
              {stats.total_patients > 0 ? Math.round((stats.contacted_count / stats.total_patients) * 100) : 0}%
            </span>
          </div>
          <div className="w-full bg-at-surface-alt rounded-full h-4">
            <div
              className="bg-gradient-to-r from-indigo-500 to-purple-500 h-4 rounded-full transition-all flex items-center justify-end pr-2"
              style={{ width: `${stats.total_patients > 0 ? (stats.contacted_count / stats.total_patients) * 100 : 0}%` }}
            >
              {stats.contacted_count > 0 && <span className="text-xs text-white font-medium">{stats.contacted_count}</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="flex items-center gap-3 p-3 bg-at-success-bg rounded-xl">
            <CheckCircle className="w-8 h-8 text-at-success" />
            <div>
              <p className="text-2xl font-bold text-at-success">{stats.appointment_count}</p>
              <p className="text-sm text-at-success">예약 성공</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-at-error-bg rounded-xl">
            <XCircle className="w-8 h-8 text-at-error" />
            <div>
              <p className="text-2xl font-bold text-at-error">{stats.rejected_count + stats.invalid_count}</p>
              <p className="text-sm text-at-error">실패/거부</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
