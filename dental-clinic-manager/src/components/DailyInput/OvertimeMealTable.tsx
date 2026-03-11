'use client'

import type { OvertimeMealRowData } from '@/types'

interface OvertimeMealTableProps {
  clinicId: string
  date: string
  isReadOnly: boolean
  data: OvertimeMealRowData
  onDataChange: (data: OvertimeMealRowData) => void
}

export default function OvertimeMealTable({ clinicId, date, isReadOnly, data, onDataChange }: OvertimeMealTableProps) {

  const handleToggle = (field: 'has_lunch' | 'has_dinner') => {
    if (isReadOnly) return
    const newData = { ...data, [field]: !data[field] }
    // 해제 시 분도 초기화
    if (field === 'has_lunch' && data.has_lunch) {
      newData.lunch_overtime_minutes = 0
    }
    if (field === 'has_dinner' && data.has_dinner) {
      newData.dinner_overtime_minutes = 0
    }
    onDataChange(newData)
  }

  const handleMinutesChange = (field: 'lunch_overtime_minutes' | 'dinner_overtime_minutes', value: string) => {
    if (isReadOnly) return
    const minutes = parseInt(value, 10) || 0
    onDataChange({ ...data, [field]: Math.max(0, minutes) })
  }

  const handleNotesChange = (value: string) => {
    if (isReadOnly) return
    onDataChange({ ...data, notes: value })
  }

  const formatMinutes = (minutes: number) => {
    if (minutes <= 0) return ''
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h === 0) return `${m}분`
    if (m === 0) return `${h}시간`
    return `${h}시간 ${m}분`
  }

  const totalMinutes = (data.has_lunch ? data.lunch_overtime_minutes : 0) + (data.has_dinner ? data.dinner_overtime_minutes : 0)

  return (
    <div className="space-y-4">
      {/* 공통 적용 안내 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
        <p className="text-xs text-blue-700">
          당일 출근한 모든 임직원에게 공통 적용됩니다.
        </p>
      </div>

      {/* 점심 초과근무 */}
      <div className={`rounded-lg border-2 transition-all ${data.has_lunch ? 'bg-orange-50 border-orange-300' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center flex-wrap gap-2 p-3">
          <button
            type="button"
            onClick={() => handleToggle('has_lunch')}
            disabled={isReadOnly}
            className={`flex items-center gap-2 ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              data.has_lunch ? 'bg-orange-500 border-orange-500' : 'border-slate-300 bg-white'
            }`}>
              {data.has_lunch && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className={`text-sm font-medium ${data.has_lunch ? 'text-orange-700' : 'text-slate-600'}`}>
              점심 초과근무
            </span>
          </button>
          {data.has_lunch && (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                step="5"
                value={data.lunch_overtime_minutes || ''}
                onChange={(e) => handleMinutesChange('lunch_overtime_minutes', e.target.value)}
                readOnly={isReadOnly}
                placeholder="0"
                className="w-16 px-2 py-1 text-sm border border-orange-300 rounded-md focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-center font-medium"
              />
              <span className="text-xs text-orange-600">분</span>
              {data.lunch_overtime_minutes > 0 && (
                <span className="text-xs text-orange-500">({formatMinutes(data.lunch_overtime_minutes)})</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 저녁 초과근무 */}
      <div className={`rounded-lg border-2 transition-all ${data.has_dinner ? 'bg-violet-50 border-violet-300' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center flex-wrap gap-2 p-3">
          <button
            type="button"
            onClick={() => handleToggle('has_dinner')}
            disabled={isReadOnly}
            className={`flex items-center gap-2 ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              data.has_dinner ? 'bg-violet-500 border-violet-500' : 'border-slate-300 bg-white'
            }`}>
              {data.has_dinner && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className={`text-sm font-medium ${data.has_dinner ? 'text-violet-700' : 'text-slate-600'}`}>
              저녁 초과근무
            </span>
          </button>
          {data.has_dinner && (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                step="5"
                value={data.dinner_overtime_minutes || ''}
                onChange={(e) => handleMinutesChange('dinner_overtime_minutes', e.target.value)}
                readOnly={isReadOnly}
                placeholder="0"
                className="w-16 px-2 py-1 text-sm border border-violet-300 rounded-md focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-center font-medium"
              />
              <span className="text-xs text-violet-600">분</span>
              {data.dinner_overtime_minutes > 0 && (
                <span className="text-xs text-violet-500">({formatMinutes(data.dinner_overtime_minutes)})</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 합계 표시 */}
      {totalMinutes > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-center">
          <span className="text-sm font-medium text-purple-700">
            총 초과근무: {formatMinutes(totalMinutes)}
          </span>
        </div>
      )}

      {/* 비고 */}
      <div>
        <input
          type="text"
          value={data.notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          readOnly={isReadOnly}
          placeholder="비고 (예: 환자 응급 건 등)"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    </div>
  )
}
