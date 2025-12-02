'use client'

import { useState, useEffect } from 'react'
import { Calendar, BarChart3, Clock, TrendingUp, ChevronDown, ChevronUp, RefreshCw, Users, X } from 'lucide-react'
import { attendanceService } from '@/lib/attendanceService'
import { useAuth } from '@/contexts/AuthContext'
import type { AttendanceStatistics, AttendanceRecord } from '@/types/attendance'
import { ATTENDANCE_STATUS_NAMES, ATTENDANCE_STATUS_COLORS } from '@/types/attendance'
import BranchSelector from './BranchSelector'
import { useBranches } from '@/hooks/useBranches'

type StatisticsWithName = AttendanceStatistics & { user_name: string }

export default function AdminAttendanceStats() {
  const { user } = useAuth()
  const [statistics, setStatistics] = useState<StatisticsWithName[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)

  // 상세 보기 상태
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const [userRecords, setUserRecords] = useState<AttendanceRecord[]>([])
  const [loadingRecords, setLoadingRecords] = useState(false)

  // 지점 선택
  const { selectedBranchId, selectedBranch } = useBranches({
    clinicId: user?.clinic_id,
    userBranchId: user?.primary_branch_id,
    userRole: user?.role,
  })

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  useEffect(() => {
    if (user?.clinic_id) {
      // 페이지 로드 시 최신 통계로 자동 갱신
      refreshStatisticsOnLoad()
    }
  }, [user, selectedYear, selectedMonth, selectedBranchId])

  // 페이지 로드 시 최신 통계로 자동 갱신하는 함수
  const refreshStatisticsOnLoad = async () => {
    if (!user?.clinic_id) return

    setLoading(true)
    try {
      await attendanceService.refreshAllUsersMonthlyStatistics(
        user.clinic_id,
        selectedYear,
        selectedMonth,
        selectedBranchId || undefined
      )
      const result = await attendanceService.getAllUsersMonthlyStatistics(
        user.clinic_id,
        selectedYear,
        selectedMonth,
        selectedBranchId || undefined
      )

      if (result.success && result.statistics) {
        setStatistics(result.statistics)
      } else {
        setStatistics([])
      }
    } catch (error) {
      console.error('[AdminAttendanceStats] Error refreshing statistics on load:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadStatistics = async () => {
    if (!user?.clinic_id) return

    setLoading(true)
    try {
      const result = await attendanceService.getAllUsersMonthlyStatistics(
        user.clinic_id,
        selectedYear,
        selectedMonth,
        selectedBranchId || undefined
      )

      if (result.success && result.statistics) {
        setStatistics(result.statistics)
      } else {
        setStatistics([])
      }
    } catch (error) {
      console.error('[AdminAttendanceStats] Error loading statistics:', error)
    } finally {
      setLoading(false)
    }
  }

  const refreshStatistics = async () => {
    if (!user?.clinic_id) return

    setRefreshing(true)
    try {
      await attendanceService.refreshAllUsersMonthlyStatistics(
        user.clinic_id,
        selectedYear,
        selectedMonth,
        selectedBranchId || undefined
      )
      await loadStatistics()
    } catch (error) {
      console.error('[AdminAttendanceStats] Error refreshing statistics:', error)
    } finally {
      setRefreshing(false)
    }
  }

  const loadUserRecords = async (userId: string) => {
    setLoadingRecords(true)
    try {
      const result = await attendanceService.getUserMonthlyRecords(
        userId,
        selectedYear,
        selectedMonth
      )

      if (result.success && result.records) {
        setUserRecords(result.records)
      } else {
        setUserRecords([])
      }
    } catch (error) {
      console.error('[AdminAttendanceStats] Error loading user records:', error)
    } finally {
      setLoadingRecords(false)
    }
  }

  const toggleUserDetails = async (userId: string) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null)
      setUserRecords([])
    } else {
      setExpandedUserId(userId)
      await loadUserRecords(userId)
    }
  }

  const formatMinutesToHours = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours === 0) return `${mins}분`
    if (mins === 0) return `${hours}시간`
    return `${hours}시간 ${mins}분`
  }

  const formatTime = (dateString: string | null | undefined) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const dayNames = ['일', '월', '화', '수', '목', '금', '토']
    return `${date.getDate()}일 (${dayNames[date.getDay()]})`
  }

  const getAttendanceRateColor = (rate: number) => {
    if (rate >= 95) return 'text-green-600'
    if (rate >= 85) return 'text-yellow-600'
    return 'text-red-600'
  }

  // 요약 통계 계산
  const summaryStats = {
    totalEmployees: statistics.length,
    totalLateCount: statistics.reduce((sum, s) => sum + s.late_count, 0),
    totalEarlyLeaveCount: statistics.reduce((sum, s) => sum + s.early_leave_count, 0),
    totalOvertimeCount: statistics.reduce((sum, s) => sum + s.overtime_count, 0),
    totalAbsentDays: statistics.reduce((sum, s) => sum + s.absent_days, 0),
    avgAttendanceRate:
      statistics.length > 0
        ? statistics.reduce((sum, s) => sum + s.attendance_rate, 0) / statistics.length
        : 0,
  }

  return (
    <div className="space-y-6">
      {/* 기간 선택 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center space-x-3 pb-3 mb-4 border-b border-slate-200">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600">
            <Calendar className="w-4 h-4" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">기간 선택</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">년도</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">월</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {months.map((month) => (
                <option key={month} value={month}>
                  {month}월
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 flex items-end">
            <button
              onClick={refreshStatistics}
              disabled={loading || refreshing}
              className="w-full inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 transition-colors font-medium"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? '통계 갱신 중...' : '전체 통계 새로고침'}
            </button>
          </div>
        </div>
      </div>

      {/* 지점 선택 */}
      {user?.clinic_id && (
        <BranchSelector
          clinicId={user.clinic_id}
          userBranchId={user.primary_branch_id}
          userRole={user.role}
          showAllOption={true}
        />
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-slate-500">통계 로딩 중...</span>
          </div>
        </div>
      ) : (
        <>
          {/* 요약 통계 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">전체 직원</p>
                  <p className="text-xl font-bold text-gray-900">{summaryStats.totalEmployees}명</p>
                </div>
                <Users className="w-8 h-8 text-gray-400" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">평균 출근율</p>
                  <p className={`text-xl font-bold ${getAttendanceRateColor(summaryStats.avgAttendanceRate)}`}>
                    {summaryStats.avgAttendanceRate.toFixed(1)}%
                  </p>
                </div>
                <BarChart3 className="w-8 h-8 text-green-400" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">총 지각</p>
                  <p className="text-xl font-bold text-yellow-600">{summaryStats.totalLateCount}회</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-400" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">총 조퇴</p>
                  <p className="text-xl font-bold text-red-600">{summaryStats.totalEarlyLeaveCount}회</p>
                </div>
                <TrendingUp className="w-8 h-8 text-red-400 rotate-180" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">총 초과근무</p>
                  <p className="text-xl font-bold text-purple-600">{summaryStats.totalOvertimeCount}회</p>
                </div>
                <TrendingUp className="w-8 h-8 text-purple-400" />
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-600">총 결근</p>
                  <p className="text-xl font-bold text-gray-600">{summaryStats.totalAbsentDays}일</p>
                </div>
                <X className="w-8 h-8 text-gray-400" />
              </div>
            </div>
          </div>

          {/* 직원별 통계 테이블 */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                직원별 월간 근태 통계 ({selectedYear}년 {selectedMonth}월)
              </h2>
              <p className="text-sm text-gray-500 mt-1">직원을 클릭하면 상세 기록을 볼 수 있습니다.</p>
            </div>

            {statistics.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <BarChart3 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>선택한 기간의 근태 통계가 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        직원명
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        출근율
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        출근/근무일
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        지각
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        조퇴
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        초과근무
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        결근
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        연차
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        총 근무시간
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        상세
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {statistics.map((stat) => (
                      <>
                        <tr
                          key={stat.user_id}
                          className={`hover:bg-gray-50 cursor-pointer ${
                            expandedUserId === stat.user_id ? 'bg-blue-50' : ''
                          }`}
                          onClick={() => toggleUserDetails(stat.user_id)}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{stat.user_name}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <span className={`text-sm font-bold ${getAttendanceRateColor(stat.attendance_rate)}`}>
                              {stat.attendance_rate.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-gray-600">
                            {stat.present_days}/{stat.total_work_days}일
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            {stat.late_count > 0 ? (
                              <div>
                                <span className="text-sm font-medium text-yellow-600">{stat.late_count}회</span>
                                <div className="text-xs text-gray-400">
                                  {formatMinutesToHours(stat.total_late_minutes)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            {stat.early_leave_count > 0 ? (
                              <div>
                                <span className="text-sm font-medium text-red-600">{stat.early_leave_count}회</span>
                                <div className="text-xs text-gray-400">
                                  {formatMinutesToHours(stat.total_early_leave_minutes)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            {stat.overtime_count > 0 ? (
                              <div>
                                <span className="text-sm font-medium text-purple-600">{stat.overtime_count}회</span>
                                <div className="text-xs text-gray-400">
                                  {formatMinutesToHours(stat.total_overtime_minutes)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            {stat.absent_days > 0 ? (
                              <span className="text-sm font-medium text-gray-600">{stat.absent_days}일</span>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            {stat.leave_days > 0 ? (
                              <span className="text-sm font-medium text-blue-600">{stat.leave_days}일</span>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <span className="text-sm text-gray-600">
                              {formatMinutesToHours(stat.total_work_minutes)}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            {expandedUserId === stat.user_id ? (
                              <ChevronUp className="w-5 h-5 text-gray-400 mx-auto" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-gray-400 mx-auto" />
                            )}
                          </td>
                        </tr>
                        {/* 상세 기록 확장 패널 */}
                        {expandedUserId === stat.user_id && (
                          <tr>
                            <td colSpan={10} className="px-4 py-0 bg-gray-50">
                              <div className="py-4">
                                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                                  {stat.user_name}님의 {selectedMonth}월 상세 기록
                                </h4>
                                {loadingRecords ? (
                                  <div className="flex items-center justify-center py-4">
                                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                                    <span className="text-sm text-gray-500">기록 로딩 중...</span>
                                  </div>
                                ) : userRecords.length === 0 ? (
                                  <p className="text-sm text-gray-500 text-center py-4">기록이 없습니다.</p>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg">
                                      <thead className="bg-gray-100">
                                        <tr>
                                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                                            날짜
                                          </th>
                                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">
                                            상태
                                          </th>
                                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">
                                            출근
                                          </th>
                                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">
                                            퇴근
                                          </th>
                                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">
                                            지각
                                          </th>
                                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">
                                            조퇴
                                          </th>
                                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">
                                            초과근무
                                          </th>
                                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">
                                            총 근무
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="bg-white divide-y divide-gray-200">
                                        {userRecords.map((record) => (
                                          <tr key={record.id} className="hover:bg-gray-50">
                                            <td className="px-3 py-2 text-sm text-gray-900">
                                              {formatDate(record.work_date)}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                              <span
                                                className={`px-2 py-0.5 text-xs font-medium rounded-full ${ATTENDANCE_STATUS_COLORS[record.status]}`}
                                              >
                                                {ATTENDANCE_STATUS_NAMES[record.status]}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2 text-center text-sm text-gray-600">
                                              {formatTime(record.check_in_time)}
                                            </td>
                                            <td className="px-3 py-2 text-center text-sm text-gray-600">
                                              {formatTime(record.check_out_time)}
                                            </td>
                                            <td className="px-3 py-2 text-center text-sm">
                                              {record.late_minutes > 0 ? (
                                                <span className="text-yellow-600 font-medium">
                                                  {record.late_minutes}분
                                                </span>
                                              ) : (
                                                <span className="text-gray-400">-</span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2 text-center text-sm">
                                              {record.early_leave_minutes > 0 ? (
                                                <span className="text-red-600 font-medium">
                                                  {record.early_leave_minutes}분
                                                </span>
                                              ) : (
                                                <span className="text-gray-400">-</span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2 text-center text-sm">
                                              {record.overtime_minutes > 0 ? (
                                                <span className="text-purple-600 font-medium">
                                                  {record.overtime_minutes}분
                                                </span>
                                              ) : (
                                                <span className="text-gray-400">-</span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2 text-center text-sm text-gray-600">
                                              {record.total_work_minutes && record.total_work_minutes > 0
                                                ? formatMinutesToHours(record.total_work_minutes)
                                                : '-'}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
