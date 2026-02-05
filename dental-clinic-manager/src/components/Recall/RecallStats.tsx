'use client'

import { useState, useEffect } from 'react'
import {
  BarChart3,
  TrendingUp,
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
  AlertCircle
} from 'lucide-react'
import type { RecallStats as RecallStatsType, RecallPatient, PatientRecallStatus } from '@/types/recall'
import { recallService } from '@/lib/recallService'
import { RECALL_STATUS_LABELS, RECALL_STATUS_COLORS } from '@/types/recall'

interface TodayActivityData {
  totalChanges: number
  appointmentsMade: number
  statusChanges: { status: PatientRecallStatus; count: number }[]
  recentPatients: RecallPatient[]
}

interface RecallStatsProps {
  campaignId?: string
  campaignName?: string
}

export default function RecallStats({ campaignId, campaignName }: RecallStatsProps) {
  const [stats, setStats] = useState<RecallStatsType | null>(null)
  const [todayActivity, setTodayActivity] = useState<TodayActivityData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadStats()
    loadTodayActivity()
  }, [campaignId])

  const loadStats = async () => {
    setIsLoading(true)
    const result = await recallService.patients.getStats(campaignId)
    if (result.success && result.data) {
      setStats(result.data)
    }
    setIsLoading(false)
  }

  const loadTodayActivity = async () => {
    const result = await recallService.patients.getTodayActivity(campaignId)
    if (result.success && result.data) {
      setTodayActivity(result.data)
    }
  }

  // 상태별 아이콘 매핑
  const getStatusIcon = (status: PatientRecallStatus) => {
    switch (status) {
      case 'appointment_made':
        return <Calendar className="w-4 h-4" />
      case 'no_answer':
        return <PhoneOff className="w-4 h-4" />
      case 'call_rejected':
        return <Phone className="w-4 h-4" />
      case 'visit_refused':
        return <UserX className="w-4 h-4" />
      case 'invalid_number':
        return <AlertCircle className="w-4 h-4" />
      default:
        return <Activity className="w-4 h-4" />
    }
  }

  if (isLoading) {
    return (
      <div className="py-12 text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mx-auto mb-4"></div>
        <p className="text-gray-500">통계를 불러오는 중...</p>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="py-12 text-center">
        <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">통계 데이터가 없습니다.</p>
      </div>
    )
  }

  // 도넛 차트 계산
  const chartData = [
    { label: '예약 성공', value: stats.appointment_count, color: '#22c55e' },
    { label: '거부/실패', value: stats.rejected_count + stats.invalid_count, color: '#ef4444' },
    { label: '대기 중', value: stats.pending_count, color: '#9ca3af' },
    { label: '연락 진행', value: stats.contacted_count - stats.appointment_count, color: '#3b82f6' }
  ].filter(d => d.value > 0)

  const total = chartData.reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="space-y-6">
      {/* 캠페인 정보 */}
      {campaignName && (
        <div className="bg-indigo-50 rounded-lg p-4">
          <p className="text-sm text-indigo-600 font-medium">선택된 캠페인</p>
          <p className="text-lg font-semibold text-indigo-900">{campaignName}</p>
        </div>
      )}

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

      {/* 상세 통계 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 상태별 분포 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-indigo-600" />
            상태별 분포
          </h3>

          {/* 간단한 막대 그래프 */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600">대기 중</span>
                <span className="font-medium">{stats.pending_count}명</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-gray-400 h-2 rounded-full transition-all"
                  style={{ width: `${total > 0 ? (stats.pending_count / total) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600">연락 진행</span>
                <span className="font-medium">{stats.contacted_count - stats.appointment_count}명</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${total > 0 ? ((stats.contacted_count - stats.appointment_count) / total) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600">예약 성공</span>
                <span className="font-medium">{stats.appointment_count}명</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${total > 0 ? (stats.appointment_count / total) * 100 : 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-600">거부/실패</span>
                <span className="font-medium">{stats.rejected_count + stats.invalid_count}명</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-red-500 h-2 rounded-full transition-all"
                  style={{ width: `${total > 0 ? ((stats.rejected_count + stats.invalid_count) / total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 오늘 활동 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-600" />
            오늘 활동
          </h3>

          {todayActivity ? (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-4 bg-indigo-50 rounded-lg">
                  <Activity className="w-6 h-6 text-indigo-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-indigo-900">{todayActivity.totalChanges}</p>
                  <p className="text-sm text-indigo-600">총 처리</p>
                </div>

                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <Calendar className="w-6 h-6 text-green-600 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-green-900">{todayActivity.appointmentsMade}</p>
                  <p className="text-sm text-green-600">예약 성공</p>
                </div>
              </div>

              {/* 상태별 통계 */}
              {todayActivity.statusChanges.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">상태별 처리 현황</p>
                  <div className="flex flex-wrap gap-2">
                    {todayActivity.statusChanges.map(({ status, count }) => (
                      <div
                        key={status}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium ${RECALL_STATUS_COLORS[status]}`}
                      >
                        {getStatusIcon(status)}
                        {RECALL_STATUS_LABELS[status]}: {count}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 최근 처리 환자 목록 */}
              {todayActivity.recentPatients.length > 0 && (
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-sm font-medium text-gray-700 mb-2">최근 처리 환자</p>
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
                        <span className="text-gray-400 text-xs">
                          {patient.recall_datetime && new Date(patient.recall_datetime).toLocaleTimeString('ko-KR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Activity className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p>오늘 활동 내역이 없습니다.</p>
            </div>
          )}
        </div>
      </div>

      {/* 진행률 */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-indigo-600" />
          전체 진행률
        </h3>

        <div className="relative pt-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">
              진행: {stats.contacted_count}/{stats.total_patients}
            </span>
            <span className="text-sm font-medium text-indigo-600">
              {stats.total_patients > 0
                ? Math.round((stats.contacted_count / stats.total_patients) * 100)
                : 0}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-gradient-to-r from-indigo-500 to-purple-500 h-4 rounded-full transition-all flex items-center justify-end pr-2"
              style={{
                width: `${stats.total_patients > 0 ? (stats.contacted_count / stats.total_patients) * 100 : 0}%`
              }}
            >
              {stats.contacted_count > 0 && (
                <span className="text-xs text-white font-medium">{stats.contacted_count}</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-green-900">{stats.appointment_count}</p>
              <p className="text-sm text-green-600">예약 성공</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
            <XCircle className="w-8 h-8 text-red-600" />
            <div>
              <p className="text-2xl font-bold text-red-900">{stats.rejected_count + stats.invalid_count}</p>
              <p className="text-sm text-red-600">실패/거부</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
