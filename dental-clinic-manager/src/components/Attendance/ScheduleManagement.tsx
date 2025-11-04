'use client'

import { useState, useEffect } from 'react'
import { workScheduleService } from '@/lib/workScheduleService'
import { clinicHoursService } from '@/lib/clinicHoursService'
import { useAuth } from '@/contexts/AuthContext'
import type { WorkSchedule, DaySchedule, DayName } from '@/types/workSchedule'
import { DAY_NAMES_KO } from '@/types/workSchedule'
import type { ClinicHours } from '@/types/clinic'
import { convertClinicHoursToWorkSchedule } from '@/utils/workScheduleUtils'

interface User {
  id: string
  name: string
  role: string
}

export default function ScheduleManagement() {
  const { user } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [workSchedule, setWorkSchedule] = useState<WorkSchedule | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 일괄 설정 모드
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkStartTime, setBulkStartTime] = useState('09:00')
  const [bulkEndTime, setBulkEndTime] = useState('18:00')
  const [bulkBreakStart, setBulkBreakStart] = useState('12:00')
  const [bulkBreakEnd, setBulkBreakEnd] = useState('13:00')
  const [bulkWorkDays, setBulkWorkDays] = useState<DayName[]>(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])

  const dayOrder: DayName[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

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
      const result = await workScheduleService.getUserWorkSchedule(selectedUser)
      if (result.data) {
        setWorkSchedule(result.data)
      } else {
        setWorkSchedule(null)
      }
    } catch (error) {
      console.error('[ScheduleManagement] Error loading schedule:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBulkScheduleCreate = async () => {
    if (!selectedUser) return

    setLoading(true)
    setMessage(null)

    try {
      // WorkSchedule 객체 생성
      const newSchedule: WorkSchedule = {} as WorkSchedule

      dayOrder.forEach(day => {
        if (bulkWorkDays.includes(day)) {
          newSchedule[day] = {
            start: bulkStartTime,
            end: bulkEndTime,
            breakStart: bulkBreakStart,
            breakEnd: bulkBreakEnd,
            isWorking: true,
          }
        } else {
          newSchedule[day] = {
            start: null,
            end: null,
            breakStart: null,
            breakEnd: null,
            isWorking: false,
          }
        }
      })

      const result = await workScheduleService.updateUserWorkSchedule(selectedUser, newSchedule)

      if (result.success) {
        setMessage({ type: 'success', text: '주간 스케줄이 저장되었습니다!' })
        await loadUserSchedule()
        setBulkMode(false)
      } else {
        setMessage({ type: 'error', text: result.error || '스케줄 저장 실패' })
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || '스케줄 저장 중 오류가 발생했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateDaySchedule = async (
    dayName: DayName,
    daySchedule: DaySchedule
  ) => {
    if (!selectedUser || !workSchedule) return

    setLoading(true)
    setMessage(null)

    try {
      const updatedSchedule = {
        ...workSchedule,
        [dayName]: daySchedule,
      }

      const result = await workScheduleService.updateUserWorkSchedule(selectedUser, updatedSchedule)

      if (result.success) {
        setMessage({ type: 'success', text: `${DAY_NAMES_KO[dayName]} 스케줄이 업데이트되었습니다!` })
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

  const toggleWorkDay = (dayName: DayName) => {
    const newDays = bulkWorkDays.includes(dayName)
      ? bulkWorkDays.filter((d) => d !== dayName)
      : [...bulkWorkDays, dayName]
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

      // clinic_hours를 WorkSchedule로 변환
      const convertedSchedule = convertClinicHoursToWorkSchedule(hours)

      // 일괄 설정 필드에 반영
      const firstWorkDay = Object.entries(convertedSchedule).find(
        ([_, schedule]) => schedule.isWorking
      )

      if (firstWorkDay) {
        const [_, schedule] = firstWorkDay
        setBulkStartTime(schedule.start || '09:00')
        setBulkEndTime(schedule.end || '18:00')
        setBulkBreakStart(schedule.breakStart || '12:00')
        setBulkBreakEnd(schedule.breakEnd || '13:00')
      }

      // 영업하는 요일만 선택
      const workDayNames = Object.entries(convertedSchedule)
        .filter(([_, schedule]) => schedule.isWorking)
        .map(([dayName]) => dayName as DayName)
      setBulkWorkDays(workDayNames)

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
            {users.length === 0 ? (
              <div className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                직원 목록을 불러오는 중... (또는 등록된 직원이 없습니다)
              </div>
            ) : (
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
            )}
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">점심 시작</label>
              <input
                type="time"
                value={bulkBreakStart}
                onChange={(e) => setBulkBreakStart(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">점심 종료</label>
              <input
                type="time"
                value={bulkBreakEnd}
                onChange={(e) => setBulkBreakEnd(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* 근무 요일 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">근무 요일</label>
            <div className="grid grid-cols-7 gap-2">
              {dayOrder.map((day) => (
                <button
                  key={day}
                  onClick={() => toggleWorkDay(day)}
                  className={`py-3 rounded-lg font-medium transition-colors ${
                    bulkWorkDays.includes(day)
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {DAY_NAMES_KO[day].substring(0, 1)}
                </button>
              ))}
            </div>
          </div>

          {/* 미리보기 */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">설정 미리보기</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p>• 근무 시간: {bulkStartTime} ~ {bulkEndTime}</p>
              <p>• 점심 시간: {bulkBreakStart} ~ {bulkBreakEnd}</p>
              <p>
                • 근무 요일:{' '}
                {bulkWorkDays.length > 0
                  ? bulkWorkDays.map((d) => DAY_NAMES_KO[d]).join(', ')
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
                    점심시간
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    액션
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      <div className="flex justify-center items-center space-x-2">
                        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <span>로딩 중...</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  dayOrder.map((dayName) => {
                    const schedule = workSchedule?.[dayName]
                    return (
                      <DayScheduleRow
                        key={dayName}
                        dayName={dayName}
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
          <li>• 스케줄은 출퇴근 기록 및 근로계약서 작성 시 자동으로 사용됩니다.</li>
          <li>• &quot;병원 진료시간 가져오기&quot;를 클릭하면 병원 진료시간을 기본값으로 불러옵니다.</li>
        </ul>
      </div>
    </div>
  )
}

// 요일별 스케줄 행 컴포넌트
function DayScheduleRow({
  dayName,
  schedule,
  onUpdate,
}: {
  dayName: DayName
  schedule?: DaySchedule
  onUpdate: (dayName: DayName, schedule: DaySchedule) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [isWorking, setIsWorking] = useState(schedule?.isWorking ?? false)
  const [startTime, setStartTime] = useState(schedule?.start || '09:00')
  const [endTime, setEndTime] = useState(schedule?.end || '18:00')
  const [breakStart, setBreakStart] = useState(schedule?.breakStart || '12:00')
  const [breakEnd, setBreakEnd] = useState(schedule?.breakEnd || '13:00')

  // schedule prop이 변경되면 state 업데이트
  useEffect(() => {
    if (schedule) {
      setIsWorking(schedule.isWorking ?? false)
      setStartTime(schedule.start || '09:00')
      setEndTime(schedule.end || '18:00')
      setBreakStart(schedule.breakStart || '12:00')
      setBreakEnd(schedule.breakEnd || '13:00')
    }
  }, [schedule])

  const handleSave = () => {
    onUpdate(dayName, {
      start: isWorking ? startTime : null,
      end: isWorking ? endTime : null,
      breakStart: isWorking ? breakStart : null,
      breakEnd: isWorking ? breakEnd : null,
      isWorking,
    })
    setIsEditing(false)
  }

  const handleCancel = () => {
    setIsWorking(schedule?.isWorking ?? false)
    setStartTime(schedule?.start || '09:00')
    setEndTime(schedule?.end || '18:00')
    setBreakStart(schedule?.breakStart || '12:00')
    setBreakEnd(schedule?.breakEnd || '13:00')
    setIsEditing(false)
  }

  return (
    <tr className={isEditing ? 'bg-blue-50' : ''}>
      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
        {DAY_NAMES_KO[dayName]}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {isEditing ? (
          <input
            type="checkbox"
            checked={isWorking}
            onChange={(e) => setIsWorking(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
        ) : (
          <span
            className={`px-2 py-1 text-xs font-semibold rounded-full ${
              schedule?.isWorking
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {schedule?.isWorking ? '근무' : '휴무'}
          </span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {isEditing ? (
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={!isWorking}
            className="px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
        ) : (
          <span className="text-gray-900">
            {schedule?.isWorking && schedule?.start ? schedule.start : '-'}
          </span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {isEditing ? (
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={!isWorking}
            className="px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
        ) : (
          <span className="text-gray-900">
            {schedule?.isWorking && schedule?.end ? schedule.end : '-'}
          </span>
        )}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {isEditing ? (
          <div className="flex gap-1">
            <input
              type="time"
              value={breakStart}
              onChange={(e) => setBreakStart(e.target.value)}
              disabled={!isWorking}
              className="px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 w-24"
            />
            <span className="text-gray-500">~</span>
            <input
              type="time"
              value={breakEnd}
              onChange={(e) => setBreakEnd(e.target.value)}
              disabled={!isWorking}
              className="px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 w-24"
            />
          </div>
        ) : (
          <span className="text-gray-900">
            {schedule?.isWorking && schedule?.breakStart && schedule?.breakEnd
              ? `${schedule.breakStart} ~ ${schedule.breakEnd}`
              : '-'}
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
