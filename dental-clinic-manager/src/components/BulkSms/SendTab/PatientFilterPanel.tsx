'use client'

import { useState } from 'react'
import { Filter } from 'lucide-react'
import type { BulkSmsFilter } from '@/types/bulkSms'

interface Props {
  value: BulkSmsFilter
  onChange: (next: BulkSmsFilter) => void
  onApply: () => void
  loading?: boolean
}

const LAST_VISIT_PRESETS = [
  { label: '전체', from: null, to: null },
  { label: '최근 30일', daysFrom: 30, daysTo: 0 },
  { label: '최근 60일', daysFrom: 60, daysTo: 0 },
  { label: '최근 90일', daysFrom: 90, daysTo: 0 },
  { label: '90일 이상 미내원', daysFrom: null, daysTo: 90 },
  { label: '180일 이상 미내원', daysFrom: null, daysTo: 180 },
]

function daysAgo(d: number): string {
  const date = new Date()
  date.setDate(date.getDate() - d)
  return date.toISOString().slice(0, 10)
}

type BirthMode = 'none' | 'today' | 'months'

function deriveBirthMode(value: BulkSmsFilter): BirthMode {
  if (value.birthToday) return 'today'
  if ((value.birthMonths ?? []).length > 0) return 'months'
  return 'none'
}

export default function PatientFilterPanel({ value, onChange, onApply, loading }: Props) {
  const [keyword, setKeyword] = useState(value.searchKeyword ?? '')
  const [birthMode, setBirthMode] = useState<BirthMode>(() => deriveBirthMode(value))

  const update = (patch: Partial<BulkSmsFilter>) => onChange({ ...value, ...patch })

  const setBirthModeAndApply = (mode: BirthMode) => {
    setBirthMode(mode)
    if (mode === 'none') update({ birthToday: false, birthMonths: [] })
    else if (mode === 'today') update({ birthToday: true, birthMonths: [] })
    else update({ birthToday: false })
  }

  const applyPreset = (preset: typeof LAST_VISIT_PRESETS[number]) => {
    if (preset.from === null && preset.to === null && !('daysFrom' in preset)) {
      update({ lastVisitFrom: null, lastVisitTo: null })
      return
    }
    const p = preset as { daysFrom: number | null; daysTo: number | null }
    update({
      lastVisitFrom: p.daysFrom != null ? daysAgo(p.daysFrom) : null,
      lastVisitTo: p.daysTo != null ? daysAgo(p.daysTo) : null,
    })
  }

  const toggleBirthMonth = (m: number) => {
    const cur = value.birthMonths ?? []
    update({ birthMonths: cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m] })
  }

  return (
    <div className="bg-[var(--at-surface)] border border-[var(--at-border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-[var(--at-text-secondary)]" />
        <h3 className="font-medium text-[var(--at-text-primary)]">환자 필터</h3>
      </div>

      <div className="space-y-4">
        {/* 성별 */}
        <div>
          <label className="block text-sm font-medium text-[var(--at-text-primary)] mb-1.5">성별</label>
          <div className="flex gap-2">
            {(['all', 'male', 'female'] as const).map(g => (
              <button
                key={g}
                type="button"
                onClick={() => update({ gender: g })}
                className={`px-3 py-1.5 text-sm rounded-lg border ${
                  (value.gender ?? 'all') === g
                    ? 'bg-[var(--at-accent-tag)] border-[var(--at-accent)] text-[var(--at-accent)]'
                    : 'bg-white border-[var(--at-border)] text-[var(--at-text-primary)] hover:bg-[var(--at-surface-alt)]'
                }`}
              >
                {g === 'all' ? '전체' : g === 'male' ? '남' : '여'}
              </button>
            ))}
          </div>
        </div>

        {/* 연령 */}
        <div>
          <label className="block text-sm font-medium text-[var(--at-text-primary)] mb-1.5">연령</label>
          <div className="flex items-center gap-2">
            <input
              type="number" min={0} max={120} placeholder="최소"
              className="w-20 px-2 py-1.5 border border-[var(--at-border)] rounded-lg text-sm"
              value={value.ageMin ?? ''}
              onChange={e => update({ ageMin: e.target.value ? Number(e.target.value) : null })}
            />
            <span className="text-[var(--at-text-weak)]">~</span>
            <input
              type="number" min={0} max={120} placeholder="최대"
              className="w-20 px-2 py-1.5 border border-[var(--at-border)] rounded-lg text-sm"
              value={value.ageMax ?? ''}
              onChange={e => update({ ageMax: e.target.value ? Number(e.target.value) : null })}
            />
            <span className="text-sm text-[var(--at-text-secondary)]">세</span>
          </div>
        </div>

        {/* 최종 내원일 */}
        <div>
          <label className="block text-sm font-medium text-[var(--at-text-primary)] mb-1.5">최종 내원일</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {LAST_VISIT_PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="px-2.5 py-1 text-xs rounded border border-[var(--at-border)] text-[var(--at-text-primary)] hover:bg-[var(--at-surface-alt)]"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="px-2 py-1.5 border border-[var(--at-border)] rounded-lg text-sm"
              value={value.lastVisitFrom ?? ''}
              onChange={e => update({ lastVisitFrom: e.target.value || null })}
            />
            <span className="text-[var(--at-text-weak)]">~</span>
            <input
              type="date"
              className="px-2 py-1.5 border border-[var(--at-border)] rounded-lg text-sm"
              value={value.lastVisitTo ?? ''}
              onChange={e => update({ lastVisitTo: e.target.value || null })}
            />
          </div>
        </div>

        {/* 다음 예약 유무 */}
        <div>
          <label className="block text-sm font-medium text-[var(--at-text-primary)] mb-1.5">다음 예약</label>
          <div className="flex gap-2">
            {[
              { label: '전체', value: null },
              { label: '예약 있음', value: true },
              { label: '예약 없음', value: false },
            ].map(opt => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => update({ hasNextAppointment: opt.value })}
                className={`px-3 py-1.5 text-sm rounded-lg border ${
                  (value.hasNextAppointment ?? null) === opt.value
                    ? 'bg-[var(--at-accent-tag)] border-[var(--at-accent)] text-[var(--at-accent)]'
                    : 'bg-white border-[var(--at-border)] text-[var(--at-text-primary)] hover:bg-[var(--at-surface-alt)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 생일 */}
        <div>
          <label className="block text-sm font-medium text-[var(--at-text-primary)] mb-1.5">생일</label>
          <div className="flex gap-2 mb-2">
            {([
              { mode: 'none', label: '사용 안 함' },
              { mode: 'today', label: '🎂 오늘' },
              { mode: 'months', label: '월별 선택' },
            ] as const).map(opt => (
              <button
                key={opt.mode}
                type="button"
                onClick={() => setBirthModeAndApply(opt.mode)}
                className={`flex-1 px-3 py-1.5 text-sm rounded-lg border ${
                  birthMode === opt.mode
                    ? 'bg-[var(--at-accent-tag)] border-[var(--at-accent)] text-[var(--at-accent)]'
                    : 'bg-white border-[var(--at-border)] text-[var(--at-text-primary)] hover:bg-[var(--at-surface-alt)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {birthMode === 'months' && (
            <div className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                const active = (value.birthMonths ?? []).includes(m)
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleBirthMonth(m)}
                    className={`py-1 text-xs rounded border ${
                      active
                        ? 'bg-[var(--at-accent-tag)] border-[var(--at-accent)] text-[var(--at-accent)]'
                        : 'bg-white border-[var(--at-border)] text-[var(--at-text-primary)] hover:bg-[var(--at-surface-alt)]'
                    }`}
                  >
                    {m}월
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* 이름/차트번호 검색 */}
        <div>
          <label className="block text-sm font-medium text-[var(--at-text-primary)] mb-1.5">이름·차트번호 검색</label>
          <input
            type="text"
            placeholder="이름 또는 차트번호 입력"
            className="w-full px-3 py-1.5 border border-[var(--at-border)] rounded-lg text-sm"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onBlur={() => update({ searchKeyword: keyword })}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onApply}
        disabled={loading}
        className="mt-4 w-full py-2 bg-[var(--at-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {loading ? '조회 중...' : '필터 적용'}
      </button>
    </div>
  )
}
