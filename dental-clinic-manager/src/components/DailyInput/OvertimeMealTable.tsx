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

  const handleToggle = (field: 'has_lunch' | 'has_dinner' | 'has_overtime') => {
    if (isReadOnly) return
    const newData = { ...data, [field]: !data[field] }
    // 오버타임 해제 시 분도 초기화
    if (field === 'has_overtime' && data.has_overtime) {
      newData.overtime_minutes = 0
    }
    onDataChange(newData)
  }

  const handleMinutesChange = (value: string) => {
    if (isReadOnly) return
    const minutes = parseInt(value, 10) || 0
    onDataChange({ ...data, overtime_minutes: Math.max(0, minutes) })
  }

  const handleNotesChange = (value: string) => {
    if (isReadOnly) return
    onDataChange({ ...data, notes: value })
  }

  return (
    <div className="space-y-4">
      {/* 공통 적용 안내 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
        <p className="text-xs text-blue-700">
          당일 출근한 모든 임직원에게 공통 적용됩니다.
        </p>
      </div>

      {/* 토글 카드 */}
      <div className="grid grid-cols-3 gap-3">
        {/* 점심 OT */}
        <button
          type="button"
          onClick={() => handleToggle('has_lunch')}
          disabled={isReadOnly}
          className={`rounded-lg p-3 text-center transition-all border-2 ${
            data.has_lunch
              ? 'bg-orange-50 border-orange-400 shadow-sm'
              : 'bg-slate-50 border-slate-200 hover:border-slate-300'
          } ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
        >
          <div className={`text-2xl font-bold ${data.has_lunch ? 'text-orange-600' : 'text-slate-300'}`}>
            {data.has_lunch ? 'O' : '-'}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">점심 OT</div>
        </button>

        {/* 저녁 OT */}
        <button
          type="button"
          onClick={() => handleToggle('has_dinner')}
          disabled={isReadOnly}
          className={`rounded-lg p-3 text-center transition-all border-2 ${
            data.has_dinner
              ? 'bg-violet-50 border-violet-400 shadow-sm'
              : 'bg-slate-50 border-slate-200 hover:border-slate-300'
          } ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
        >
          <div className={`text-2xl font-bold ${data.has_dinner ? 'text-violet-600' : 'text-slate-300'}`}>
            {data.has_dinner ? 'O' : '-'}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">저녁 OT</div>
        </button>

        {/* 오버타임 */}
        <button
          type="button"
          onClick={() => handleToggle('has_overtime')}
          disabled={isReadOnly}
          className={`rounded-lg p-3 text-center transition-all border-2 ${
            data.has_overtime
              ? 'bg-rose-50 border-rose-400 shadow-sm'
              : 'bg-slate-50 border-slate-200 hover:border-slate-300'
          } ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
        >
          <div className={`text-2xl font-bold ${data.has_overtime ? 'text-rose-600' : 'text-slate-300'}`}>
            {data.has_overtime ? 'O' : '-'}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">오버타임</div>
        </button>
      </div>

      {/* 오버타임 분 입력 (오버타임 활성 시) */}
      {data.has_overtime && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
          <label className="block text-xs font-medium text-rose-700 mb-1.5">
            오버타임 시간 (분)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="5"
              value={data.overtime_minutes || ''}
              onChange={(e) => handleMinutesChange(e.target.value)}
              readOnly={isReadOnly}
              placeholder="0"
              className="w-24 px-3 py-2 text-sm border border-rose-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 text-center font-medium"
            />
            <span className="text-sm text-rose-600">분</span>
            {data.overtime_minutes > 0 && (
              <span className="text-xs text-rose-500 ml-2">
                ({Math.floor(data.overtime_minutes / 60)}시간 {data.overtime_minutes % 60}분)
              </span>
            )}
          </div>
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
