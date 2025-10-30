'use client'

import { useState, useEffect } from 'react'
import { clinicHoursService } from '@/lib/clinicHoursService'
import {
  DAY_NAMES,
  DEFAULT_CLINIC_HOURS,
  validateClinicHours,
  type ClinicHours,
  type ClinicHoliday,
  type ClinicHoursInput,
  type ClinicHolidayInput,
  type DayOfWeek,
} from '@/types/clinic'
import { ClockIcon, CalendarDaysIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'

interface ClinicHoursSettingsProps {
  clinicId: string
}

export default function ClinicHoursSettings({ clinicId }: ClinicHoursSettingsProps) {
  const [hoursData, setHoursData] = useState<ClinicHoursInput[]>(DEFAULT_CLINIC_HOURS)
  const [holidays, setHolidays] = useState<ClinicHoliday[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newHoliday, setNewHoliday] = useState<ClinicHolidayInput>({
    holiday_date: '',
    description: '',
  })
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadData()
  }, [clinicId])

  const loadData = async () => {
    setLoading(true)
    try {
      const [hoursResult, holidaysResult] = await Promise.all([
        clinicHoursService.getClinicHours(clinicId),
        clinicHoursService.getClinicHolidays(clinicId),
      ])

      if (hoursResult.error) {
        console.error('Error loading clinic hours:', hoursResult.error)
      } else if (hoursResult.data && hoursResult.data.length > 0) {
        // 데이터베이스에서 불러온 데이터를 UI용 형태로 변환
        const formattedData: ClinicHoursInput[] = hoursResult.data.map((hours: ClinicHours) => ({
          day_of_week: hours.day_of_week as DayOfWeek,
          is_open: hours.is_open,
          open_time: hours.open_time || '',
          close_time: hours.close_time || '',
          break_start: hours.break_start || '',
          break_end: hours.break_end || '',
        }))
        setHoursData(formattedData)
      } else {
        // 데이터가 없으면 기본값으로 생성
        await clinicHoursService.createDefaultHours(clinicId)
        setHoursData(DEFAULT_CLINIC_HOURS)
      }

      if (holidaysResult.error) {
        console.error('Error loading holidays:', holidaysResult.error)
      } else if (holidaysResult.data) {
        setHolidays(holidaysResult.data)
      }
    } catch (error) {
      console.error('Error loading data:', error)
      showMessage('error', '데이터를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleDayChange = (dayOfWeek: number, field: keyof ClinicHoursInput, value: string | boolean) => {
    setHoursData((prev) =>
      prev.map((day) =>
        day.day_of_week === dayOfWeek ? { ...day, [field]: value } : day
      )
    )
    // 에러 메시지 제거
    if (errors[dayOfWeek]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[dayOfWeek]
        return newErrors
      })
    }
  }

  const handleSaveHours = async () => {
    // 유효성 검증
    const newErrors: Record<number, string> = {}
    hoursData.forEach((hours) => {
      const error = validateClinicHours(hours)
      if (error) {
        newErrors[hours.day_of_week] = error
      }
    })

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      showMessage('error', '입력 내용을 확인해주세요.')
      return
    }

    setSaving(true)
    try {
      const result = await clinicHoursService.updateClinicHours(clinicId, hoursData)
      if (result.error) {
        throw result.error
      }
      showMessage('success', '진료시간이 저장되었습니다.')
    } catch (error) {
      console.error('Error saving hours:', error)
      showMessage('error', '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleAddHoliday = async () => {
    if (!newHoliday.holiday_date) {
      showMessage('error', '날짜를 선택해주세요.')
      return
    }

    try {
      const result = await clinicHoursService.addClinicHoliday(clinicId, newHoliday)
      if (result.error) {
        throw result.error
      }
      if (result.data) {
        setHolidays((prev) => [...prev, result.data!].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)))
        setNewHoliday({ holiday_date: '', description: '' })
        showMessage('success', '휴진일이 추가되었습니다.')
      }
    } catch (error) {
      console.error('Error adding holiday:', error)
      showMessage('error', '휴진일 추가에 실패했습니다.')
    }
  }

  const handleDeleteHoliday = async (holidayId: string) => {
    if (!confirm('이 휴진일을 삭제하시겠습니까?')) return

    try {
      const result = await clinicHoursService.deleteClinicHoliday(holidayId)
      if (result.error) {
        throw result.error
      }
      setHolidays((prev) => prev.filter((h) => h.id !== holidayId))
      showMessage('success', '휴진일이 삭제되었습니다.')
    } catch (error) {
      console.error('Error deleting holiday:', error)
      showMessage('error', '휴진일 삭제에 실패했습니다.')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* 메시지 */}
      {message && (
        <div className={`p-4 rounded-md ${
          message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* 요일별 진료시간 설정 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="flex items-center mb-6">
          <ClockIcon className="w-6 h-6 text-blue-600 mr-2" />
          <h3 className="text-xl font-bold text-slate-800">요일별 진료시간</h3>
        </div>

        <div className="space-y-4">
          {hoursData.map((day) => (
            <div key={day.day_of_week} className="border-b border-slate-200 pb-4 last:border-0">
              <div className="flex items-center gap-4 flex-wrap">
                {/* 요일 */}
                <div className="w-16 font-semibold text-slate-700">{DAY_NAMES[day.day_of_week]}요일</div>

                {/* 영업/휴무 토글 */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={day.is_open}
                    onChange={(e) => handleDayChange(day.day_of_week, 'is_open', e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-600">영업</span>
                </label>

                {/* 진료시간 입력 */}
                {day.is_open && (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={day.open_time}
                        onChange={(e) => handleDayChange(day.day_of_week, 'open_time', e.target.value)}
                        className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                      />
                      <span className="text-slate-600">~</span>
                      <input
                        type="time"
                        value={day.close_time}
                        onChange={(e) => handleDayChange(day.day_of_week, 'close_time', e.target.value)}
                        className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* 점심시간 입력 */}
                    <div className="flex items-center gap-2 ml-4">
                      <span className="text-sm text-slate-600">점심</span>
                      <input
                        type="time"
                        value={day.break_start}
                        onChange={(e) => handleDayChange(day.day_of_week, 'break_start', e.target.value)}
                        placeholder="시작"
                        className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                      />
                      <span className="text-slate-600">~</span>
                      <input
                        type="time"
                        value={day.break_end}
                        onChange={(e) => handleDayChange(day.day_of_week, 'break_end', e.target.value)}
                        placeholder="종료"
                        className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </>
                )}

                {/* 휴무 표시 */}
                {!day.is_open && (
                  <span className="text-red-600 font-medium">휴무</span>
                )}
              </div>

              {/* 에러 메시지 */}
              {errors[day.day_of_week] && (
                <div className="mt-2 text-sm text-red-600">{errors[day.day_of_week]}</div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSaveHours}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 font-medium"
          >
            {saving ? '저장 중...' : '진료시간 저장'}
          </button>
        </div>
      </div>

      {/* 휴진일 설정 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="flex items-center mb-6">
          <CalendarDaysIcon className="w-6 h-6 text-blue-600 mr-2" />
          <h3 className="text-xl font-bold text-slate-800">휴진일 설정</h3>
        </div>

        {/* 휴진일 추가 */}
        <div className="flex gap-4 mb-6">
          <input
            type="date"
            value={newHoliday.holiday_date}
            onChange={(e) => setNewHoliday((prev) => ({ ...prev, holiday_date: e.target.value }))}
            className="px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
          <input
            type="text"
            value={newHoliday.description}
            onChange={(e) => setNewHoliday((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="설명 (선택사항)"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={handleAddHoliday}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
          >
            <PlusIcon className="w-5 h-5" />
            추가
          </button>
        </div>

        {/* 휴진일 목록 */}
        {holidays.length > 0 ? (
          <div className="space-y-2">
            {holidays.map((holiday) => (
              <div key={holiday.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-md">
                <div>
                  <div className="font-medium text-slate-800">
                    {new Date(holiday.holiday_date).toLocaleDateString('ko-KR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      weekday: 'short',
                    })}
                  </div>
                  {holiday.description && (
                    <div className="text-sm text-slate-600">{holiday.description}</div>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteHoliday(holiday.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                  title="삭제"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            등록된 휴진일이 없습니다.
          </div>
        )}
      </div>
    </div>
  )
}
