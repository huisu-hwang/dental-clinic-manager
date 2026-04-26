'use client'

/**
 * 날짜 범위 선택 컴포넌트 — 백테스트 기간 입력용.
 * - 두 개의 일자 입력(시작/종료)을 한 팝업 달력에서 선택
 * - 빠른 프리셋(1주/1개월/3개월/6개월/1년/3년/올해/작년)
 * - native date input 대비 통일된 디자인 + 더 나은 사용성
 */

import { useState, useEffect, useRef, useMemo } from 'react'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'

interface Props {
  startDate: string  // 'YYYY-MM-DD'
  endDate: string    // 'YYYY-MM-DD'
  onChange: (startDate: string, endDate: string) => void
  /** 최소 선택 가능일. 기본 제한 없음 */
  minDate?: string
  /** 최대 선택 가능일. 기본 오늘 */
  maxDate?: string
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

export default function DateRangePicker({ startDate, endDate, onChange, minDate, maxDate }: Props) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const effectiveMax = maxDate ?? today

  const [open, setOpen] = useState(false)
  // 캘린더 표시 월 (Date 객체. 첫째 날 기준)
  const [viewMonth, setViewMonth] = useState<Date>(() => parseDate(endDate) ?? new Date())
  // 다음 클릭이 시작일인지 종료일인지
  const [pickStage, setPickStage] = useState<'start' | 'end'>('start')
  // hover 미리보기 (종료일 선택 단계에서)
  const [hoverDate, setHoverDate] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  // 열릴 때 viewMonth를 endDate에 맞춤
  useEffect(() => {
    if (open) {
      const target = parseDate(endDate) ?? new Date()
      setViewMonth(new Date(target.getFullYear(), target.getMonth(), 1))
      setPickStage('start')
      setHoverDate(null)
    }
  }, [open, endDate])

  const handleDateClick = (dateStr: string) => {
    if (pickStage === 'start') {
      // 시작일 선택 → endDate 유지하되 시작 > 종료면 종료를 시작과 같게
      const newEnd = dateStr > endDate ? dateStr : endDate
      onChange(dateStr, newEnd)
      setPickStage('end')
    } else {
      // 종료일 선택. 시작보다 빠르면 swap
      if (dateStr < startDate) {
        onChange(dateStr, startDate)
      } else {
        onChange(startDate, dateStr)
      }
      setPickStage('start')
      setHoverDate(null)
      // 두 날짜 모두 정해졌으니 닫기
      setOpen(false)
    }
  }

  const applyPreset = (months: number, kind: 'lookback' | 'thisYear' | 'lastYear' = 'lookback') => {
    const end = new Date(effectiveMax)
    let start: Date
    if (kind === 'thisYear') {
      start = new Date(end.getFullYear(), 0, 1)
    } else if (kind === 'lastYear') {
      start = new Date(end.getFullYear() - 1, 0, 1)
      const lastDayOfLastYear = new Date(end.getFullYear() - 1, 11, 31)
      onChange(formatDate(start), formatDate(lastDayOfLastYear))
      setOpen(false)
      return
    } else {
      start = new Date(end)
      start.setMonth(start.getMonth() - months)
    }
    onChange(formatDate(start), formatDate(end))
    setOpen(false)
  }

  const goPrevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
  const goNextMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))

  return (
    <div className="relative" ref={containerRef}>
      {/* 표시용 트리거 */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border bg-white text-sm transition-colors ${
          open ? 'border-at-accent ring-2 ring-at-accent/20' : 'border-at-border hover:border-at-accent/50'
        }`}
      >
        <Calendar className="w-4 h-4 text-at-text-secondary flex-shrink-0" />
        <span className="flex-1 text-left text-at-text font-mono text-xs sm:text-sm">
          {startDate || '시작일'} <span className="mx-1.5 text-at-text-weak">→</span> {endDate || '종료일'}
        </span>
        <span className="text-[10px] text-at-text-weak px-1.5 py-0.5 rounded bg-at-surface-alt">
          {daysBetween(startDate, endDate)}일
        </span>
      </button>

      {/* 팝업 달력 */}
      {open && (
        <div className="absolute z-30 mt-2 left-0 sm:left-auto sm:right-0 w-[320px] sm:w-[360px] bg-white rounded-2xl shadow-xl border border-at-border p-3">
          {/* 헤더: 닫기 + 단계 안내 */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-at-text-secondary">
              {pickStage === 'start' ? '🟢 시작일 선택' : '🔴 종료일 선택'}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:bg-at-surface-alt text-at-text-weak"
              title="닫기"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 빠른 프리셋 */}
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            <PresetButton onClick={() => applyPreset(0.25)}>1주</PresetButton>
            <PresetButton onClick={() => applyPreset(1)}>1개월</PresetButton>
            <PresetButton onClick={() => applyPreset(3)}>3개월</PresetButton>
            <PresetButton onClick={() => applyPreset(6)}>6개월</PresetButton>
            <PresetButton onClick={() => applyPreset(12)}>1년</PresetButton>
            <PresetButton onClick={() => applyPreset(36)}>3년</PresetButton>
            <PresetButton onClick={() => applyPreset(0, 'thisYear')}>올해</PresetButton>
            <PresetButton onClick={() => applyPreset(0, 'lastYear')}>작년</PresetButton>
          </div>

          {/* 월 네비게이션 */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={goPrevMonth}
              className="p-1.5 rounded-lg hover:bg-at-surface-alt text-at-text-secondary"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-at-text">
              {viewMonth.getFullYear()}년 {MONTH_LABELS[viewMonth.getMonth()]}
            </span>
            <button
              type="button"
              onClick={goNextMonth}
              className="p-1.5 rounded-lg hover:bg-at-surface-alt text-at-text-secondary"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DAY_LABELS.map((d, i) => (
              <div
                key={d}
                className={`text-center text-[10px] font-medium py-1 ${
                  i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : 'text-at-text-weak'
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 gap-0.5">
            {generateGrid(viewMonth).map((cell, idx) => {
              if (!cell) return <div key={idx} />

              const inRange = cell.dateStr >= startDate && cell.dateStr <= endDate
              const isStart = cell.dateStr === startDate
              const isEnd = cell.dateStr === endDate
              const isToday = cell.dateStr === today

              // hover 미리보기 (종료일 선택 단계 + hover 위치)
              const previewActive =
                pickStage === 'end' && hoverDate &&
                ((hoverDate >= startDate && cell.dateStr >= startDate && cell.dateStr <= hoverDate) ||
                  (hoverDate < startDate && cell.dateStr >= hoverDate && cell.dateStr <= startDate))

              const disabled = Boolean(
                (minDate && cell.dateStr < minDate) ||
                (effectiveMax && cell.dateStr > effectiveMax)
              )

              const baseClass = 'h-8 text-xs rounded-md flex items-center justify-center transition-colors relative'
              let stateClass = ''
              if (disabled) {
                stateClass = 'text-at-text-weak/40 cursor-not-allowed'
              } else if (isStart || isEnd) {
                stateClass = 'bg-at-accent text-white font-bold cursor-pointer'
              } else if (inRange || previewActive) {
                stateClass = 'bg-at-accent/15 text-at-accent cursor-pointer hover:bg-at-accent/25'
              } else {
                stateClass = 'text-at-text hover:bg-at-surface-alt cursor-pointer'
              }
              if (isToday && !isStart && !isEnd) stateClass += ' ring-1 ring-at-accent/40'

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && handleDateClick(cell.dateStr)}
                  onMouseEnter={() => !disabled && pickStage === 'end' && setHoverDate(cell.dateStr)}
                  onMouseLeave={() => setHoverDate(null)}
                  className={`${baseClass} ${stateClass}`}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>

          {/* 풋터: 기간 표시 */}
          <div className="mt-3 pt-2 border-t border-at-border text-[11px] text-at-text-secondary flex items-center justify-between">
            <span>총 <span className="font-semibold text-at-text">{daysBetween(startDate, endDate)}</span>일 ({Math.round(daysBetween(startDate, endDate) / 7 * 10) / 10}주)</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-at-accent font-medium hover:underline"
            >
              완료
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PresetButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[11px] px-2 py-1.5 rounded-lg bg-at-surface-alt text-at-text-secondary hover:bg-at-accent/10 hover:text-at-accent transition-colors"
    >
      {children}
    </button>
  )
}

// ============================================
// 유틸
// ============================================

function parseDate(s: string): Date | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysBetween(start: string, end: string): number {
  const s = parseDate(start)
  const e = parseDate(end)
  if (!s || !e) return 0
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)))
}

/** 6주 × 7일 = 42셀 그리드 생성. 빈 셀은 null. */
function generateGrid(viewMonth: Date): ({ day: number; dateStr: string } | null)[] {
  const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const lastDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0)
  const startWeekday = firstDay.getDay() // 0=일
  const totalDays = lastDay.getDate()

  const cells: ({ day: number; dateStr: string } | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) {
    cells.push({
      day: d,
      dateStr: formatDate(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d)),
    })
  }
  // 6주 = 42칸 채우기 (남는 트레일 셀은 null)
  while (cells.length < 42) cells.push(null)
  return cells
}
