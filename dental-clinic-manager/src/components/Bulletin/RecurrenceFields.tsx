'use client'

import type { RecurrenceType } from '@/types/bulletin'
import { WEEKDAY_LABELS, RECURRENCE_TYPE_LABELS } from '@/types/bulletin'

export interface RecurrenceFieldsValue {
  enabled: boolean
  recurrence_type: RecurrenceType
  recurrence_weekday?: number   // 0~6 (일~토)
  recurrence_day_of_month?: number
  recurrence_month?: number     // 1~12
  start_date: string
  end_date?: string
}

interface RecurrenceFieldsProps {
  value: RecurrenceFieldsValue
  onChange: (next: RecurrenceFieldsValue) => void
  /** 편집 모드: 반복을 끌 수 없는 경우 (RecurringTaskTemplateForm 용) */
  forceEnabled?: boolean
  /** 전체 섹션 감싸는 border 생략 (이미 부모가 border를 가진 경우) */
  embedded?: boolean
}

/**
 * 반복 업무 설정 입력 필드
 * TaskForm (신규 반복 생성) 및 RecurringTaskTemplateForm (편집) 에서 재사용.
 * 디자인 토큰: at-border / at-accent / at-accent-light / rounded-xl
 */
export default function RecurrenceFields({
  value,
  onChange,
  forceEnabled = false,
  embedded = false,
}: RecurrenceFieldsProps) {
  const update = (patch: Partial<RecurrenceFieldsValue>) => {
    onChange({ ...value, ...patch })
  }

  const handleToggle = (enabled: boolean) => {
    if (enabled) {
      update({ enabled: true })
    } else {
      update({ enabled: false })
    }
  }

  const handleTypeChange = (type: RecurrenceType) => {
    // 주기 변경 시 이전 주기 필드 초기화
    // quarterly: recurrence_month는 분기 내 몇 번째 달(1~3), recurrence_day_of_month는 일자
    let nextMonth: number | undefined
    if (type === 'yearly') {
      nextMonth = value.recurrence_month ?? new Date().getMonth() + 1
    } else if (type === 'quarterly') {
      const m = value.recurrence_month
      nextMonth = m && m >= 1 && m <= 3 ? m : 1
    } else {
      nextMonth = undefined
    }
    update({
      recurrence_type: type,
      recurrence_weekday: type === 'weekly' ? (value.recurrence_weekday ?? new Date().getDay()) : undefined,
      recurrence_day_of_month:
        type === 'monthly' || type === 'yearly' || type === 'quarterly'
          ? (value.recurrence_day_of_month ?? new Date().getDate())
          : undefined,
      recurrence_month: nextMonth,
    })
  }

  const showFields = forceEnabled || value.enabled

  return (
    <div className={embedded ? '' : 'space-y-4'}>
      {!forceEnabled && (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => handleToggle(e.target.checked)}
            className="w-4 h-4 rounded border-at-border text-at-accent focus:ring-2 focus:ring-at-accent"
          />
          <span className="text-sm font-medium text-at-text">반복 업무로 지정</span>
          <span className="text-xs text-at-text-weak">(정해진 주기마다 자동 생성)</span>
        </label>
      )}

      {showFields && (
        <div className="space-y-4 rounded-xl border border-at-border bg-at-surface-alt/50 p-4">
          {/* 주기 유형 */}
          <div>
            <label className="block text-sm font-medium text-at-text mb-1.5">
              반복 주기 <span className="text-at-error">*</span>
            </label>
            <div className="inline-flex rounded-xl border border-at-border overflow-hidden bg-white">
              {(Object.keys(RECURRENCE_TYPE_LABELS) as RecurrenceType[]).map((type) => {
                const active = value.recurrence_type === type
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleTypeChange(type)}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-at-accent text-white'
                        : 'text-at-text-secondary hover:bg-at-surface-alt'
                    }`}
                  >
                    {RECURRENCE_TYPE_LABELS[type]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 주간: 요일 선택 */}
          {value.recurrence_type === 'weekly' && (
            <div>
              <label className="block text-sm font-medium text-at-text mb-1.5">
                요일 <span className="text-at-error">*</span>
              </label>
              <div className="flex gap-1.5">
                {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                  const active = value.recurrence_weekday === d
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => update({ recurrence_weekday: d })}
                      className={`w-9 h-9 rounded-xl text-sm font-medium transition-colors ${
                        active
                          ? 'bg-at-accent text-white'
                          : 'bg-white text-at-text-secondary border border-at-border hover:bg-at-surface-hover'
                      }`}
                      aria-label={`${WEEKDAY_LABELS[d]}요일`}
                    >
                      {WEEKDAY_LABELS[d]}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 월간: 일자 선택 */}
          {value.recurrence_type === 'monthly' && (
            <div>
              <label className="block text-sm font-medium text-at-text mb-1.5">
                매월 <span className="text-at-error">*</span>
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={value.recurrence_day_of_month ?? ''}
                  onChange={(e) => update({ recurrence_day_of_month: Number(e.target.value) })}
                  className="w-24 px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors bg-white"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      {day}일
                    </option>
                  ))}
                </select>
                <span className="text-xs text-at-text-weak">
                  * 31일을 지정하면, 31일이 없는 달(예: 2월·4월)에는 해당 월의 말일에 생성됩니다.
                </span>
              </div>
            </div>
          )}

          {/* 분기별: 분기 내 N번째 달 + 일자 */}
          {value.recurrence_type === 'quarterly' && (
            <div>
              <label className="block text-sm font-medium text-at-text mb-1.5">
                매분기 <span className="text-at-error">*</span>
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={value.recurrence_month ?? 1}
                  onChange={(e) => update({ recurrence_month: Number(e.target.value) })}
                  className="px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors bg-white"
                >
                  <option value={1}>첫째 달</option>
                  <option value={2}>둘째 달</option>
                  <option value={3}>셋째 달</option>
                </select>
                <select
                  value={value.recurrence_day_of_month ?? ''}
                  onChange={(e) => update({ recurrence_day_of_month: Number(e.target.value) })}
                  className="w-24 px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors bg-white"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      {day}일
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-at-text-weak mt-1.5">
                * 분기는 1·2·3월 / 4·5·6월 / 7·8·9월 / 10·11·12월 기준입니다.
              </p>
            </div>
          )}

          {/* 연간: 월·일 선택 */}
          {value.recurrence_type === 'yearly' && (
            <div>
              <label className="block text-sm font-medium text-at-text mb-1.5">
                매년 <span className="text-at-error">*</span>
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={value.recurrence_month ?? ''}
                  onChange={(e) => update({ recurrence_month: Number(e.target.value) })}
                  className="w-24 px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors bg-white"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m}월
                    </option>
                  ))}
                </select>
                <select
                  value={value.recurrence_day_of_month ?? ''}
                  onChange={(e) => update({ recurrence_day_of_month: Number(e.target.value) })}
                  className="w-24 px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors bg-white"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      {day}일
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 시작일 / 종료일 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-at-text mb-1.5">
                시작일 <span className="text-at-error">*</span>
              </label>
              <input
                type="date"
                value={value.start_date}
                onChange={(e) => update({ start_date: e.target.value })}
                className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-at-text mb-1.5">
                종료일 <span className="text-at-text-weak text-xs font-normal">(선택)</span>
              </label>
              <input
                type="date"
                value={value.end_date || ''}
                onChange={(e) => update({ end_date: e.target.value || undefined })}
                className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** 주간/월간/연간 주기의 유효성 검증 헬퍼 */
export function validateRecurrence(value: RecurrenceFieldsValue): string | null {
  if (!value.enabled) return null
  if (!value.start_date) return '시작일을 지정해주세요.'
  if (value.end_date && value.end_date < value.start_date) {
    return '종료일은 시작일 이후여야 합니다.'
  }
  switch (value.recurrence_type) {
    case 'weekly':
      if (value.recurrence_weekday === undefined || value.recurrence_weekday === null) {
        return '반복할 요일을 선택해주세요.'
      }
      break
    case 'monthly':
      if (!value.recurrence_day_of_month) return '반복할 일자를 선택해주세요.'
      break
    case 'quarterly':
      if (!value.recurrence_month || value.recurrence_month < 1 || value.recurrence_month > 3) {
        return '분기 내 반복할 달(첫째/둘째/셋째)을 선택해주세요.'
      }
      if (!value.recurrence_day_of_month) return '반복할 일자를 선택해주세요.'
      break
    case 'yearly':
      if (!value.recurrence_month || !value.recurrence_day_of_month) {
        return '반복할 월과 일을 모두 선택해주세요.'
      }
      break
  }
  return null
}
