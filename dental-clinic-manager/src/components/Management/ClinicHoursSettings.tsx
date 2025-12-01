'use client'

import { useState, useEffect } from 'react'
import { clinicHoursService } from '@/lib/clinicHoursService'
import { useAuth } from '@/contexts/AuthContext'
import {
  DAY_NAMES,
  DEFAULT_CLINIC_HOURS,
  validateClinicHours,
  type BreakTime,
  type ClinicHours,
  type ClinicHoliday,
  type ClinicHoursInput,
  type ClinicHolidayInput,
  type DayOfWeek,
} from '@/types/clinic'
import { ClockIcon, CalendarDaysIcon, PlusIcon, TrashIcon, PlusCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'

interface ClinicHoursSettingsProps {
  clinicId: string
}

export default function ClinicHoursSettings({ clinicId }: ClinicHoursSettingsProps) {
  const { user } = useAuth()
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
    console.log('[ClinicHoursSettings] Loading data for clinic:', clinicId)

    try {
      const [hoursResult, holidaysResult] = await Promise.all([
        clinicHoursService.getClinicHours(clinicId),
        clinicHoursService.getClinicHolidays(clinicId),
      ])

      console.log('[ClinicHoursSettings] Hours result:', hoursResult)
      console.log('[ClinicHoursSettings] Holidays result:', holidaysResult)

      // 테이블이 없는 경우 체크
      if (hoursResult.error) {
        const errorMessage = hoursResult.error.message || hoursResult.error.toString()
        console.error('[ClinicHoursSettings] Error loading clinic hours:', errorMessage)

        if (errorMessage.includes('relation') || errorMessage.includes('does not exist')) {
          showMessage('error', '⚠️ 데이터베이스 테이블이 생성되지 않았습니다. Supabase Dashboard에서 Migration SQL을 실행해주세요.')
          setHoursData(DEFAULT_CLINIC_HOURS) // 기본값으로 UI는 표시
          setLoading(false)
          return
        }
      } else if (hoursResult.data && hoursResult.data.length > 0) {
        // 데이터베이스에서 불러온 데이터를 UI용 형태로 변환
        const formattedData: ClinicHoursInput[] = hoursResult.data.map((hours: ClinicHours) => {
          // 휴게시간 배열 생성
          const breaks: BreakTime[] = []
          if (hours.break_start && hours.break_end) {
            breaks.push({ start: hours.break_start, end: hours.break_end })
          }
          if (hours.additional_breaks && hours.additional_breaks.length > 0) {
            breaks.push(...hours.additional_breaks)
          }

          return {
            day_of_week: hours.day_of_week as DayOfWeek,
            is_open: hours.is_open,
            open_time: hours.open_time || '',
            close_time: hours.close_time || '',
            break_start: hours.break_start || '',
            break_end: hours.break_end || '',
            breaks,
          }
        })
        setHoursData(formattedData)
        console.log('[ClinicHoursSettings] Loaded hours data:', formattedData)
      } else {
        // 데이터가 없으면 기본값으로 생성 시도
        console.log('[ClinicHoursSettings] No hours data, creating defaults')
        const createResult = await clinicHoursService.createDefaultHours(clinicId)
        if (createResult.error) {
          console.error('[ClinicHoursSettings] Error creating default hours:', createResult.error)
        }
        setHoursData(DEFAULT_CLINIC_HOURS)
      }

      if (holidaysResult.error) {
        const errorMessage = holidaysResult.error.message || holidaysResult.error.toString()
        console.error('[ClinicHoursSettings] Error loading holidays:', errorMessage)

        if (!errorMessage.includes('relation') && !errorMessage.includes('does not exist')) {
          // 테이블은 있는데 다른 에러인 경우에만 메시지 표시
          showMessage('error', `휴진일 로드 실패: ${errorMessage}`)
        }
      } else if (holidaysResult.data) {
        setHolidays(holidaysResult.data)
        console.log('[ClinicHoursSettings] Loaded holidays:', holidaysResult.data)
      }
    } catch (error: any) {
      console.error('[ClinicHoursSettings] Exception loading data:', error)
      const errorMessage = error.message || error.toString()

      if (errorMessage.includes('relation') || errorMessage.includes('does not exist')) {
        showMessage('error', '⚠️ 데이터베이스 테이블이 없습니다. Migration을 먼저 실행해주세요.')
      } else {
        showMessage('error', `데이터 로드 실패: ${errorMessage}`)
      }
      setHoursData(DEFAULT_CLINIC_HOURS)
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

  // 휴게시간 추가
  const handleAddBreak = (dayOfWeek: number) => {
    setHoursData((prev) =>
      prev.map((day) => {
        if (day.day_of_week === dayOfWeek) {
          return {
            ...day,
            breaks: [...day.breaks, { start: '', end: '' }],
          }
        }
        return day
      })
    )
  }

  // 휴게시간 삭제
  const handleRemoveBreak = (dayOfWeek: number, breakIndex: number) => {
    setHoursData((prev) =>
      prev.map((day) => {
        if (day.day_of_week === dayOfWeek) {
          const newBreaks = day.breaks.filter((_, index) => index !== breakIndex)
          return {
            ...day,
            breaks: newBreaks,
          }
        }
        return day
      })
    )
  }

  // 휴게시간 수정
  const handleBreakChange = (dayOfWeek: number, breakIndex: number, field: 'start' | 'end', value: string) => {
    setHoursData((prev) =>
      prev.map((day) => {
        if (day.day_of_week === dayOfWeek) {
          const newBreaks = day.breaks.map((breakTime, index) => {
            if (index === breakIndex) {
              return { ...breakTime, [field]: value }
            }
            return breakTime
          })
          return {
            ...day,
            breaks: newBreaks,
          }
        }
        return day
      })
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
    console.log('[ClinicHoursSettings] Saving hours for clinic:', clinicId)
    console.log('[ClinicHoursSettings] Hours data:', hoursData)
    console.log('[ClinicHoursSettings] User ID:', user?.id)

    try {
      const result = await clinicHoursService.updateClinicHours(clinicId, hoursData, user?.id)
      console.log('[ClinicHoursSettings] Save result:', result)

      if (result.error) {
        console.error('[ClinicHoursSettings] Error from service:', result.error)

        // 테이블이 없는 경우
        if (result.error.message?.includes('relation') || result.error.message?.includes('does not exist')) {
          showMessage('error', '데이터베이스 테이블이 생성되지 않았습니다. Migration을 먼저 실행해주세요. (Supabase Dashboard > SQL Editor)')
        } else {
          showMessage('error', `저장 실패: ${result.error.message || '알 수 없는 오류'}`)
        }
        return
      }

      showMessage('success', '진료시간이 저장되었습니다.')
      console.log('[ClinicHoursSettings] Successfully saved hours')
    } catch (error: any) {
      console.error('[ClinicHoursSettings] Exception while saving hours:', error)

      const errorMessage = error.message || error.toString()

      if (errorMessage.includes('relation') || errorMessage.includes('does not exist')) {
        showMessage('error', '⚠️ 데이터베이스 테이블이 없습니다. Supabase Dashboard에서 Migration을 실행해주세요.')
      } else if (errorMessage.includes('permission') || errorMessage.includes('RLS')) {
        showMessage('error', '권한이 없습니다. 관리자에게 문의해주세요.')
      } else {
        showMessage('error', `저장 실패: ${errorMessage}`)
      }
    } finally {
      setSaving(false)
      console.log('[ClinicHoursSettings] Save operation completed')
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

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

  return (
    <div className="space-y-6">
      {/* 메시지 */}
      {message && (
        <div className={`p-4 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* 요일별 진료시간 설정 */}
      <div>
        <SectionHeader number={1} title="요일별 진료시간" icon={ClockIcon} />
        <div className="space-y-2">
          {hoursData.map((day) => (
            <div key={day.day_of_week} className="border border-slate-200 rounded-lg p-3 sm:p-4 hover:bg-slate-50 transition-colors">
              <div className="flex flex-col gap-2">
                {/* 상단: 요일 + 근무시간 + 휴게시간 헤더 */}
                <div className="flex items-center gap-4 flex-wrap">
                  {/* 요일 */}
                  <div className="w-14 font-semibold text-slate-700">{DAY_NAMES[day.day_of_week]}요일</div>

                  {/* 근무시간 섹션 */}
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={day.is_open}
                        onChange={(e) => handleDayChange(day.day_of_week, 'is_open', e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-600 whitespace-nowrap">근무시간</span>
                    </label>

                    {day.is_open && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="time"
                          value={day.open_time}
                          onChange={(e) => handleDayChange(day.day_of_week, 'open_time', e.target.value)}
                          step="1800"
                          className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-[130px]"
                        />
                        <span className="text-slate-400 text-sm">~</span>
                        <input
                          type="time"
                          value={day.close_time}
                          onChange={(e) => handleDayChange(day.day_of_week, 'close_time', e.target.value)}
                          step="1800"
                          className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-[130px]"
                        />
                      </div>
                    )}

                    {!day.is_open && (
                      <span className="px-2 py-1 bg-red-100 text-red-600 rounded-full text-xs font-semibold">휴무</span>
                    )}
                  </div>

                  {/* 휴게시간 섹션 */}
                  {day.is_open && (
                    <div className="flex flex-col gap-2 border-l border-slate-200 pl-4">
                      {/* 첫 번째 줄: 휴게시간 라벨 + 첫 번째 입력폼 + 추가 버튼 */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-500 whitespace-nowrap">휴게시간</span>
                        {day.breaks.length > 0 && (
                          <div className="flex items-center gap-1.5 bg-white px-2 py-1.5 rounded-lg border border-slate-200">
                            <input
                              type="time"
                              value={day.breaks[0].start}
                              onChange={(e) => handleBreakChange(day.day_of_week, 0, 'start', e.target.value)}
                              step="1800"
                              className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-[130px]"
                            />
                            <span className="text-slate-400 text-sm">~</span>
                            <input
                              type="time"
                              value={day.breaks[0].end}
                              onChange={(e) => handleBreakChange(day.day_of_week, 0, 'end', e.target.value)}
                              step="1800"
                              className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-[130px]"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveBreak(day.day_of_week, 0)}
                              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                              title="삭제"
                            >
                              <XCircleIcon className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleAddBreak(day.day_of_week)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1.5 rounded-lg transition-colors"
                        >
                          <PlusCircleIcon className="w-4 h-4" />
                          추가
                        </button>
                      </div>

                      {/* 추가 휴게시간 목록 - 첫 번째 입력폼 아래에 정렬 */}
                      {day.breaks.length > 1 && (
                        <div className="flex flex-col gap-2 ml-[60px]">
                          {day.breaks.slice(1).map((breakTime, idx) => {
                            const breakIndex = idx + 1
                            return (
                              <div key={breakIndex} className="flex items-center gap-1.5 bg-white px-2 py-1.5 rounded-lg border border-slate-200 w-fit">
                                <input
                                  type="time"
                                  value={breakTime.start}
                                  onChange={(e) => handleBreakChange(day.day_of_week, breakIndex, 'start', e.target.value)}
                                  step="1800"
                                  className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-[130px]"
                                />
                                <span className="text-slate-400 text-sm">~</span>
                                <input
                                  type="time"
                                  value={breakTime.end}
                                  onChange={(e) => handleBreakChange(day.day_of_week, breakIndex, 'end', e.target.value)}
                                  step="1800"
                                  className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-[130px]"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBreak(day.day_of_week, breakIndex)}
                                  className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                  title="삭제"
                                >
                                  <XCircleIcon className="w-4 h-4" />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
              </div>

              {/* 에러 메시지 */}
              {errors[day.day_of_week] && (
                <div className="mt-2 text-sm text-red-600">{errors[day.day_of_week]}</div>
              )}
            </div>
          ))}
        </div>

        {/* 저장 버튼 */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSaveHours}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 font-medium transition-colors"
          >
            {saving ? '저장 중...' : '진료시간 저장'}
          </button>
        </div>
      </div>

      {/* 휴진일 설정 */}
      <div>
        <SectionHeader number={2} title="휴진일 설정" icon={CalendarDaysIcon} />

        {/* 휴진일 추가 */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="date"
            value={newHoliday.holiday_date}
            onChange={(e) => setNewHoliday((prev) => ({ ...prev, holiday_date: e.target.value }))}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <input
            type="text"
            value={newHoliday.description}
            onChange={(e) => setNewHoliday((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="설명 (선택사항)"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={handleAddHoliday}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            추가
          </button>
        </div>

        {/* 휴진일 목록 */}
        {holidays.length > 0 ? (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="divide-y divide-slate-200">
              {holidays.map((holiday) => (
                <div key={holiday.id} className="flex items-center justify-between p-3 sm:p-4 hover:bg-slate-50 transition-colors">
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
                      <div className="text-sm text-slate-500 mt-0.5">{holiday.description}</div>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteHoliday(holiday.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="삭제"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 border border-slate-200 rounded-lg">
            <CalendarDaysIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">등록된 휴진일이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  )
}
