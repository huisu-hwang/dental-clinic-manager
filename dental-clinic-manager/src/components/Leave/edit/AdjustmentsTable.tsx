'use client'

import { FileText, Pencil, Trash2 } from 'lucide-react'
import type { LeaveAdjustment, LeaveAdjustmentType } from '@/types/leave'

type AdjustmentRow = LeaveAdjustment & {
  leave_types?: { name: string; code: string } | null
  adjusted_by_user?: { name: string } | null
}

interface AdjustmentsTableProps {
  adjustments: Array<AdjustmentRow>
  onEdit: (adjustment: any) => void
  onDelete: (adjustment: any) => Promise<void>
}

const isSystemGenerated = (reason: string): boolean =>
  reason.startsWith('[병원휴무]') || reason.startsWith('[법정공휴일]')

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

interface TypeBadgeStyle {
  className: string
  label: string
}

const getTypeBadge = (type: LeaveAdjustmentType): TypeBadgeStyle => {
  switch (type) {
    case 'add':
      return {
        className:
          'inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-at-success-bg text-at-success',
        label: '추가',
      }
    case 'deduct':
      return {
        className:
          'inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-at-error-bg text-at-error',
        label: '차감',
      }
    case 'set':
    default:
      return {
        className:
          'inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-at-surface-alt text-at-text-secondary',
        label: '설정',
      }
  }
}

export default function AdjustmentsTable({
  adjustments,
  onEdit,
  onDelete,
}: AdjustmentsTableProps) {
  if (!adjustments || adjustments.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText
          className="w-10 h-10 text-at-text-weak mx-auto mb-2"
          aria-hidden="true"
        />
        <p className="text-sm text-at-text-secondary">수동 조정 내역이 없습니다</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[720px] w-full text-sm">
        <thead className="bg-at-surface-alt">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">
              적용일
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">
              유형
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">
              일수
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">
              종류
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">
              사유
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">
              등록자
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-at-text-weak uppercase tracking-wider">
              작업
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-at-border">
          {adjustments.map((adj) => {
            const badge = getTypeBadge(adj.adjustment_type)
            const reason = adj.reason ?? ''
            const isSystem = isSystemGenerated(reason)
            const typeName = adj.leave_types?.name ?? '-'
            const registrant = adj.adjusted_by_user?.name ?? '-'
            const days =
              typeof adj.days === 'number' ? adj.days : Number(adj.days ?? 0)

            return (
              <tr key={adj.id} className="hover:bg-at-surface-alt">
                <td className="px-3 py-2 text-at-text whitespace-nowrap">
                  {formatKoreanDate(adj.use_date)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={badge.className}>{badge.label}</span>
                </td>
                <td className="px-3 py-2 text-at-text whitespace-nowrap">
                  {days.toFixed(1)}일
                </td>
                <td className="px-3 py-2 text-at-text whitespace-nowrap">
                  {typeName}
                </td>
                <td className="px-3 py-2 text-at-text-secondary">
                  <div className="flex items-center gap-2">
                    <div
                      className="truncate max-w-[200px]"
                      title={reason || undefined}
                    >
                      {reason || '-'}
                    </div>
                    {isSystem && (
                      <span className="inline-flex shrink-0 px-2 py-0.5 text-xs font-medium rounded-full bg-at-surface-alt text-at-text-secondary">
                        시스템
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="text-at-text">{registrant}</div>
                  <div className="text-xs text-at-text-weak">
                    {formatKoreanDate(adj.adjusted_at ?? adj.created_at)}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(adj)}
                      disabled={isSystem}
                      className={[
                        'p-1.5 rounded-xl transition-colors',
                        isSystem
                          ? 'opacity-30 cursor-not-allowed text-at-text-secondary'
                          : 'hover:bg-at-accent-light text-at-text-secondary hover:text-at-accent',
                      ].join(' ')}
                      aria-label="수정"
                      title={
                        isSystem
                          ? '시스템 자동 생성 항목은 수정/삭제할 수 없습니다'
                          : '수정'
                      }
                    >
                      <Pencil className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (isSystem) return
                        void onDelete(adj)
                      }}
                      disabled={isSystem}
                      className={[
                        'p-1.5 rounded-xl transition-colors',
                        isSystem
                          ? 'opacity-30 cursor-not-allowed text-at-text-secondary'
                          : 'hover:bg-at-error-bg text-at-text-secondary hover:text-at-error',
                      ].join(' ')}
                      aria-label="삭제"
                      title={
                        isSystem
                          ? '시스템 자동 생성 항목은 수정/삭제할 수 없습니다'
                          : '삭제'
                      }
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
