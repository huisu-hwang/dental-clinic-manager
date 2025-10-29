'use client'

import { useState, useEffect } from 'react'
import { attendanceService } from '@/lib/attendanceService'
import { useAuth } from '@/hooks/useAuth'
import type { AttendanceRecord, AttendanceStatus } from '@/types/attendance'
import { ATTENDANCE_STATUS_NAMES, ATTENDANCE_STATUS_COLORS } from '@/types/attendance'

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

  const formatTime = (dateString: string | undefined) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
  }

  const formatMinutes = (minutes: number | undefined) => {
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
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">출퇴근 기록</h1>
        <p className="mt-1 text-sm text-gray-600">내 출퇴근 기록을 조회할 수 있습니다.</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">총 근무일</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total}일</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">출근일</div>
          <div className="text-2xl font-bold text-green-600">{stats.present}일</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">지각</div>
          <div className="text-2xl font-bold text-yellow-600">{stats.late}회</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">총 근무시간</div>
          <div className="text-2xl font-bold text-blue-600">
            {Math.floor(stats.totalWorkMinutes / 60)}h
          </div>
        </div>
      </div>

      {/* 필터 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">종료일</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">상태</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AttendanceStatus | '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
            >
              {loading ? '조회 중...' : '조회'}
            </button>
          </div>
        </div>
      </div>

      {/* 출퇴근 기록 리스트 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  날짜
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  상태
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  출근
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  퇴근
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  근무시간
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  지각/조퇴
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  초과근무
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    <div className="flex justify-center items-center space-x-2">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                      <span>조회 중...</span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    출퇴근 기록이 없습니다.
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(record.work_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${ATTENDANCE_STATUS_COLORS[record.status]}`}>
                        {ATTENDANCE_STATUS_NAMES[record.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatTime(record.check_in_time)}
                      {record.scheduled_start && (
                        <div className="text-xs text-gray-500">
                          (예정: {record.scheduled_start.substring(0, 5)})
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatTime(record.check_out_time)}
                      {record.scheduled_end && (
                        <div className="text-xs text-gray-500">
                          (예정: {record.scheduled_end.substring(0, 5)})
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatMinutes(record.total_work_minutes)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {record.late_minutes > 0 && (
                        <div className="text-yellow-600">
                          지각 {record.late_minutes}분
                        </div>
                      )}
                      {record.early_leave_minutes > 0 && (
                        <div className="text-orange-600">
                          조퇴 {record.early_leave_minutes}분
                        </div>
                      )}
                      {record.late_minutes === 0 && record.early_leave_minutes === 0 && '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                      {record.overtime_minutes > 0 ? `${record.overtime_minutes}분` : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 도움말 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <h3 className="font-semibold mb-2">💡 안내</h3>
        <ul className="space-y-1">
          <li>• 지각/조퇴는 설정된 근무 스케줄 기준으로 자동 계산됩니다.</li>
          <li>• 초과근무는 예정 퇴근 시간 이후 근무한 시간입니다.</li>
          <li>• 상세 내역은 각 행을 클릭하여 확인할 수 있습니다.</li>
        </ul>
      </div>
    </div>
  )
}
