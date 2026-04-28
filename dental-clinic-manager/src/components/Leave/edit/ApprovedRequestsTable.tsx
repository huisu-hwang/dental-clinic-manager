'use client'

import { Calendar, Pencil, Trash2 } from 'lucide-react'

interface ApprovedRequestsTableProps {
  requests: Array<any>
  onEdit: (request: any) => void
  onDelete: (request: any) => Promise<void>
}

const formatKoreanDate = (value?: string | null): string => {
  if (!value) return '-'
  try {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}.${m}.${day}`
  } catch {
    return '-'
  }
}

const formatHalfDayType = (halfDayType?: string | null): string => {
  if (halfDayType === 'AM') return '오전'
  if (halfDayType === 'PM') return '오후'
  return '-'
}

export default function ApprovedRequestsTable({
  requests,
  onEdit,
  onDelete,
}: ApprovedRequestsTableProps) {
  if (!requests || requests.length === 0) {
    return (
      <div className="text-center py-12">
        <Calendar
          className="w-10 h-10 text-at-text-weak mx-auto mb-2"
          aria-hidden="true"
        />
        <p className="text-sm text-at-text-secondary">승인된 연차가 없습니다</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[720px] w-full text-sm">
        <thead className="bg-at-surface-alt">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">
              시작일
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">
              종료일
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">
              종류
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">
              일수
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">
              반차
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">
              사유
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-at-text-weak uppercase tracking-wider">
              작업
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-at-border">
          {requests.map((req) => {
            const reason = req.reason ?? ''
            const typeName = req.leave_types?.name ?? '-'
            const totalDays =
              typeof req.total_days === 'number' ? req.total_days : Number(req.total_days ?? 0)

            return (
              <tr key={req.id} className="hover:bg-at-surface-alt">
                <td className="px-3 py-2 text-at-text whitespace-nowrap">
                  {formatKoreanDate(req.start_date)}
                </td>
                <td className="px-3 py-2 text-at-text whitespace-nowrap">
                  {formatKoreanDate(req.end_date)}
                </td>
                <td className="px-3 py-2 text-at-text whitespace-nowrap">{typeName}</td>
                <td className="px-3 py-2 text-at-text whitespace-nowrap">
                  {totalDays.toFixed(1)}일
                </td>
                <td className="px-3 py-2 text-at-text whitespace-nowrap">
                  {formatHalfDayType(req.half_day_type)}
                </td>
                <td className="px-3 py-2 text-at-text-secondary">
                  <div
                    className="truncate max-w-[200px]"
                    title={reason || undefined}
                  >
                    {reason || '-'}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(req)}
                      className="p-1.5 rounded-xl hover:bg-at-accent-light text-at-text-secondary hover:text-at-accent transition-colors"
                      aria-label="수정"
                      title="수정"
                    >
                      <Pencil className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void onDelete(req)
                      }}
                      className="p-1.5 rounded-xl hover:bg-at-error-bg text-at-text-secondary hover:text-at-error transition-colors"
                      aria-label="삭제"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
