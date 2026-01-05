'use client'

import { useState, useEffect } from 'react'
import {
  CalendarDaysIcon,
  CheckCircleIcon,
  XCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline'
import {
  getClinicHolidaySettings,
  saveClinicHolidaySettings,
  getKoreanPublicHolidays,
  type ClinicHolidaySettings,
  type PublicHoliday,
  DEFAULT_HOLIDAY_SETTINGS,
} from '@/lib/holidayService'

interface HolidaySettingsProps {
  clinicId: string
}

export default function HolidaySettings({ clinicId }: HolidaySettingsProps) {
  const [settings, setSettings] = useState<ClinicHolidaySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [currentYearHolidays, setCurrentYearHolidays] = useState<PublicHoliday[]>([])

  // 현재 연도
  const currentYear = new Date().getFullYear()

  useEffect(() => {
    fetchSettings()
    // 현재 연도 공휴일 목록 조회
    const holidays = getKoreanPublicHolidays(currentYear, true)
    setCurrentYearHolidays(holidays)
  }, [clinicId])

  const fetchSettings = async () => {
    setLoading(true)
    setError('')

    try {
      const result = await getClinicHolidaySettings(clinicId)
      if (result.success && result.settings) {
        setSettings(result.settings)
      } else {
        // 기본값 사용
        setSettings({
          id: '',
          clinic_id: clinicId,
          ...DEFAULT_HOLIDAY_SETTINGS,
          created_at: '',
          updated_at: '',
        })
      }
    } catch (err) {
      console.error('Error fetching holiday settings:', err)
      setError('공휴일 설정을 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = (field: keyof ClinicHolidaySettings) => {
    if (!settings) return
    setSettings({
      ...settings,
      [field]: !settings[field],
    })
    setSuccess('')
  }

  const handleSave = async () => {
    if (!settings) return

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const result = await saveClinicHolidaySettings(clinicId, {
        use_public_holidays: settings.use_public_holidays,
        deduct_public_holidays: settings.deduct_public_holidays,
        use_substitute_holidays: settings.use_substitute_holidays,
        deduct_substitute_holidays: settings.deduct_substitute_holidays,
        deduct_clinic_holidays: settings.deduct_clinic_holidays,
      })

      if (result.success) {
        setSuccess('설정이 저장되었습니다.')
        if (result.settings) {
          setSettings(result.settings)
        }
      } else {
        setError(result.error || '설정 저장에 실패했습니다.')
      }
    } catch (err) {
      console.error('Error saving holiday settings:', err)
      setError('설정 저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // 공휴일 타입별 색상
  const getHolidayTypeColor = (type: string) => {
    switch (type) {
      case 'fixed':
        return 'bg-red-100 text-red-700'
      case 'lunar':
        return 'bg-orange-100 text-orange-700'
      case 'substitute':
        return 'bg-blue-100 text-blue-700'
      default:
        return 'bg-slate-100 text-slate-700'
    }
  }

  const getHolidayTypeLabel = (type: string) => {
    switch (type) {
      case 'fixed':
        return '양력'
      case 'lunar':
        return '음력'
      case 'substitute':
        return '대체'
      default:
        return type
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-slate-600">설정을 불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 알림 메시지 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm flex items-center gap-2">
          <XCircleIcon className="h-5 w-5" />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md text-sm flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5" />
          {success}
        </div>
      )}

      {/* 안내 메시지 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <InformationCircleIcon className="h-5 w-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">공휴일 설정 안내</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>법정 공휴일은 근로기준법에 따라 기본적으로 휴무일로 처리됩니다.</li>
              <li>공휴일에 휴무하면 해당 날은 근무일에서 제외되어 결근으로 처리되지 않습니다.</li>
              <li>병원 지정 휴무일(여름휴가 등)은 별도로 연차 차감 여부를 설정할 수 있습니다.</li>
            </ul>
          </div>
        </div>
      </div>

      {settings && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 설정 영역 */}
          <div className="space-y-6">
            {/* 법정 공휴일 설정 */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <CalendarDaysIcon className="h-5 w-5 text-red-500" />
                법정 공휴일
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                삼일절, 광복절, 설날, 추석 등 법정 공휴일에 대한 설정입니다.
              </p>

              <div className="space-y-4">
                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-slate-700">법정 공휴일 휴무 적용</span>
                    <p className="text-xs text-slate-500">공휴일을 휴무일로 처리합니다 (근무일에서 제외)</p>
                  </div>
                  <button
                    onClick={() => handleToggle('use_public_holidays')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.use_public_holidays ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.use_public_holidays ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>

                <label className="flex items-center justify-between opacity-50 cursor-not-allowed">
                  <div>
                    <span className="text-sm font-medium text-slate-700">법정 공휴일 연차 차감</span>
                    <p className="text-xs text-slate-500">근로기준법상 차감 불가 (유급휴일)</p>
                  </div>
                  <button
                    disabled
                    className="relative inline-flex h-6 w-11 items-center rounded-full bg-slate-200"
                  >
                    <span className="inline-block h-4 w-4 transform rounded-full bg-white translate-x-1" />
                  </button>
                </label>
              </div>
            </div>

            {/* 대체 공휴일 설정 */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <CalendarDaysIcon className="h-5 w-5 text-blue-500" />
                대체 공휴일
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                공휴일이 주말과 겹칠 때 지정되는 대체 공휴일에 대한 설정입니다.
              </p>

              <div className="space-y-4">
                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-slate-700">대체 공휴일 연차 차감</span>
                    <p className="text-xs text-slate-500">
                      {settings.deduct_substitute_holidays
                        ? '대체 공휴일에 연차를 차감합니다'
                        : '대체 공휴일에 연차를 차감하지 않습니다 (유급 휴무)'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggle('deduct_substitute_holidays')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.deduct_substitute_holidays ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.deduct_substitute_holidays ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>
              </div>
            </div>

            {/* 병원 지정 휴무일 설정 */}
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <CalendarDaysIcon className="h-5 w-5 text-green-500" />
                병원 지정 휴무일
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                여름휴가, 겨울휴가 등 병원에서 지정한 휴무일에 대한 설정입니다.
              </p>

              <div className="space-y-4">
                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-slate-700">병원 지정 휴무일 연차 차감</span>
                    <p className="text-xs text-slate-500">
                      {settings.deduct_clinic_holidays
                        ? '병원 휴무일에 직원 연차를 차감합니다'
                        : '병원 휴무일에 연차를 차감하지 않습니다 (유급 휴무)'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggle('deduct_clinic_holidays')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings.deduct_clinic_holidays ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.deduct_clinic_holidays ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </label>
              </div>
            </div>

            {/* 저장 버튼 */}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-6 rounded-md transition-colors"
              >
                {saving ? '저장 중...' : '설정 저장'}
              </button>
            </div>
          </div>

          {/* 공휴일 목록 */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">
              {currentYear}년 법정 공휴일 목록
            </h3>
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-slate-600">날짜</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-600">공휴일</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-600">구분</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentYearHolidays.map((holiday, index) => (
                    <tr key={index} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-slate-800">
                        {new Date(holiday.date).toLocaleDateString('ko-KR', {
                          month: 'long',
                          day: 'numeric',
                          weekday: 'short',
                        })}
                      </td>
                      <td className="py-2 px-3 text-slate-800">{holiday.name}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getHolidayTypeColor(
                            holiday.type
                          )}`}
                        >
                          {getHolidayTypeLabel(holiday.type)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
