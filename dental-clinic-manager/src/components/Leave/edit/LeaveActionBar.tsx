'use client'

import { Plus, Minus } from 'lucide-react'

interface LeaveActionBarProps {
  disabled: boolean
  onAdd: () => void
  onDeduct: () => void
}

export default function LeaveActionBar({
  disabled,
  onAdd,
  onDeduct,
}: LeaveActionBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between bg-white border border-at-border rounded-xl p-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          className="inline-flex items-center gap-2 px-4 py-2 bg-at-success hover:opacity-90 text-white rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          aria-label="연차 추가"
          title="연차 추가"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>연차 추가</span>
        </button>
        <button
          type="button"
          onClick={onDeduct}
          disabled={disabled}
          className="inline-flex items-center gap-2 px-4 py-2 bg-at-error hover:opacity-90 text-white rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          aria-label="연차 차감"
          title="연차 차감"
        >
          <Minus className="w-4 h-4" aria-hidden="true" />
          <span>연차 차감</span>
        </button>
      </div>

      <div className="text-xs text-at-text-secondary">
        추가는 +, 차감은 - (이미 사용한 연차도 차감으로 입력)
      </div>
    </div>
  )
}
