'use client'

import { useState, useEffect } from 'react'
import { Calendar, Users, Info } from 'lucide-react'
import { workScheduleService } from '@/lib/workScheduleService'
import { clinicHoursService } from '@/lib/clinicHoursService'
import { useAuth } from '@/contexts/AuthContext'
import type { WorkSchedule, DaySchedule, DayName } from '@/types/workSchedule'
import { DAY_NAMES_KO } from '@/types/workSchedule'
import type { ClinicHours } from '@/types/clinic'
import { convertClinicHoursToWorkSchedule } from '@/utils/workScheduleUtils'
import { TimePicker } from '@/components/ui/TimePicker'

interface User {
  id: string
  name: string
  role: string
}

// 섹션 헤더 컴포넌트
const SectionHeader = ({ number, title, icon: Icon }: { number: number; title: string; icon: React.ElementType }) => (
  <div className="flex items-center space-x-3 pb-3 mb-4 border-b border-at-border">
    <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-at-accent-light text-at-accent">
      <Icon className="w-4 h-4" />
    </div>
    <h3 className="text-base font-semibold text-at-text">
      <span className="text-at-accent mr-1">{number}.</span>
      {title}
    </h3>
  </div>
)

export default function ScheduleManagement() {
  const { user } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [workSchedule, setWorkSchedule] = useState<WorkSchedule | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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
    } finally {
      setLoading(false)
    }
  }

  const loadUserSchedule = async () => {
    if (!selectedUser) return

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

  const handleUpdateDaySchedule = async (
    dayName: DayName,
    daySchedule: DaySchedule
  ) => {
    if (!selectedUser || !workSchedule) return

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

  // 병원 진료시간 불러오기
  const loadClinicHours = async () => {
    if (!user?.clinic_id || !selectedUser) {
      setMessage({ type: 'error', text: '병원 정보를 찾을 수 없습니다.' })
      return
    }

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

      // 요일별로 다른 시간을 직접 저장
      const saveResult = await workScheduleService.updateUserWorkSchedule(selectedUser, convertedSchedule)

      if (saveResult.success) {
        setMessage({
          type: 'success',
          text: '병원 진료시간을 직원 스케줄에 적용했습니다.',
        })
        await loadUserSchedule()
      } else {
        setMessage({
          type: 'error',
          text: saveResult.error || '스케줄 저장 실패',
        })
      }
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
    <div className="space-y-6">
      {/* 섹션 1: 직원 선택 */}
      <div>
        <SectionHeader number={1} title="직원 선택" icon={Users} />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-at-text-secondary mb-1.5">직원</label>
            {users.length === 0 ? (
              <div className="w-full px-3 py-2 border border-at-border rounded-xl bg-at-surface-alt text-at-text-weak">
                직원 목록을 불러오는 중... (또는 등록된 직원이 없습니다)
              </div>
            ) : (
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-end">
            <button
              onClick={loadClinicHours}
              disabled={loading || !selectedUser}
              className="w-full px-4 py-2 rounded-xl font-medium transition-colors bg-green-600 text-white hover:bg-green-700 disabled:bg-at-border disabled:cursor-not-allowed"
            >
              병원 진료시간 가져오기
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl ${
            message.type === 'success'
              ? 'bg-at-success-bg text-green-800 border border-green-200'
              : 'bg-at-error-bg text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 요일별 스케줄 */}
      <div>
        <SectionHeader number={2} title="요일별 스케줄" icon={Calendar} />
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="flex items-center space-x-2">
                <div className="w-5 h-5 border-2 border-at-accent border-t-transparent rounded-full animate-spin"></div>
                <span className="text-at-text-weak">스케줄 로딩 중...</span>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto border border-at-border rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-at-surface-alt border-b border-at-border">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-at-text-secondary uppercase tracking-wider">요일</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-at-text-secondary uppercase tracking-wider">근무 여부</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-at-text-secondary uppercase tracking-wider">출근 시간</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-at-text-secondary uppercase tracking-wider">퇴근 시간</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-at-text-secondary uppercase tracking-wider">점심시간</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-at-text-secondary uppercase tracking-wider">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-at-border">
                  {dayOrder.map((dayName) => {
                    const schedule = workSchedule?.[dayName]
                    return (
                      <DayScheduleRow
                        key={dayName}
                        dayName={dayName}
                        schedule={schedule}
                        onUpdate={handleUpdateDaySchedule}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>

      {/* 안내 */}
      <div className="p-4 bg-at-surface-alt rounded-xl border border-at-border">
        <div className="flex items-start space-x-2">
          <Info className="w-5 h-5 text-at-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-at-text-secondary mb-1">안내사항</p>
            <ul className="text-xs text-at-text-weak space-y-0.5 list-disc list-inside">
              <li>&quot;병원 진료시간 가져오기&quot;를 클릭하면 병원 설정의 진료시간을 직원 스케줄에 적용합니다.</li>
              <li>각 요일별로 다른 시간을 설정할 수 있습니다. 요일별로 &quot;수정&quot; 버튼을 클릭하세요.</li>
              <li>스케줄은 출퇴근 기록 및 근로계약서 작성 시 자동으로 사용됩니다.</li>
            </ul>
          </div>
        </div>
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

  // schedule prop이 변경되면 state 업데이트 (편집 중이 아닐 때만)
  useEffect(() => {
    if (schedule && !isEditing) {
      setIsWorking(schedule.isWorking ?? false)
      setStartTime(schedule.start || '09:00')
      setEndTime(schedule.end || '18:00')
      setBreakStart(schedule.breakStart || '12:00')
      setBreakEnd(schedule.breakEnd || '13:00')
    }
  }, [schedule, isEditing])

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
    <tr className={isEditing ? 'bg-at-accent-light' : 'hover:bg-at-surface-alt'}>
      <td className="px-4 py-3 whitespace-nowrap font-medium text-at-text">
        {DAY_NAMES_KO[dayName]}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {isEditing ? (
          <input
            type="checkbox"
            checked={isWorking}
            onChange={(e) => setIsWorking(e.target.checked)}
            className="w-4 h-4 text-at-accent border-at-border rounded focus:ring-at-accent"
          />
        ) : (
          <span
            className={`px-2 py-1 text-xs font-semibold rounded-full ${
              schedule?.isWorking
                ? 'bg-at-success-bg text-green-800'
                : 'bg-at-surface-alt text-at-text-secondary'
            }`}
          >
            {schedule?.isWorking ? '근무' : '휴무'}
          </span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {isEditing ? (
          <TimePicker
            value={startTime}
            onChange={setStartTime}
            disabled={!isWorking}
            step={30}
            minHour={6}
            maxHour={22}
            className="w-[140px]"
            aria-label="근무 시작 시간"
          />
        ) : (
          <span className="text-at-text">
            {schedule?.isWorking && schedule?.start ? schedule.start : '-'}
          </span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {isEditing ? (
          <TimePicker
            value={endTime}
            onChange={setEndTime}
            disabled={!isWorking}
            step={30}
            minHour={6}
            maxHour={22}
            className="w-[140px]"
            aria-label="근무 종료 시간"
          />
        ) : (
          <span className="text-at-text">
            {schedule?.isWorking && schedule?.end ? schedule.end : '-'}
          </span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {isEditing ? (
          <div className="flex gap-1 items-center">
            <TimePicker
              value={breakStart}
              onChange={setBreakStart}
              disabled={!isWorking}
              step={30}
              minHour={6}
              maxHour={22}
              className="w-[140px]"
              aria-label="휴게 시작 시간"
            />
            <span className="text-at-text-weak self-center">~</span>
            <TimePicker
              value={breakEnd}
              onChange={setBreakEnd}
              disabled={!isWorking}
              step={30}
              minHour={6}
              maxHour={22}
              className="w-[140px]"
              aria-label="휴게 종료 시간"
            />
          </div>
        ) : (
          <span className="text-at-text">
            {schedule?.isWorking && schedule?.breakStart && schedule?.breakEnd
              ? `${schedule.breakStart} ~ ${schedule.breakEnd}`
              : '-'}
          </span>
        )}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm">
        {isEditing ? (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="px-3 py-1 bg-at-accent text-white rounded hover:bg-at-accent-hover"
            >
              저장
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1 bg-at-border text-at-text-secondary rounded hover:bg-slate-400"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="text-at-accent hover:text-at-accent font-medium"
          >
            수정
          </button>
        )}
      </td>
    </tr>
  )
}
