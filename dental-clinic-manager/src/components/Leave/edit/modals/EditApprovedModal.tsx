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
import { appConfirm } from '@/components/ui/AppDialog'
import type { LeaveType, HalfDayType } from '@/types/leave'

export interface EditApprovedModalProps {
  open: boolean
  request: any
  leaveTypes: LeaveType[]
  onClose: () => void
  onSuccess: () => void
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function diffInDays(start: string, end: string): number {
  if (!start || !end) return 0
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (isNaN(s) || isNaN(e) || e < s) return 0
  return Math.max(1, Math.floor((e - s) / ONE_DAY_MS) + 1)
}

export default function EditApprovedModal({
  open,
  request,
  leaveTypes,
  onClose,
  onSuccess,
}: EditApprovedModalProps) {
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [leaveTypeId, setLeaveTypeId] = useState<string>('')
  const [totalDays, setTotalDays] = useState<string>('')
  const [halfDayType, setHalfDayType] = useState<'' | HalfDayType>('')
  const [reason, setReason] = useState<string>('')
  const [autoCalc, setAutoCalc] = useState<boolean>(true)

  const [error, setError] = useState<string>('')
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [deleting, setDeleting] = useState<boolean>(false)

  const startRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLInputElement>(null)
  const daysRef = useRef<HTMLInputElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  // Prefill on open / request change
  useEffect(() => {
    if (!open || !request) return
    setStartDate(request.start_date || '')
    setEndDate(request.end_date || '')
    setLeaveTypeId(request.leave_type_id || '')
    setTotalDays(
      request.total_days !== undefined && request.total_days !== null
        ? String(request.total_days)
        : ''
    )
    const hdt = request.half_day_type
    setHalfDayType(hdt === 'AM' || hdt === 'PM' ? hdt : '')
    setReason(request.reason || '')
    setAutoCalc(true)
    setError('')
    setSubmitting(false)
    setDeleting(false)
  }, [open, request])

  // Auto re-calc when start/end/halfDay changes (only if autoCalc is true)
  useEffect(() => {
    if (!autoCalc) return
    if (!startDate || !endDate) return
    if (halfDayType && startDate === endDate) {
      setTotalDays('0.5')
    } else {
      const days = diffInDays(startDate, endDate)
      if (days > 0) setTotalDays(String(days))
    }
  }, [startDate, endDate, halfDayType, autoCalc])

  const halfDayEnabled = startDate === endDate && Number(totalDays) === 0.5
  const halfDayCanToggle = startDate && endDate && startDate === endDate

  const handleDaysChange = (value: string) => {
    setAutoCalc(false)
    setTotalDays(value)
  }

  const handleHalfDayChange = (val: '' | HalfDayType) => {
    setHalfDayType(val)
    // when user explicitly toggles half-day, allow auto-calc to apply 0.5
    if (val) {
      setAutoCalc(true)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!startDate) {
      setError('시작일을 입력해주세요.')
      startRef.current?.focus()
      return
    }
    if (!endDate) {
      setError('종료일을 입력해주세요.')
      endRef.current?.focus()
      return
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError('종료일은 시작일 이후여야 합니다.')
      endRef.current?.focus()
      return
    }
    const daysNumber = Number(totalDays)
    if (!totalDays || isNaN(daysNumber) || daysNumber <= 0) {
      setError('일수를 0보다 큰 값으로 입력해주세요.')
      daysRef.current?.focus()
      return
    }
    if (!leaveTypeId) {
      setError('연차 종류를 선택해주세요.')
      return
    }

    setSubmitting(true)
    try {
      const result = await leaveService.updateApprovedRequest(request.id, {
        start_date: startDate,
        end_date: endDate,
        leave_type_id: leaveTypeId,
        total_days: daysNumber,
        half_day_type: halfDayType ? halfDayType : null,
        reason: reason.trim(),
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

  const handleDelete = async () => {
    setError('')
    const confirmed = await appConfirm({
      title: '연차 삭제',
      description: '승인된 연차를 삭제하면 잔여 연차가 복구됩니다. 계속하시겠습니까?',
      variant: 'destructive',
      confirmText: '삭제',
    })
    if (!confirmed) return

    setDeleting(true)
    try {
      const result = await leaveService.deleteApprovedRequest(request.id)
      if (!result.success) {
        setError(result.error || '삭제에 실패했습니다.')
        setDeleting(false)
        return
      }
      onSuccess()
      onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.'
      setError(message)
      setDeleting(false)
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && !submitting && !deleting) onClose()
  }

  if (!request) return null

  const userName = request.users?.name || '직원'
  const busy = submitting || deleting

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-white rounded-2xl border border-at-border max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 space-y-1 border-b border-at-border">
          <DialogTitle className="text-lg font-semibold text-at-text">승인된 연차 수정</DialogTitle>
          <DialogDescription className="text-sm text-at-text-secondary">
            {userName} 님의 승인된 연차를 수정합니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
          {error && (
            <div
              role="alert"
              className="bg-at-error-bg border border-red-200 text-at-error rounded-xl p-3 text-sm"
            >
              {error}
            </div>
          )}

          {/* 시작일 / 종료일 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ea-start" className="block text-sm font-medium text-at-text mb-1.5">
                시작일 <span className="text-at-error">*</span>
              </label>
              <input
                id="ea-start"
                ref={startRef}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-at-border rounded-xl text-[16px] text-at-text focus:outline-none focus:ring-2 focus:ring-at-accent"
                disabled={busy}
              />
            </div>
            <div>
              <label htmlFor="ea-end" className="block text-sm font-medium text-at-text mb-1.5">
                종료일 <span className="text-at-error">*</span>
              </label>
              <input
                id="ea-end"
                ref={endRef}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-at-border rounded-xl text-[16px] text-at-text focus:outline-none focus:ring-2 focus:ring-at-accent"
                disabled={busy}
              />
            </div>
          </div>

          {/* 연차 종류 */}
          <div>
            <label htmlFor="ea-type" className="block text-sm font-medium text-at-text mb-1.5">
              연차 종류 <span className="text-at-error">*</span>
            </label>
            <select
              id="ea-type"
              value={leaveTypeId}
              onChange={(e) => setLeaveTypeId(e.target.value)}
              className="w-full px-3 py-2.5 border border-at-border rounded-xl text-[16px] text-at-text focus:outline-none focus:ring-2 focus:ring-at-accent bg-white"
              disabled={busy}
            >
              <option value="">선택해주세요</option>
              {leaveTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.name}
                </option>
              ))}
            </select>
          </div>

          {/* 일수 */}
          <div>
            <label htmlFor="ea-days" className="block text-sm font-medium text-at-text mb-1.5">
              일수 <span className="text-at-error">*</span>
            </label>
            <input
              id="ea-days"
              ref={daysRef}
              type="number"
              step="0.5"
              min="0.5"
              value={totalDays}
              onChange={(e) => handleDaysChange(e.target.value)}
              className="w-full px-3 py-2.5 border border-at-border rounded-xl text-[16px] text-at-text focus:outline-none focus:ring-2 focus:ring-at-accent"
              disabled={busy}
            />
            {!autoCalc && (
              <p className="mt-1 text-xs text-at-text-weak">
                수동 입력됨 · 시작일/종료일 변경 시 자동 재계산되지 않습니다.
              </p>
            )}
          </div>

          {/* 반차 타입 */}
          <div>
            <span className="block text-sm font-medium text-at-text mb-1.5">반차 타입</span>
            <div className="flex items-center gap-3">
              {([
                { value: '', label: '없음' },
                { value: 'AM', label: '오전' },
                { value: 'PM', label: '오후' },
              ] as const).map((opt) => {
                const disabled =
                  busy ||
                  (opt.value !== '' && !halfDayCanToggle)
                return (
                  <label
                    key={opt.value || 'none'}
                    className={`inline-flex items-center gap-1.5 text-sm ${
                      disabled ? 'text-at-text-weak cursor-not-allowed' : 'text-at-text cursor-pointer'
                    }`}
                  >
                    <input
                      type="radio"
                      name="ea-half-day"
                      value={opt.value}
                      checked={halfDayType === opt.value}
                      onChange={() => handleHalfDayChange(opt.value)}
                      disabled={disabled}
                      className="accent-at-accent"
                    />
                    {opt.label}
                  </label>
                )
              })}
            </div>
            {!halfDayCanToggle && (
              <p className="mt-1 text-xs text-at-text-weak">
                반차는 시작일과 종료일이 같을 때만 선택할 수 있습니다.
              </p>
            )}
          </div>

          {/* 사유 */}
          <div>
            <label htmlFor="ea-reason" className="block text-sm font-medium text-at-text mb-1.5">
              사유
            </label>
            <textarea
              id="ea-reason"
              ref={reasonRef}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2.5 border border-at-border rounded-xl text-[16px] text-at-text focus:outline-none focus:ring-2 focus:ring-at-accent resize-none"
              disabled={busy}
            />
          </div>

          <DialogFooter className="pt-2 flex flex-row sm:justify-between items-center gap-2">
            {/* 좌측: 삭제 */}
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              aria-label="이 연차 삭제"
              className="text-at-error hover:bg-at-error-bg rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-50"
            >
              {deleting ? '삭제 중...' : '삭제'}
            </button>

            {/* 우측: 취소 / 저장 */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-4 py-2 rounded-xl border border-at-border bg-white hover:bg-at-surface-alt text-at-text text-sm font-medium disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-at-accent hover:bg-at-accent-hover text-white text-sm font-medium disabled:opacity-50"
              >
                {submitting ? '처리 중...' : '저장'}
              </button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
