'use client'

import { useState, useEffect } from 'react'
import { Calendar, BarChart3, Clock, Info, User, Users } from 'lucide-react'
import { attendanceService } from '@/lib/attendanceService'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import type { AttendanceStatistics } from '@/types/attendance'
import AdminAttendanceStats from './AdminAttendanceStats'

// 섹션 헤더 컴포넌트
const SectionHeader = ({ number, title, icon: Icon }: { number: number; title: string; icon: React.ElementType }) => (
  <div className="flex items-center space-x-3 pb-3 mb-4 border-b border-slate-200">
    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600">
      <Icon className="w-4 h-4" />
    </div>
    <h3 className="text-base font-semibold text-slate-800">
      <span className="text-blue-600 mr-1">{number}.</span>
      {title}
    </h3>
  </div>
)

type StatsView = 'personal' | 'team'

export default function AttendanceStats() {
  const { user } = useAuth()
  const { hasPermission } = usePermissions()
  const canViewAllStats = hasPermission('attendance_view_all')
  const [statsView, setStatsView] = useState<StatsView>('personal')
  const [statistics, setStatistics] = useState<AttendanceStatistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)

  useEffect(() => {
    if (user?.id) {
      // 페이지 로드 시 최신 통계로 자동 갱신
      refreshStatisticsOnLoad()
    }
  }, [user, selectedYear, selectedMonth])

  // 페이지 로드 시 최신 통계로 자동 갱신하는 함수
  const refreshStatisticsOnLoad = async () => {
    if (!user?.id) return

    setLoading(true)
    try {
      await attendanceService.updateMonthlyStatistics(user.id, selectedYear, selectedMonth)
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
      console.error('[AttendanceStats] Error refreshing statistics on load:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatMinutesToHours = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}시간 ${mins}분`
  }

  const getAttendanceRateColor = (rate: number) => {
    if (rate >= 95) return 'text-green-600'
    if (rate >= 85) return 'text-yellow-600'
    return 'text-red-600'
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="space-y-6">
      {/* 관리자용 뷰 선택 탭 */}
      {canViewAllStats && (
        <div className="bg-white rounded-lg shadow p-1 inline-flex">
          <button
            onClick={() => setStatsView('personal')}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              statsView === 'personal'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <User className="w-4 h-4 mr-2" />
            내 통계
          </button>
          <button
            onClick={() => setStatsView('team')}
            className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              statsView === 'team'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Users className="w-4 h-4 mr-2" />
            전체 직원 통계
          </button>
        </div>
      )}

      {/* 관리자용 전체 통계 */}
      {statsView === 'team' && canViewAllStats ? (
        <AdminAttendanceStats />
      ) : (
      <>
      {/* 섹션 1: 기간 선택 */}
      <div>
        <SectionHeader number={1} title="기간 선택" icon={Calendar} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">년도</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
        <div className="flex justify-center items-center py-12">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-slate-500">통계 로딩 중...</span>
          </div>
        </div>
      ) : statistics ? (
        <>
          {/* 섹션 2: 주요 지표 */}
          <div>
            <SectionHeader number={2} title="주요 지표" icon={BarChart3} />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="text-xs font-medium text-green-600 uppercase tracking-wider">출근율</div>
                <div className={`text-2xl font-bold mt-1 ${getAttendanceRateColor(statistics.attendance_rate)}`}>
                  {statistics.attendance_rate.toFixed(1)}%
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {statistics.present_days}/{statistics.total_work_days}일 출근
                </div>
              </div>
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="text-xs font-medium text-blue-600 uppercase tracking-wider">총 근무시간</div>
                <div className="text-2xl font-bold text-blue-700 mt-1">
                  {Math.floor(statistics.total_work_minutes / 60)}h
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  일평균 {formatMinutesToHours(statistics.avg_work_minutes_per_day)}
                </div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                <div className="text-xs font-medium text-yellow-600 uppercase tracking-wider">지각</div>
                <div className="text-2xl font-bold text-yellow-700 mt-1">{statistics.late_count}회</div>
                <div className="text-xs text-slate-500 mt-1">
                  총 {statistics.total_late_minutes}분
                </div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <div className="text-xs font-medium text-purple-600 uppercase tracking-wider">초과근무</div>
                <div className="text-2xl font-bold text-purple-700 mt-1">{statistics.overtime_count}회</div>
                <div className="text-xs text-slate-500 mt-1">
                  총 {formatMinutesToHours(statistics.total_overtime_minutes)}
                </div>
              </div>
            </div>
          </div>

          {/* 섹션 3: 상세 통계 */}
          <div>
            <SectionHeader number={3} title="상세 통계" icon={Clock} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 근무 일수 통계 */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <h4 className="font-semibold text-slate-800 mb-3">근무 일수</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-2 border-b border-slate-200">
                    <span className="text-slate-600 text-sm">총 근무 예정일</span>
                    <span className="font-semibold text-slate-800">{statistics.total_work_days}일</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-200">
                    <span className="text-slate-600 text-sm">출근</span>
                    <span className="font-semibold text-green-600">{statistics.present_days}일</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-200">
                    <span className="text-slate-600 text-sm">결근</span>
                    <span className="font-semibold text-red-600">{statistics.absent_days}일</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-200">
                    <span className="text-slate-600 text-sm">연차</span>
                    <span className="font-semibold text-blue-600">{statistics.leave_days}일</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-600 text-sm">공휴일</span>
                    <span className="font-semibold text-slate-600">{statistics.holiday_days}일</span>
                  </div>
                </div>
              </div>

              {/* 근태 현황 */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <h4 className="font-semibold text-slate-800 mb-3">근태 현황</h4>
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-2 border-b border-slate-200">
                    <span className="text-slate-600 text-sm">지각 횟수</span>
                    <span className="font-semibold text-yellow-600">{statistics.late_count}회</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-200">
                    <span className="text-slate-600 text-sm">총 지각 시간</span>
                    <span className="font-semibold text-yellow-600">
                      {formatMinutesToHours(statistics.total_late_minutes)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-200">
                    <span className="text-slate-600 text-sm">평균 지각 시간</span>
                    <span className="font-semibold text-yellow-600">
                      {statistics.avg_late_minutes.toFixed(0)}분
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-200">
                    <span className="text-slate-600 text-sm">조퇴 횟수</span>
                    <span className="font-semibold text-orange-600">{statistics.early_leave_count}회</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-600 text-sm">총 조퇴 시간</span>
                    <span className="font-semibold text-orange-600">
                      {formatMinutesToHours(statistics.total_early_leave_minutes)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 근무 시간 분석 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-slate-600 mb-1">총 근무 시간</p>
              <p className="text-xl font-bold text-blue-600">
                {formatMinutesToHours(statistics.total_work_minutes)}
              </p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm text-slate-600 mb-1">일평균 근무 시간</p>
              <p className="text-xl font-bold text-green-600">
                {formatMinutesToHours(statistics.avg_work_minutes_per_day)}
              </p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
              <p className="text-sm text-slate-600 mb-1">초과 근무 시간</p>
              <p className="text-xl font-bold text-purple-600">
                {formatMinutesToHours(statistics.total_overtime_minutes)}
              </p>
            </div>
          </div>

          {/* 업데이트 정보 */}
          <div className="text-sm text-slate-500 text-center">
            마지막 업데이트: {new Date(statistics.last_calculated_at).toLocaleString('ko-KR')}
          </div>
        </>
      ) : (
        <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
          <BarChart3 className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600 mb-2">선택한 기간의 통계가 없습니다.</p>
          <p className="text-sm text-slate-500">출퇴근 기록이 있으면 자동으로 통계가 생성됩니다.</p>
        </div>
      )}

      {/* 안내 */}
      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex items-start space-x-2">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-slate-600 mb-1">안내사항</p>
            <ul className="text-xs text-slate-500 space-y-0.5 list-disc list-inside">
              <li>통계는 매월 자동으로 계산되며, &apos;통계 새로고침&apos; 버튼으로 수동 업데이트할 수 있습니다.</li>
              <li>출근율 = (출근 일수 / 총 근무 예정일) × 100</li>
              <li>지각, 조퇴, 초과근무는 설정된 근무 스케줄 기준으로 계산됩니다.</li>
            </ul>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  )
}
