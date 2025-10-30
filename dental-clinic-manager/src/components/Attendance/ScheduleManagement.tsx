'use client'

import { useState, useEffect } from 'react'
import { scheduleService } from '@/lib/scheduleService'
import { clinicHoursService } from '@/lib/clinicHoursService'
import { useAuth } from '@/contexts/AuthContext'
import type { WorkSchedule, WeeklySchedule } from '@/types/attendance'
import { DAY_OF_WEEK_NAMES } from '@/types/attendance'
import type { ClinicHours } from '@/types/clinic'

interface User {
  id: string
  name: string
  role: string
}

export default function ScheduleManagement() {
  const { user } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 일괄 설정 모드
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkStartTime, setBulkStartTime] = useState('09:00')
  const [bulkEndTime, setBulkEndTime] = useState('18:00')
  const [bulkWorkDays, setBulkWorkDays] = useState<number[]>([1, 2, 3, 4, 5]) // 월~금

  useEffect(() => {
    if (user?.clinic_id) {
      loadUsers()
    }
  }, [user])

  useEffect(() => {
    if (selectedUser) {
      loadUserSchedule()
    }
  }, [selectedUser])

  const loadUsers = async () => {
    if (!user?.clinic_id) return

    try {
      // Supabase에서 직원 목록 조회
      const { getSupabase } = await import('@/lib/supabase')
      const supabase = getSupabase()
      if (!supabase) return

      const { data, error } = await supabase
        .from('users')
        .select('id, name, role')
        .eq('clinic_id', user.clinic_id)
        .eq('status', 'active')
        .order('name')

      if (!error && data) {
        setUsers(data)
        if (data.length > 0 && !selectedUser) {
          setSelectedUser(data[0].id)
        }
      }
    } catch (error) {
      console.error('[ScheduleManagement] Error loading users:', error)
    }
  }

  const loadUserSchedule = async () => {
    if (!selectedUser) return

    setLoading(true)
    try {
      const result = await scheduleService.getWeeklySchedule(selectedUser)
      if (result.success && result.schedule) {
        setWeeklySchedule(result.schedule)
      } else {
        setWeeklySchedule({ user_id: selectedUser, schedules: [] })
      }
    } catch (error) {
      console.error('[ScheduleManagement] Error loading schedule:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBulkScheduleCreate = async () => {
    if (!selectedUser || !user?.clinic_id) return

    setLoading(true)
    setMessage(null)

    try {
      const effectiveFrom = new Date().toISOString().split('T')[0]
      const result = await scheduleService.createWeeklyScheduleBulk(
        selectedUser,
        user.clinic_id,
        bulkStartTime + ':00',
        bulkEndTime + ':00',
        bulkWorkDays,
        effectiveFrom
      )

      if (result.success) {
        setMessage({ type: 'success', text: '주간 스케줄이 생성되었습니다!' })
        await loadUserSchedule()
        setBulkMode(false)
      } else {
        setMessage({ type: 'error', text: result.error || '스케줄 생성 실패' })
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || '스케줄 생성 중 오류가 발생했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateDaySchedule = async (
    dayOfWeek: number,
    startTime: string,
    endTime: string,
    isWorkDay: boolean
  ) => {
    if (!selectedUser) return

    setLoading(true)
    setMessage(null)

    try {
      const effectiveFrom = new Date().toISOString().split('T')[0]
      const result = await scheduleService.updateDaySchedule(
        selectedUser,
        dayOfWeek,
        startTime + ':00',
        endTime + ':00',
        isWorkDay,
        effectiveFrom
      )

      if (result.success) {
        setMessage({ type: 'success', text: `${DAY_OF_WEEK_NAMES[dayOfWeek]} 스케줄이 업데이트되었습니다!` })
        await loadUserSchedule()
      } else {
        setMessage({ type: 'error', text: result.error || '스케줄 업데이트 실패' })
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || '스케줄 업데이트 중 오류가 발생했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  const getScheduleForDay = (dayOfWeek: number): WorkSchedule | undefined => {
    return weeklySchedule?.schedules.find((s) => s.day_of_week === dayOfWeek)
  }

  const toggleWorkDay = (dayOfWeek: number) => {
    const newDays = bulkWorkDays.includes(dayOfWeek)
      ? bulkWorkDays.filter((d) => d !== dayOfWeek)
      : [...bulkWorkDays, dayOfWeek].sort()
    setBulkWorkDays(newDays)
  }

  // 병원 진료시간 불러오기
  const loadClinicHours = async () => {
    if (!user?.clinic_id) {
      setMessage({ type: 'error', text: '병원 정보를 찾을 수 없습니다.' })
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const result = await clinicHoursService.getClinicHours(user.clinic_id)

      if (result.error || !result.data || result.data.length === 0) {
        setMessage({
          type: 'error',
          text: '병원 진료시간이 설정되지 않았습니다. 병원 설정에서 진료시간을 먼저 설정해주세요.',
        })
        return
      }

      const hours = result.data as ClinicHours[]

      // 평일 중 첫 번째 영업일의 시간을 가져옴
      const firstWorkDay = hours.find((h) => h.is_open && h.day_of_week >= 1 && h.day_of_week <= 5)

      if (firstWorkDay && firstWorkDay.open_time && firstWorkDay.close_time) {
        setBulkStartTime(firstWorkDay.open_time.substring(0, 5))
        setBulkEndTime(firstWorkDay.close_time.substring(0, 5))
      }

      // 영업하는 요일만 선택
      const workDays = hours.filter((h) => h.is_open).map((h) => h.day_of_week)
      setBulkWorkDays(workDays.sort())

      setMessage({
        type: 'success',
        text: '병원 진료시간을 불러왔습니다. 필요시 수정 후 저장하세요.',
      })
    } catch (error) {
      console.error('[ScheduleManagement] Error loading clinic hours:', error)
      setMessage({
        type: 'error',
        text: '병원 진료시간을 불러오는데 실패했습니다.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">근무 스케줄 관리</h1>
        <p className="mt-1 text-sm text-gray-600">직원들의 근무 스케줄을 설정하고 관리합니다.</p>
      </div>

      {/* 직원 선택 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">직원 선택</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>
          <div className="pt-7">
            <button
              onClick={() => setBulkMode(!bulkMode)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                bulkMode
                  ? 'bg-gray-200 text-gray-700'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {bulkMode ? '개별 설정' : '일괄 설정'}
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 일괄 설정 모드 */}
      {bulkMode ? (
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">주간 스케줄 일괄 설정</h2>
            <button
              onClick={loadClinicHours}
              disabled={loading}
              className="px-4 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              병원 진료시간 가져오기
            </button>
          </div>

          {/* 시간 설정 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">출근 시간</label>
              <input
                type="time"
                value={bulkStartTime}
                onChange={(e) => setBulkStartTime(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">퇴근 시간</label>
              <input
                type="time"
                value={bulkEndTime}
                onChange={(e) => setBulkEndTime(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* 근무 요일 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">근무 요일</label>
            <div className="grid grid-cols-7 gap-2">
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <button
                  key={day}
                  onClick={() => toggleWorkDay(day)}
                  className={`py-3 rounded-lg font-medium transition-colors ${
                    bulkWorkDays.includes(day)
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {DAY_OF_WEEK_NAMES[day].substring(0, 1)}
                </button>
              ))}
            </div>
          </div>

          {/* 미리보기 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">설정 미리보기</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p>• 근무 시간: {bulkStartTime} ~ {bulkEndTime}</p>
              <p>
                • 근무 요일:{' '}
                {bulkWorkDays.length > 0
                  ? bulkWorkDays.map((d) => DAY_OF_WEEK_NAMES[d]).join(', ')
                  : '없음'}
              </p>
            </div>
          </div>

          <button
            onClick={handleBulkScheduleCreate}
            disabled={loading || bulkWorkDays.length === 0}
            className="w-full py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '저장 중...' : '스케줄 저장'}
          </button>
        </div>
      ) : (
        /* 개별 설정 모드 */
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    요일
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    근무 여부
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    출근 시간
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    퇴근 시간
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    액션
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      <div className="flex justify-center items-center space-x-2">
                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <span>로딩 중...</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => {
                    const schedule = getScheduleForDay(dayOfWeek)
                    return (
                      <DayScheduleRow
                        key={dayOfWeek}
                        dayOfWeek={dayOfWeek}
                        schedule={schedule}
                        onUpdate={handleUpdateDaySchedule}
                      />
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 도움말 */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
        <h3 className="font-semibold mb-2">📋 스케줄 관리 안내</h3>
        <ul className="space-y-1">
          <li>• 일괄 설정: 모든 요일에 동일한 시간을 한 번에 적용합니다.</li>
          <li>• 개별 설정: 각 요일별로 다른 시간을 설정할 수 있습니다.</li>
          <li>• 스케줄 변경은 즉시 적용되며, 출퇴근 시 지각/조퇴 계산에 사용됩니다.</li>
        </ul>
      </div>
    </div>
  )
}

// 요일별 스케줄 행 컴포넌트
function DayScheduleRow({
  dayOfWeek,
  schedule,
  onUpdate,
}: {
  dayOfWeek: number
  schedule?: WorkSchedule
  onUpdate: (dayOfWeek: number, startTime: string, endTime: string, isWorkDay: boolean) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [isWorkDay, setIsWorkDay] = useState(schedule?.is_work_day ?? true)
  const [startTime, setStartTime] = useState(
    schedule?.start_time ? schedule.start_time.substring(0, 5) : '09:00'
  )
  const [endTime, setEndTime] = useState(
    schedule?.end_time ? schedule.end_time.substring(0, 5) : '18:00'
  )

  const handleSave = () => {
    onUpdate(dayOfWeek, startTime, endTime, isWorkDay)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setIsWorkDay(schedule?.is_work_day ?? true)
    setStartTime(schedule?.start_time ? schedule.start_time.substring(0, 5) : '09:00')
    setEndTime(schedule?.end_time ? schedule.end_time.substring(0, 5) : '18:00')
    setIsEditing(false)
  }

  return (
    <tr className={isEditing ? 'bg-blue-50' : ''}>
      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
        {DAY_OF_WEEK_NAMES[dayOfWeek]}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {isEditing ? (
          <input
            type="checkbox"
            checked={isWorkDay}
            onChange={(e) => setIsWorkDay(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
        ) : (
          <span
            className={`px-2 py-1 text-xs font-semibold rounded-full ${
              schedule?.is_work_day
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {schedule?.is_work_day ? '근무' : '휴무'}
          </span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {isEditing ? (
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={!isWorkDay}
            className="px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
        ) : (
          <span className="text-gray-900">
            {schedule?.is_work_day && schedule?.start_time
              ? schedule.start_time.substring(0, 5)
              : '-'}
          </span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {isEditing ? (
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={!isWorkDay}
            className="px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
        ) : (
          <span className="text-gray-900">
            {schedule?.is_work_day && schedule?.end_time ? schedule.end_time.substring(0, 5) : '-'}
          </span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        {isEditing ? (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              저장
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            수정
          </button>
        )}
      </td>
    </tr>
  )
}
