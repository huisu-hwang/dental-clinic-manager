'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { leaveService } from '@/lib/leaveService'
import { appAlert } from '@/components/ui/AppDialog'
import type { LeaveType, LeaveAdjustment } from '@/types/leave'

export interface EditAdjustmentModalProps {
  open: boolean
  adjustment: LeaveAdjustment & {
    leave_types?: { name: string; code: string } | null
    adjusted_by_user?: { name: string } | null
  }
  leaveTypes: LeaveType[]
  onClose: () => void
  onSuccess: () => void
}

export default function EditAdjustmentModal({
  open,
  adjustment,
  leaveTypes,
  onClose,
  onSuccess,
}: EditAdjustmentModalProps) {
  const [days, setDays] = useState<string>('')
  const [useDate, setUseDate] = useState<string>('')
  const [leaveTypeId, setLeaveTypeId] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [submitting, setSubmitting] = useState<boolean>(false)

  const daysRef = useRef<HTMLInputElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  const isDeduct = adjustment?.adjustment_type === 'deduct'
  const isAdd = adjustment?.adjustment_type === 'add'

  // System auto-generated guard + prefill
  useEffect(() => {
    if (!open || !adjustment) return

    const reasonValue = adjustment.reason || ''
    if (reasonValue.startsWith('[병원휴무]') || reasonValue.startsWith('[법정공휴일]')) {
      // Defensive: close immediately and notify
      onClose()
      void appAlert('시스템 자동 생성 항목은 수정할 수 없습니다.')
      return
    }

    setDays(
      adjustment.days !== undefined && adjustment.days !== null
        ? String(adjustment.days)
        : ''
    )
    setUseDate(adjustment.use_date || '')
    setLeaveTypeId(adjustment.leave_type_id || '')
    setReason(reasonValue)
    setError('')
    setSubmitting(false)
  }, [open, adjustment, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const daysNumber = Number(days)
    if (!days || isNaN(daysNumber) || daysNumber <= 0) {
      setError('일수를 0보다 큰 값으로 입력해주세요.')
      daysRef.current?.focus()
      return
    }
    if (!reason.trim()) {
      setError('사유를 입력해주세요.')
      reasonRef.current?.focus()
      return
    }

    setSubmitting(true)
    try {
      const result = await leaveService.updateAdjustment(adjustment.id, {
        days: daysNumber,
        reason: reason.trim(),
        use_date: useDate || null,
        leave_type_id: leaveTypeId || null,
      })

      if (!result.success) {
        setError(result.error || '저장에 실패했습니다.')
        setSubmitting(false)
        return
      }

      onSuccess()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.'
      setError(message)
      setSubmitting(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && !submitting) onClose()
  }

  if (!adjustment) return null

  const badgeClass = isAdd
    ? 'bg-at-success-bg text-at-success'
    : 'bg-at-error-bg text-at-error'
  const badgeLabel = isAdd ? '추가' : isDeduct ? '차감' : '조정'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-white rounded-2xl border border-at-border max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 space-y-1 border-b border-at-border">
          <DialogTitle className="text-lg font-semibold text-at-text">
            연차 조정 수정
          </DialogTitle>
          <DialogDescription className="text-sm text-at-text-secondary">
            수동으로 추가/차감된 연차 조정을 수정합니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div
              role="alert"
              className="bg-at-error-bg border border-red-200 text-at-error rounded-xl p-3 text-sm"
            >
              {error}
            </div>
          )}

          {/* 유형 (읽기 전용 배지) */}
          <div>
            <span className="block text-sm font-medium text-at-text mb-1.5">유형</span>
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-medium ${badgeClass}`}
            >
              {badgeLabel}
            </span>
          </div>

          {/* 일수 */}
          <div>
            <label htmlFor="eadj-days" className="block text-sm font-medium text-at-text mb-1.5">
              일수 <span className="text-at-error">*</span>
            </label>
            <input
              id="eadj-days"
              ref={daysRef}
              type="number"
              step="0.5"
              min="0.5"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-full px-3 py-2.5 border border-at-border rounded-xl text-[16px] text-at-text focus:outline-none focus:ring-2 focus:ring-at-accent"
              disabled={submitting}
            />
          </div>

          {/* 사용일자 (차감일 때만) */}
          {isDeduct && (
            <div>
              <label htmlFor="eadj-use-date" className="block text-sm font-medium text-at-text mb-1.5">
                사용일자
              </label>
              <input
                id="eadj-use-date"
                type="date"
                value={useDate}
                onChange={(e) => setUseDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-at-border rounded-xl text-[16px] text-at-text focus:outline-none focus:ring-2 focus:ring-at-accent"
                disabled={submitting}
              />
            </div>
          )}

          {/* 연차 종류 */}
          <div>
            <label htmlFor="eadj-type" className="block text-sm font-medium text-at-text mb-1.5">
              연차 종류
            </label>
            <select
              id="eadj-type"
              value={leaveTypeId}
              onChange={(e) => setLeaveTypeId(e.target.value)}
              className="w-full px-3 py-2.5 border border-at-border rounded-xl text-[16px] text-at-text focus:outline-none focus:ring-2 focus:ring-at-accent bg-white"
              disabled={submitting}
            >
              <option value="">선택 안함</option>
              {leaveTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.name}
                </option>
              ))}
            </select>
          </div>

          {/* 사유 */}
          <div>
            <label htmlFor="eadj-reason" className="block text-sm font-medium text-at-text mb-1.5">
              사유 <span className="text-at-error">*</span>
            </label>
            <textarea
              id="eadj-reason"
              ref={reasonRef}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2.5 border border-at-border rounded-xl text-[16px] text-at-text focus:outline-none focus:ring-2 focus:ring-at-accent resize-none"
              disabled={submitting}
            />
          </div>

          <DialogFooter className="pt-2 flex flex-row justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl border border-at-border bg-white hover:bg-at-surface-alt text-at-text text-sm font-medium disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-at-accent hover:bg-at-accent-hover text-white text-sm font-medium disabled:opacity-50"
            >
              {submitting ? '처리 중...' : '저장'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
