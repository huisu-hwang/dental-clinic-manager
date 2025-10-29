'use client'

import { useState, useEffect } from 'react'
import { attendanceService } from '@/lib/attendanceService'
import { useAuth } from '@/hooks/useAuth'
import type { AttendanceStatistics } from '@/types/attendance'

export default function AttendanceStats() {
  const { user } = useAuth()
  const [statistics, setStatistics] = useState<AttendanceStatistics | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)

  useEffect(() => {
    if (user?.id) {
      loadStatistics()
    }
  }, [user, selectedYear, selectedMonth])

  const loadStatistics = async () => {
    if (!user?.id) return

    setLoading(true)
    try {
      const result = await attendanceService.getMonthlyStatistics(
        user.id,
        selectedYear,
        selectedMonth
      )

      if (result.success && result.statistics) {
        setStatistics(result.statistics)
      } else {
        setStatistics(null)
      }
    } catch (error) {
      console.error('[AttendanceStats] Error loading statistics:', error)
    } finally {
      setLoading(false)
    }
  }

  const refreshStatistics = async () => {
    if (!user?.id) return

    setLoading(true)
    try {
      await attendanceService.updateMonthlyStatistics(user.id, selectedYear, selectedMonth)
      await loadStatistics()
    } catch (error) {
      console.error('[AttendanceStats] Error refreshing statistics:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatMinutesToHours = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  const getAttendanceRateColor = (rate: number) => {
    if (rate >= 95) return 'text-green-600'
    if (rate >= 85) return 'text-yellow-600'
    return 'text-red-600'
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">근태 통계</h1>
          <p className="mt-1 text-sm text-gray-600">월별 근태 현황을 확인할 수 있습니다.</p>
        </div>
        <button
          onClick={refreshStatistics}
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
        >
          {loading ? '새로고침 중...' : '통계 새로고침'}
        </button>
      </div>

      {/* 년/월 선택 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">년도</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">월</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {months.map((month) => (
                <option key={month} value={month}>
                  {month}월
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">통계 로딩 중...</p>
        </div>
      ) : statistics ? (
        <>
          {/* 주요 지표 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">출근율</p>
                  <p className={`text-3xl font-bold ${getAttendanceRateColor(statistics.attendance_rate)}`}>
                    {statistics.attendance_rate.toFixed(1)}%
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {statistics.present_days}/{statistics.total_work_days}일 출근
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">총 근무시간</p>
                  <p className="text-3xl font-bold text-blue-600">
                    {Math.floor(statistics.total_work_minutes / 60)}h
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                일평균 {formatMinutesToHours(statistics.avg_work_minutes_per_day)}
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">지각</p>
                  <p className="text-3xl font-bold text-yellow-600">{statistics.late_count}회</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                총 {statistics.total_late_minutes}분
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">초과근무</p>
                  <p className="text-3xl font-bold text-purple-600">{statistics.overtime_count}회</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                총 {formatMinutesToHours(statistics.total_overtime_minutes)}
              </p>
            </div>
          </div>

          {/* 상세 통계 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 근무 일수 통계 */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">근무 일수</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">총 근무 예정일</span>
                  <span className="font-semibold">{statistics.total_work_days}일</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">출근</span>
                  <span className="font-semibold text-green-600">{statistics.present_days}일</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">결근</span>
                  <span className="font-semibold text-red-600">{statistics.absent_days}일</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">연차</span>
                  <span className="font-semibold text-blue-600">{statistics.leave_days}일</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">공휴일</span>
                  <span className="font-semibold text-gray-600">{statistics.holiday_days}일</span>
                </div>
              </div>
            </div>

            {/* 근태 이상 통계 */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">근태 현황</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">지각 횟수</span>
                  <span className="font-semibold text-yellow-600">{statistics.late_count}회</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">총 지각 시간</span>
                  <span className="font-semibold text-yellow-600">
                    {formatMinutesToHours(statistics.total_late_minutes)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">평균 지각 시간</span>
                  <span className="font-semibold text-yellow-600">
                    {statistics.avg_late_minutes.toFixed(0)}분
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-gray-600">조퇴 횟수</span>
                  <span className="font-semibold text-orange-600">{statistics.early_leave_count}회</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">총 조퇴 시간</span>
                  <span className="font-semibold text-orange-600">
                    {formatMinutesToHours(statistics.total_early_leave_minutes)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 근무 시간 분석 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">근무 시간 분석</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">총 근무 시간</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatMinutesToHours(statistics.total_work_minutes)}
                </p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">일평균 근무 시간</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatMinutesToHours(statistics.avg_work_minutes_per_day)}
                </p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">초과 근무 시간</p>
                <p className="text-2xl font-bold text-purple-600">
                  {formatMinutesToHours(statistics.total_overtime_minutes)}
                </p>
              </div>
            </div>
          </div>

          {/* 업데이트 정보 */}
          <div className="text-sm text-gray-500 text-center">
            마지막 업데이트: {new Date(statistics.last_calculated_at).toLocaleString('ko-KR')}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-600 mb-2">선택한 기간의 통계가 없습니다.</p>
          <p className="text-sm text-gray-500">출퇴근 기록이 있으면 자동으로 통계가 생성됩니다.</p>
        </div>
      )}

      {/* 도움말 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <h3 className="font-semibold mb-2">💡 통계 안내</h3>
        <ul className="space-y-1">
          <li>• 통계는 매월 자동으로 계산되며, '통계 새로고침' 버튼으로 수동 업데이트할 수 있습니다.</li>
          <li>• 출근율 = (출근 일수 / 총 근무 예정일) × 100</li>
          <li>• 지각, 조퇴, 초과근무는 설정된 근무 스케줄 기준으로 계산됩니다.</li>
        </ul>
      </div>
    </div>
  )
}
