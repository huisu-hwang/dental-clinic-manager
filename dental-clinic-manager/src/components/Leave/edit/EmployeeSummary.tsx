'use client'

import { Users } from 'lucide-react'

interface EmployeeSummaryProps {
  employee: {
    id: string
    name: string
    role: string
    hire_date?: string | null
  } | null
  balance: {
    total_days: number
    used_days: number
    pending_days: number
    remaining_days: number
    family_event_days?: number
    unpaid_days?: number
  } | null
  yearsOfService: number
}

const ROLE_LABELS: Record<string, string> = {
  owner: '원장',
  vice_director: '부원장',
  manager: '실장',
  team_leader: '진료팀장',
  staff: '직원',
}

const formatHireDate = (hireDate?: string | null): string => {
  if (!hireDate) return '입사일 미등록'
  try {
    const d = new Date(hireDate)
    if (Number.isNaN(d.getTime())) return '입사일 미등록'
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}.${m}.${day}`
  } catch {
    return '입사일 미등록'
  }
}

const getRemainingTextClass = (remaining: number): string => {
  if (remaining < 0) return 'text-at-error'
  if (remaining <= 3) return 'text-at-warning'
  return 'text-at-accent'
}

interface StatCardProps {
  label: string
  value: number
  unit?: string
  valueClassName?: string
}

const StatCard = ({ label, value, unit = '일', valueClassName }: StatCardProps) => (
  <div className="bg-white border border-at-border rounded-xl p-4">
    <div className="text-xs text-at-text-secondary mb-1">{label}</div>
    <div className="flex items-baseline">
      <span className={`text-2xl font-bold ${valueClassName ?? 'text-at-text'}`}>
        {value.toFixed(1)}
      </span>
      <span className="text-sm text-at-text-secondary ml-1">{unit}</span>
    </div>
  </div>
)

export default function EmployeeSummary({
  employee,
  balance,
  yearsOfService,
}: EmployeeSummaryProps) {
  if (!employee) {
    return (
      <div className="bg-at-surface-alt border border-at-border rounded-xl py-12 text-center">
        <Users
          className="w-10 h-10 text-at-text-weak mx-auto mb-2"
          aria-hidden="true"
        />
        <p className="text-sm text-at-text-secondary">직원을 선택해주세요</p>
      </div>
    )
  }

  const total = balance?.total_days ?? 0
  const used = balance?.used_days ?? 0
  const pending = balance?.pending_days ?? 0
  const remaining = balance?.remaining_days ?? 0
  const familyEvent = balance?.family_event_days ?? 0
  const unpaid = balance?.unpaid_days ?? 0

  const roleLabel = ROLE_LABELS[employee.role] ?? employee.role
  const remainingClass = getRemainingTextClass(remaining)

  const showSpecial = familyEvent > 0 || unpaid > 0

  return (
    <div className="space-y-3">
      <div className="bg-white border border-at-border rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-base font-semibold text-at-text">{employee.name}</span>
        <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-at-accent-light text-at-accent">
          {roleLabel}
        </span>
        <span className="text-sm text-at-text-secondary">
          {formatHireDate(employee.hire_date)}
        </span>
        <span className="text-sm text-at-text-secondary">
          {yearsOfService.toFixed(1)}년차
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="총 연차" value={total} />
        <StatCard label="사용" value={used} />
        <StatCard label="대기" value={pending} />
        <StatCard label="잔여" value={remaining} valueClassName={remainingClass} />
      </div>

      {showSpecial && (
        <div className="text-xs text-at-text-secondary px-1">
          특별휴가: 경조사 {familyEvent.toFixed(1)}일 · 무급휴가 {unpaid.toFixed(1)}일
        </div>
      )}
    </div>
  )
}
