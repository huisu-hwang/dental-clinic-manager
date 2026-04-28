'use client'

import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Search, Users } from 'lucide-react'

interface EmployeeSelectorProps {
  staff: Array<{ id: string; name: string; role: string; hire_date?: string | null }>
  balances: Array<{
    user_id: string
    remaining_days: number
    total_days: number
    used_days: number
  }>
  selectedUserId: string | null
  onSelect: (userId: string) => void
}

const ROLE_LABELS: Record<string, string> = {
  owner: '원장',
  vice_director: '부원장',
  manager: '실장',
  team_leader: '진료팀장',
  staff: '직원',
}

interface EmployeeRow {
  id: string
  name: string
  role: string
  hire_date?: string | null
  remaining_days: number
  total_days: number
  used_days: number
}

const getRemainingTextClass = (remaining: number): string => {
  if (remaining < 0) return 'text-at-error'
  if (remaining <= 3) return 'text-at-warning'
  return 'text-at-accent'
}

export default function EmployeeSelector({
  staff,
  balances,
  selectedUserId,
  onSelect,
}: EmployeeSelectorProps) {
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const balanceMap = useMemo(() => {
    const m = new Map<
      string,
      { remaining_days: number; total_days: number; used_days: number }
    >()
    for (const b of balances) {
      m.set(b.user_id, {
        remaining_days: b.remaining_days,
        total_days: b.total_days,
        used_days: b.used_days,
      })
    }
    return m
  }, [balances])

  const rows: EmployeeRow[] = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    return staff
      .filter((s) => {
        if (!trimmed) return true
        return s.name.toLowerCase().includes(trimmed)
      })
      .map((s) => {
        const b = balanceMap.get(s.id)
        return {
          id: s.id,
          name: s.name,
          role: s.role,
          hire_date: s.hire_date,
          remaining_days: b?.remaining_days ?? 0,
          total_days: b?.total_days ?? 0,
          used_days: b?.used_days ?? 0,
        }
      })
  }, [staff, balanceMap, query])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return
    const currentIndex = rows.findIndex((r) => r.id === selectedUserId)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, rows.length - 1)
      onSelect(rows[next].id)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0)
      onSelect(rows[prev].id)
    } else if (e.key === 'Enter') {
      if (currentIndex < 0 && rows.length > 0) {
        e.preventDefault()
        onSelect(rows[0].id)
      }
    }
  }

  return (
    <div className="bg-white border border-at-border rounded-xl overflow-hidden">
      <div className="p-3 border-b border-at-border">
        <div className="relative">
          <Search
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-at-text-weak pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="직원 검색..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-at-border rounded-xl focus:outline-none focus:ring-2 focus:ring-at-accent text-at-text bg-white"
            aria-label="직원 검색"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="w-10 h-10 text-at-text-weak mb-2" aria-hidden="true" />
          <p className="text-sm text-at-text-secondary">검색 결과가 없습니다</p>
        </div>
      ) : (
        <div
          ref={listRef}
          className="max-h-[600px] overflow-y-auto"
          onKeyDown={handleKeyDown}
          role="listbox"
          aria-label="직원 목록"
        >
          {rows.map((row) => {
            const isSelected = row.id === selectedUserId
            const remainingClass = getRemainingTextClass(row.remaining_days)

            return (
              <button
                key={row.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(row.id)}
                className={[
                  'w-full text-left px-4 py-3 border-b border-at-border last:border-0 transition-colors',
                  'focus:outline-none focus:bg-at-surface-alt',
                  isSelected
                    ? 'bg-at-accent-light border-l-4 border-l-at-accent'
                    : 'hover:bg-at-surface-alt',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-at-text truncate">
                      {row.name}
                    </div>
                    <div className="text-xs text-at-text-secondary mt-0.5">
                      {ROLE_LABELS[row.role] ?? row.role}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-semibold ${remainingClass}`}>
                      {row.remaining_days.toFixed(1)}일
                    </div>
                    <div className="text-xs text-at-text-weak mt-0.5">
                      사용 {row.used_days.toFixed(1)} / 총{' '}
                      {row.total_days.toFixed(1)}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
