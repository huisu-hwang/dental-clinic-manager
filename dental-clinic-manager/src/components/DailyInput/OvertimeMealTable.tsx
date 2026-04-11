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

  const handleMinutesChange = (field: 'lunch_overtime_minutes' | 'dinner_overtime_minutes', value: string) => {
    if (isReadOnly) return
    const minutes = Math.max(0, parseInt(value, 10) || 0)
    const newData = { ...data, [field]: minutes }
    // 분 값에 따라 has_lunch/has_dinner 자동 설정
    if (field === 'lunch_overtime_minutes') newData.has_lunch = minutes > 0
    if (field === 'dinner_overtime_minutes') newData.has_dinner = minutes > 0
    onDataChange(newData)
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

  const totalMinutes = data.lunch_overtime_minutes + data.dinner_overtime_minutes

  return (
    <div className="space-y-4">
      {/* 공통 적용 안내 */}
      <div className="bg-at-accent-light border border-at-accent rounded-xl px-3 py-2">
        <p className="text-xs text-at-accent">
          당일 출근한 모든 임직원에게 공통 적용됩니다.
        </p>
      </div>

      {/* 점심 초과근무 */}
      <div className={`rounded-lg border-2 transition-all ${data.lunch_overtime_minutes > 0 ? 'bg-orange-50 border-orange-300' : 'bg-at-surface-alt border-at-border'}`}>
        <div className="flex items-center gap-2 p-3">
          <span className={`text-sm font-medium ${data.lunch_overtime_minutes > 0 ? 'text-orange-700' : 'text-slate-600'}`}>
            점심 초과근무
          </span>
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
      </div>

      {/* 저녁 초과근무 */}
      <div className={`rounded-lg border-2 transition-all ${data.dinner_overtime_minutes > 0 ? 'bg-violet-50 border-violet-300' : 'bg-at-surface-alt border-at-border'}`}>
        <div className="flex items-center gap-2 p-3">
          <span className={`text-sm font-medium ${data.dinner_overtime_minutes > 0 ? 'text-violet-700' : 'text-slate-600'}`}>
            저녁 초과근무
          </span>
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
          className="w-full px-3 py-2 text-sm border border-at-border rounded-xl focus:ring-1 focus:ring-at-accent focus:border-at-accent"
        />
      </div>
    </div>
  )
}
