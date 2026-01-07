'use client'

import { useState, useEffect } from 'react'
import { Calendar, BarChart3, Clock, TrendingUp, ChevronDown, ChevronUp, Users, X, Pencil, Save, CalendarRange } from 'lucide-react'
import { attendanceService } from '@/lib/attendanceService'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import type { AttendanceStatistics, AttendanceRecord, AttendanceStatus } from '@/types/attendance'
import { ATTENDANCE_STATUS_NAMES, ATTENDANCE_STATUS_COLORS } from '@/types/attendance'
import BranchSelector from './BranchSelector'
import { useBranches } from '@/hooks/useBranches'

type StatisticsWithName = AttendanceStatistics & { user_name: string }
type PeriodMode = 'monthly' | 'custom'

// 날짜 포맷 함수 (YYYY-MM-DD)
function formatDateToString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 수정 폼 데이터 타입
interface EditFormData {
  check_in_time: string
  check_out_time: string
  status: AttendanceStatus
  notes: string
}

export default function AdminAttendanceStats() {
  const { user } = useAuth()
  const { hasPermission } = usePermissions()
  const [statistics, setStatistics] = useState<StatisticsWithName[]>([])
  const [loading, setLoading] = useState(true)

  // 기간 선택 모드
  const [periodMode, setPeriodMode] = useState<PeriodMode>('monthly')

  // 월별 선택
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)

  // 기간 선택 (커스텀)
  const [startDate, setStartDate] = useState(() => {
    const date = new Date()
    date.setDate(1) // 이번 달 1일
    return formatDateToString(date)
  })
  const [endDate, setEndDate] = useState(() => formatDateToString(new Date()))

  // 상세 보기 상태
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const [userRecords, setUserRecords] = useState<AttendanceRecord[]>([])
  const [loadingRecords, setLoadingRecords] = useState(false)

  // 수정 모달 상태
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editFormData, setEditFormData] = useState<EditFormData>({
    check_in_time: '',
    check_out_time: '',
    status: 'present',
    notes: '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // 근태 수정 권한 확인
  const canEditAttendance = hasPermission('attendance_manage')

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
  }, [user, periodMode, selectedYear, selectedMonth, startDate, endDate, selectedBranchId])

  // 페이지 로드 시 최신 통계로 자동 갱신하는 함수
  const refreshStatisticsOnLoad = async () => {
    if (!user?.clinic_id) return

    setLoading(true)
    try {
      if (periodMode === 'monthly') {
        // 월별 통계 조회
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
      } else {
        // 기간별 통계 조회
        const result = await attendanceService.getAllUsersStatisticsForDateRange(
          user.clinic_id,
          startDate,
          endDate,
          selectedBranchId || undefined
        )

        if (result.success && result.statistics) {
          setStatistics(result.statistics)
        } else {
          setStatistics([])
        }
      }
    } catch (error) {
      console.error('[AdminAttendanceStats] Error refreshing statistics on load:', error)
    } finally {
      setLoading(false)
    }
  }

  // 기간 선택 프리셋
  const handlePresetPeriod = (preset: string) => {
    const today = new Date()
    let start: Date
    let end: Date = today

    switch (preset) {
      case 'thisWeek':
        start = new Date(today)
        start.setDate(today.getDate() - today.getDay()) // 이번 주 일요일
        break
      case 'lastWeek':
        start = new Date(today)
        start.setDate(today.getDate() - today.getDay() - 7)
        end = new Date(start)
        end.setDate(start.getDate() + 6)
        break
      case 'thisMonth':
        start = new Date(today.getFullYear(), today.getMonth(), 1)
        break
      case 'lastMonth':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        end = new Date(today.getFullYear(), today.getMonth(), 0)
        break
      case 'last3Months':
        start = new Date(today.getFullYear(), today.getMonth() - 2, 1)
        break
      case 'last6Months':
        start = new Date(today.getFullYear(), today.getMonth() - 5, 1)
        break
      case 'thisYear':
        start = new Date(today.getFullYear(), 0, 1)
        break
      default:
        return
    }

    setStartDate(formatDateToString(start))
    setEndDate(formatDateToString(end))
  }

  const loadUserRecords = async (userId: string) => {
    setLoadingRecords(true)
    try {
      let result
      if (periodMode === 'monthly') {
        result = await attendanceService.getUserMonthlyRecords(
          userId,
          selectedYear,
          selectedMonth
        )
      } else {
        result = await attendanceService.getUserRecordsForDateRange(
          userId,
          startDate,
          endDate
        )
      }

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

  // ISO 시간 문자열에서 HH:MM 형식으로 변환
  const isoToTimeInput = (isoString: string | null | undefined): string => {
    if (!isoString) return ''
    const date = new Date(isoString)
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${hours}:${minutes}`
  }

  // HH:MM 형식에서 ISO 시간 문자열로 변환 (해당 날짜 기준)
  const timeInputToIso = (timeStr: string, workDate: string): string | undefined => {
    if (!timeStr) return undefined
    const [hours, minutes] = timeStr.split(':')
    const date = new Date(workDate)
    date.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0)
    return date.toISOString()
  }

  // 수정 모달 열기
  const openEditModal = (record: AttendanceRecord, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingRecord(record)
    setEditFormData({
      check_in_time: isoToTimeInput(record.check_in_time),
      check_out_time: isoToTimeInput(record.check_out_time),
      status: record.status,
      notes: record.notes || '',
    })
    setEditError(null)
    setIsEditModalOpen(true)
  }

  // 수정 모달 닫기
  const closeEditModal = () => {
    setIsEditModalOpen(false)
    setEditingRecord(null)
    setEditError(null)
  }

  // 수정 저장
  const handleSaveEdit = async () => {
    if (!editingRecord || !user) return

    setIsSaving(true)
    setEditError(null)

    try {
      // 가상 결근 기록인지 확인
      const isVirtualAbsentRecord = editingRecord.id.startsWith('absent-')

      const result = await attendanceService.editAttendanceRecord({
        record_id: editingRecord.id,
        check_in_time: editFormData.check_in_time
          ? timeInputToIso(editFormData.check_in_time, editingRecord.work_date)
          : undefined,
        check_out_time: editFormData.check_out_time
          ? timeInputToIso(editFormData.check_out_time, editingRecord.work_date)
          : undefined,
        status: editFormData.status,
        notes: editFormData.notes,
        edited_by: user.id,
        // 가상 결근 기록인 경우 추가 정보 전달
        ...(isVirtualAbsentRecord && {
          user_id: editingRecord.user_id,
          clinic_id: editingRecord.clinic_id,
          work_date: editingRecord.work_date,
          scheduled_start: editingRecord.scheduled_start,
          scheduled_end: editingRecord.scheduled_end,
        }),
      })

      if (result.success) {
        // 기록 목록 갱신 (가상 기록이면 새 기록으로 교체, 아니면 업데이트)
        if (isVirtualAbsentRecord && result.record) {
          setUserRecords((prev) =>
            prev.map((r) => (r.id === editingRecord.id ? result.record! : r))
          )
        } else {
          setUserRecords((prev) =>
            prev.map((r) => (r.id === editingRecord.id ? { ...r, ...result.record } : r))
          )
        }
        // 통계 갱신
        await refreshStatisticsOnLoad()
        closeEditModal()
      } else {
        setEditError(result.error || '저장에 실패했습니다.')
      }
    } catch (error: any) {
      setEditError(error.message || '예기치 않은 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
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

        {/* 기간 선택 모드 탭 */}
        <div className="flex mb-4 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setPeriodMode('monthly')}
            className={`flex-1 flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              periodMode === 'monthly'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-4 h-4 mr-2" />
            월별
          </button>
          <button
            onClick={() => setPeriodMode('custom')}
            className={`flex-1 flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              periodMode === 'custom'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarRange className="w-4 h-4 mr-2" />
            기간별
          </button>
        </div>

        {periodMode === 'monthly' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>
        ) : (
          <div className="space-y-4">
            {/* 빠른 선택 버튼 */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handlePresetPeriod('thisWeek')}
                className="px-3 py-1.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                이번 주
              </button>
              <button
                onClick={() => handlePresetPeriod('lastWeek')}
                className="px-3 py-1.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                지난 주
              </button>
              <button
                onClick={() => handlePresetPeriod('thisMonth')}
                className="px-3 py-1.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                이번 달
              </button>
              <button
                onClick={() => handlePresetPeriod('lastMonth')}
                className="px-3 py-1.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                지난 달
              </button>
              <button
                onClick={() => handlePresetPeriod('last3Months')}
                className="px-3 py-1.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                최근 3개월
              </button>
              <button
                onClick={() => handlePresetPeriod('last6Months')}
                className="px-3 py-1.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                최근 6개월
              </button>
              <button
                onClick={() => handlePresetPeriod('thisYear')}
                className="px-3 py-1.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                올해
              </button>
            </div>

            {/* 직접 기간 선택 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">시작일</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={endDate}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">종료일</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  max={formatDateToString(new Date())}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* 선택된 기간 표시 */}
            <div className="text-sm text-slate-600 bg-blue-50 px-3 py-2 rounded-lg">
              선택 기간: <span className="font-medium text-blue-700">{startDate}</span> ~ <span className="font-medium text-blue-700">{endDate}</span>
            </div>
          </div>
        )}
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
                직원별 {periodMode === 'monthly' ? '월간' : '기간별'} 근태 통계 {periodMode === 'monthly' ? `(${selectedYear}년 ${selectedMonth}월)` : `(${startDate} ~ ${endDate})`}
              </h2>
              <p className="text-sm text-gray-500 mt-1">직원을 클릭하면 상세 기록을 볼 수 있습니다.</p>
            </div>

            {statistics.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <BarChart3 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>선택한 기간의 근태 통계가 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10">
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
                                  {stat.user_name}님의 {periodMode === 'monthly' ? `${selectedMonth}월` : `${startDate} ~ ${endDate}`} 상세 기록
                                </h4>
                                {loadingRecords ? (
                                  <div className="flex items-center justify-center py-4">
                                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                                    <span className="text-sm text-gray-500">기록 로딩 중...</span>
                                  </div>
                                ) : userRecords.length === 0 ? (
                                  <p className="text-sm text-gray-500 text-center py-4">기록이 없습니다.</p>
                                ) : (
                                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto border border-gray-200 rounded-lg">
                                    <table className="min-w-full divide-y divide-gray-200">
                                      <thead className="bg-gray-100 sticky top-0 z-10">
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
                                          {canEditAttendance && (
                                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">
                                              수정
                                            </th>
                                          )}
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
                                            {canEditAttendance && (
                                              <td className="px-3 py-2 text-center">
                                                <button
                                                  onClick={(e) => openEditModal(record, e)}
                                                  className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                                                  title="기록 수정"
                                                >
                                                  <Pencil className="w-3 h-3 mr-1" />
                                                  수정
                                                </button>
                                              </td>
                                            )}
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

      {/* 수정 모달 */}
      {isEditModalOpen && editingRecord && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            {/* 배경 오버레이 */}
            <div
              className="fixed inset-0 bg-black/50 transition-opacity"
              onClick={closeEditModal}
            />

            {/* 모달 콘텐츠 */}
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md p-6 z-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  근태 기록 수정
                </h3>
                <button
                  onClick={closeEditModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">날짜:</span> {formatDate(editingRecord.work_date)}
                </p>
              </div>

              {editError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{editError}</p>
                </div>
              )}

              <div className="space-y-4">
                {/* 상태 선택 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    근태 상태
                  </label>
                  <select
                    value={editFormData.status}
                    onChange={(e) =>
                      setEditFormData((prev) => ({
                        ...prev,
                        status: e.target.value as AttendanceStatus,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="present">정상출근</option>
                    <option value="late">지각</option>
                    <option value="early_leave">조퇴</option>
                    <option value="absent">결근</option>
                    <option value="leave">연차</option>
                    <option value="holiday">공휴일</option>
                  </select>
                </div>

                {/* 출근 시간 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    출근 시간
                  </label>
                  <input
                    type="time"
                    value={editFormData.check_in_time}
                    onChange={(e) =>
                      setEditFormData((prev) => ({
                        ...prev,
                        check_in_time: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* 퇴근 시간 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    퇴근 시간
                  </label>
                  <input
                    type="time"
                    value={editFormData.check_out_time}
                    onChange={(e) =>
                      setEditFormData((prev) => ({
                        ...prev,
                        check_out_time: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* 메모 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    메모
                  </label>
                  <textarea
                    value={editFormData.notes}
                    onChange={(e) =>
                      setEditFormData((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    rows={3}
                    placeholder="수정 사유를 입력하세요..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                </div>
              </div>

              {/* 버튼 */}
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={closeEditModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  disabled={isSaving}
                >
                  취소
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      저장 중...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      저장
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
