'use client'

import { useState, useEffect } from 'react'
import { Calendar, BarChart3, Filter, Search, Info } from 'lucide-react'
import { attendanceService } from '@/lib/attendanceService'
import { useAuth } from '@/contexts/AuthContext'
import type { AttendanceRecord, AttendanceStatus } from '@/types/attendance'
import { ATTENDANCE_STATUS_NAMES, ATTENDANCE_STATUS_COLORS } from '@/types/attendance'

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

export default function AttendanceHistory() {
  const { user } = useAuth()
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [startDate, setStartDate] = useState(() => {
    const date = new Date()
    date.setDate(1) // 이번 달 1일
    return date.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | ''>('')

  useEffect(() => {
    if (user?.id && user?.clinic_id) {
      loadRecords()
    }
  }, [user, startDate, endDate, statusFilter])

  const loadRecords = async () => {
    if (!user?.id || !user?.clinic_id) return

    setLoading(true)
    try {
      const result = await attendanceService.getAttendanceRecords({
        clinic_id: user.clinic_id,
        user_id: user.id,
        start_date: startDate,
        end_date: endDate,
        status: statusFilter || undefined,
      })

      if (result.records) {
        setRecords(result.records)
      }
    } catch (error) {
      console.error('[AttendanceHistory] Error loading records:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (dateString: string | null | undefined) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
  }

  const formatMinutes = (minutes: number | null | undefined) => {
    if (!minutes) return '-'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}시간 ${mins}분`
    }
    return `${mins}분`
  }

  const calculateStats = () => {
    const total = records.length
    const present = records.filter(r => r.check_in_time).length
    const late = records.filter(r => r.status === 'late').length
    const absent = records.filter(r => r.status === 'absent').length
    const totalWorkMinutes = records.reduce((sum, r) => sum + (r.total_work_minutes || 0), 0)

    return { total, present, late, absent, totalWorkMinutes }
  }

  const stats = calculateStats()

  return (
    <div className="space-y-6">
      {/* 섹션 1: 통계 요약 */}
      <div>
        <SectionHeader number={1} title="통계 요약" icon={BarChart3} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">총 근무일</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{stats.total}일</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <div className="text-xs font-medium text-green-600 uppercase tracking-wider">출근일</div>
            <div className="text-2xl font-bold text-green-700 mt-1">{stats.present}일</div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <div className="text-xs font-medium text-yellow-600 uppercase tracking-wider">지각</div>
            <div className="text-2xl font-bold text-yellow-700 mt-1">{stats.late}회</div>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <div className="text-xs font-medium text-blue-600 uppercase tracking-wider">총 근무시간</div>
            <div className="text-2xl font-bold text-blue-700 mt-1">{Math.floor(stats.totalWorkMinutes / 60)}h</div>
          </div>
        </div>
      </div>

      {/* 섹션 2: 조회 필터 */}
      <div>
        <SectionHeader number={2} title="조회 필터" icon={Filter} />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">종료일</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">상태</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AttendanceStatus | '')}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              <option value="">전체</option>
              <option value="present">정상출근</option>
              <option value="late">지각</option>
              <option value="early_leave">조퇴</option>
              <option value="absent">결근</option>
              <option value="leave">연차</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={loadRecords}
              disabled={loading}
              className="w-full inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 transition-colors font-medium"
            >
              <Search className="w-4 h-4 mr-2" />
              {loading ? '조회 중...' : '조회'}
            </button>
          </div>
        </div>
      </div>

      {/* 섹션 3: 출퇴근 기록 */}
      <div>
        <SectionHeader number={3} title="출퇴근 기록" icon={Calendar} />
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">날짜</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">상태</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">출근</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">퇴근</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">근무시간</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">지각/조퇴</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">초과근무</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    <div className="flex justify-center items-center space-x-2">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      <span>조회 중...</span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    출퇴근 기록이 없습니다.
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-800">
                      {formatDate(record.work_date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${ATTENDANCE_STATUS_COLORS[record.status]}`}>
                        {ATTENDANCE_STATUS_NAMES[record.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-800">
                      {formatTime(record.check_in_time)}
                      {record.scheduled_start && (
                        <span className="ml-1 text-xs text-slate-400">
                          ({record.scheduled_start.substring(0, 5)})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-800">
                      {formatTime(record.check_out_time)}
                      {record.scheduled_end && (
                        <span className="ml-1 text-xs text-slate-400">
                          ({record.scheduled_end.substring(0, 5)})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-800 font-medium">
                      {formatMinutes(record.total_work_minutes)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {record.late_minutes > 0 && (
                        <span className="text-yellow-600 font-medium">지각 {record.late_minutes}분</span>
                      )}
                      {record.early_leave_minutes > 0 && (
                        <span className="text-orange-600 font-medium ml-1">조퇴 {record.early_leave_minutes}분</span>
                      )}
                      {record.late_minutes === 0 && record.early_leave_minutes === 0 && '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-green-600 font-medium">
                      {record.overtime_minutes > 0 ? `${record.overtime_minutes}분` : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 안내 */}
      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex items-start space-x-2">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-slate-600 mb-1">안내사항</p>
            <ul className="text-xs text-slate-500 space-y-0.5 list-disc list-inside">
              <li>지각/조퇴는 설정된 근무 스케줄 기준으로 자동 계산됩니다.</li>
              <li>초과근무는 예정 퇴근 시간 이후 근무한 시간입니다.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
