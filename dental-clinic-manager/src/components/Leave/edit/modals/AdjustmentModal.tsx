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
import type { LeaveType } from '@/types/leave'

export interface AdjustmentModalProps {
  open: boolean
  mode: 'add' | 'deduct'
  userId: string
  userName: string
  year: number
  leaveTypes: LeaveType[]
  onClose: () => void
  onSuccess: () => void
}

export default function AdjustmentModal({
  open,
  mode,
  userId,
  userName,
  year,
  leaveTypes,
  onClose,
  onSuccess,
}: AdjustmentModalProps) {
  const [days, setDays] = useState<string>('')
  const [useDate, setUseDate] = useState<string>('')
  const [leaveTypeId, setLeaveTypeId] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [submitting, setSubmitting] = useState<boolean>(false)

  const daysRef = useRef<HTMLInputElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  // Reset on open/mode/userId change
  useEffect(() => {
    if (open) {
      setDays('')
      setUseDate('')
      setLeaveTypeId('')
      setReason('')
      setError('')
      setSubmitting(false)
    }
  }, [open, mode, userId])

  const isAdd = mode === 'add'
  const title = isAdd ? '연차 추가' : '연차 차감'
  const headerToneClass = isAdd
    ? 'bg-at-success-bg text-at-success'
    : 'bg-at-error-bg text-at-error'
  const reasonPlaceholder = isAdd
    ? '예: 보충 연차 부여, 연차 양도 등'
    : '예: 시스템 도입 전 사용한 연차'

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
      const result = await leaveService.addAdjustment({
        user_id: userId,
        adjustment_type: mode,
        days: daysNumber,
        year,
        reason: reason.trim(),
        leave_type_id: leaveTypeId || undefined,
        use_date: useDate || undefined,
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-white rounded-2xl border border-at-border max-w-md p-0 overflow-hidden">
        <DialogHeader className={`${headerToneClass} px-6 py-4 space-y-1`}>
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-sm opacity-80">
            {userName} 님의 {year}년 연차를 {isAdd ? '추가' : '차감'}합니다.
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

          {/* 일수 */}
          <div>
            <label htmlFor="adj-days" className="block text-sm font-medium text-at-text mb-1.5">
              일수 <span className="text-at-error">*</span>
            </label>
            <input
              id="adj-days"
              ref={daysRef}
              type="number"
              step="0.5"
              min="0.5"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="예: 1, 0.5"
              className="w-full px-3 py-2.5 border border-at-border rounded-xl text-[16px] text-at-text focus:outline-none focus:ring-2 focus:ring-at-accent"
              disabled={submitting}
            />
          </div>

          {/* 사용일자 (차감 모드만) */}
          {!isAdd && (
            <div>
              <label htmlFor="adj-use-date" className="block text-sm font-medium text-at-text mb-1.5">
                사용일자
              </label>
              <input
                id="adj-use-date"
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
            <label htmlFor="adj-type" className="block text-sm font-medium text-at-text mb-1.5">
              연차 종류
            </label>
            <select
              id="adj-type"
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
            <label htmlFor="adj-reason" className="block text-sm font-medium text-at-text mb-1.5">
              사유 <span className="text-at-error">*</span>
            </label>
            <textarea
              id="adj-reason"
              ref={reasonRef}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
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
              {submitting ? '처리 중...' : isAdd ? '추가' : '차감'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
