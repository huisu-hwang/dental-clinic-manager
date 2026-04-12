'use client'

import { useState, useEffect } from 'react'
import {
  CalendarDaysIcon,
  ClockIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

interface ScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (date: string, time: string) => void
  isLoading?: boolean
}

export default function ScheduleModal({ isOpen, onClose, onConfirm, isLoading }: ScheduleModalProps) {
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('09:00')

  useEffect(() => {
    if (isOpen && !scheduleDate) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setScheduleDate(tomorrow.toISOString().split('T')[0])
    }
  }, [isOpen, scheduleDate])

  if (!isOpen) return null

  const handleConfirm = () => {
    if (!scheduleDate || !scheduleTime) return
    onConfirm(scheduleDate, scheduleTime)
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-at-border">
          <div className="flex items-center gap-2">
            <CalendarDaysIcon className="h-5 w-5 text-at-accent" />
            <h3 className="text-base font-semibold text-at-text">예약 발행 설정</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl hover:bg-at-surface-alt transition-colors"
          >
            <XMarkIcon className="h-5 w-5 text-at-text" />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm text-at-accent bg-at-accent-light rounded-xl px-3 py-2">
            <ClockIcon className="h-4 w-4 flex-shrink-0" />
            발행할 날짜와 시간을 설정해주세요.
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-at-text mb-1.5">날짜</label>
              <input
                type="date"
                value={scheduleDate}
                min={today}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-at-text mb-1.5">시간</label>
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent bg-white"
              />
            </div>
          </div>

          {scheduleDate && scheduleTime && (
            <div className="text-center text-sm text-at-text bg-at-surface-alt rounded-xl py-2">
              <span className="font-medium text-at-text">{scheduleDate}</span>
              {' '}
              <span className="font-medium text-at-accent">{scheduleTime}</span>
              에 발행됩니다.
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex gap-3 px-5 py-4 border-t border-at-border bg-at-surface-alt">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2.5 text-sm font-medium text-at-text bg-white border border-at-border rounded-xl hover:bg-at-surface-alt transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading || !scheduleDate || !scheduleTime}
            className="flex-1 py-2.5 bg-at-accent text-white rounded-xl hover:bg-at-accent-hover disabled:bg-at-border disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <CalendarDaysIcon className="h-4 w-4" />
            )}
            예약 확인
          </button>
        </div>
      </div>
    </div>
  )
}
