'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Users,
  CheckCircle,
  Percent,
  Loader2,
  ClipboardList,
  Phone
} from 'lucide-react'
import { recallService } from '@/lib/recallService'
import {
  RECALL_STATUS_LABELS,
  RECALL_STATUS_COLORS
} from '@/types/recall'
import type { RecallPatient } from '@/types/recall'

function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${days[date.getDay()]})`
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 11) return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`
  if (cleaned.length === 10) return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  return phone
}

export default function RecallDailyLog() {
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()))
  const [patients, setPatients] = useState<RecallPatient[]>([])
  const [recallCount, setRecallCount] = useState(0)
  const [bookingCount, setBookingCount] = useState(0)
  const [bookingNames, setBookingNames] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadActivity = useCallback(async (date: string) => {
    setLoading(true)
    setError(null)
    const result = await recallService.patients.getDailyRecallActivity(date)
    if (result.success && result.data) {
      setPatients(result.data.patients)
      setRecallCount(result.data.recallCount)
      setBookingCount(result.data.recallBookingCount)
      setBookingNames(result.data.recallBookingNames)
    } else {
      setError(result.error || '데이터를 불러오지 못했습니다.')
      setPatients([])
      setRecallCount(0)
      setBookingCount(0)
      setBookingNames('')
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadActivity(selectedDate) }, [selectedDate, loadActivity])

  const changeDate = (days: number) => {
    const date = new Date(selectedDate)
    date.setDate(date.getDate() + days)
    const today = new Date()
    if (date > today) return
    setSelectedDate(formatDate(date))
  }

  const isToday = selectedDate === formatDate(new Date())
  const successRate = recallCount > 0 ? Math.round((bookingCount / recallCount) * 100) : 0

  return (
    <div className="space-y-5">
      {/* 날짜 네비게이션 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => changeDate(-1)} className="p-1.5 rounded-xl hover:bg-at-surface-hover transition-colors">
            <ChevronLeft className="w-5 h-5 text-at-text-secondary" />
          </button>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-at-accent" />
            <input
              type="date"
              value={selectedDate}
              max={formatDate(new Date())}
              onChange={e => setSelectedDate(e.target.value)}
              className="text-sm font-medium text-at-text border border-at-border rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-at-accent"
            />
            <span className="text-sm text-at-text-weak hidden sm:inline">{formatDateLabel(selectedDate)}</span>
          </div>
          <button
            onClick={() => changeDate(1)}
            disabled={isToday}
            className="p-1.5 rounded-xl hover:bg-at-surface-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5 text-at-text-secondary" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {!isToday && (
            <button
              onClick={() => setSelectedDate(formatDate(new Date()))}
              className="text-xs text-at-accent hover:text-at-accent-hover font-medium px-2 py-1 rounded-lg hover:bg-at-accent-light"
            >
              오늘
            </button>
          )}
          <button
            onClick={() => loadActivity(selectedDate)}
            disabled={loading}
            className="p-1.5 rounded-xl hover:bg-at-surface-hover transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 text-at-text-secondary ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <div className="text-sm text-at-error bg-at-error-bg px-4 py-3 rounded-xl border border-red-200">
          {error}
        </div>
      )}

      {/* 로딩 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-at-accent" />
          <span className="ml-2 text-sm text-at-text-weak">로딩 중...</span>
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-at-surface-alt rounded-xl p-4 text-center">
              <Users className="w-5 h-5 text-at-text-weak mx-auto mb-1.5" />
              <p className="text-2xl font-bold text-at-text">{recallCount}</p>
              <p className="text-xs text-at-text-weak mt-0.5">리콜 처리</p>
            </div>
            <div className="bg-at-success-bg rounded-xl p-4 text-center">
              <CheckCircle className="w-5 h-5 text-at-success mx-auto mb-1.5" />
              <p className="text-2xl font-bold text-green-700">{bookingCount}</p>
              <p className="text-xs text-at-success mt-0.5">예약 성공</p>
            </div>
            <div className="bg-at-accent-light rounded-xl p-4 text-center">
              <Percent className="w-5 h-5 text-at-accent mx-auto mb-1.5" />
              <p className="text-2xl font-bold text-at-accent">{successRate}%</p>
              <p className="text-xs text-at-accent mt-0.5">성공률</p>
            </div>
          </div>

          {/* 예약 성공 환자명 */}
          {bookingNames && (
            <div className="bg-at-success-bg border border-green-200 rounded-xl px-4 py-3">
              <p className="text-xs font-medium text-at-success mb-1">예약 성공 환자</p>
              <p className="text-sm text-green-800">{bookingNames}</p>
            </div>
          )}

          {/* 상세 기록 테이블 */}
          <div>
            <h4 className="text-sm font-semibold text-at-text-secondary mb-3 flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-at-text-weak" />
              상세 기록 ({recallCount}건)
            </h4>

            {patients.length === 0 ? (
              <div className="text-center py-12 text-at-text-weak">
                <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">이 날짜에 처리된 리콜 기록이 없습니다</p>
                <p className="text-xs mt-1">리콜 환자의 상태를 변경하면 여기에 기록됩니다</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-at-border rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-at-surface-alt border-b border-at-border">
                      <th className="text-left px-4 py-2.5 font-medium text-at-text-secondary">환자명</th>
                      <th className="text-left px-4 py-2.5 font-medium text-at-text-secondary">전화번호</th>
                      <th className="text-left px-4 py-2.5 font-medium text-at-text-secondary">차트번호</th>
                      <th className="text-left px-4 py-2.5 font-medium text-at-text-secondary">상태</th>
                      <th className="text-left px-4 py-2.5 font-medium text-at-text-secondary">처리시간</th>
                      <th className="text-left px-4 py-2.5 font-medium text-at-text-secondary">메모</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-at-border">
                    {patients.map(patient => (
                      <tr key={patient.id} className="hover:bg-at-surface-hover transition-colors">
                        <td className="px-4 py-2.5 font-medium text-at-text">{patient.patient_name}</td>
                        <td className="px-4 py-2.5 text-at-text-secondary">
                          <a href={`tel:${patient.phone_number}`} className="flex items-center gap-1 hover:text-at-accent">
                            <Phone className="w-3 h-3" />
                            {formatPhoneNumber(patient.phone_number)}
                          </a>
                        </td>
                        <td className="px-4 py-2.5 text-at-text-weak">{patient.chart_number || '-'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${RECALL_STATUS_COLORS[patient.status]}`}>
                            {RECALL_STATUS_LABELS[patient.status]}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-at-text-weak">
                          {patient.recall_datetime ? formatTime(patient.recall_datetime) : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-at-text-weak max-w-[200px] truncate">
                          {patient.notes || patient.appointment_notes || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
