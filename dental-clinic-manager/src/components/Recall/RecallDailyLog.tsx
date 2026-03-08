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
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`
  }
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }
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

  useEffect(() => {
    loadActivity(selectedDate)
  }, [selectedDate, loadActivity])

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
          <button
            onClick={() => changeDate(-1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-500" />
            <input
              type="date"
              value={selectedDate}
              max={formatDate(new Date())}
              onChange={e => setSelectedDate(e.target.value)}
              className="text-sm font-medium text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-500 hidden sm:inline">
              {formatDateLabel(selectedDate)}
            </span>
          </div>
          <button
            onClick={() => changeDate(1)}
            disabled={isToday}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {!isToday && (
            <button
              onClick={() => setSelectedDate(formatDate(new Date()))}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50"
            >
              오늘
            </button>
          )}
          <button
            onClick={() => loadActivity(selectedDate)}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* 로딩 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          <span className="ml-2 text-sm text-gray-500">로딩 중...</span>
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-xl p-4 text-center">
              <Users className="w-5 h-5 text-slate-500 mx-auto mb-1.5" />
              <p className="text-2xl font-bold text-slate-800">{recallCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">리콜 처리</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <CheckCircle className="w-5 h-5 text-green-500 mx-auto mb-1.5" />
              <p className="text-2xl font-bold text-green-700">{bookingCount}</p>
              <p className="text-xs text-green-600 mt-0.5">예약 성공</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <Percent className="w-5 h-5 text-blue-500 mx-auto mb-1.5" />
              <p className="text-2xl font-bold text-blue-700">{successRate}%</p>
              <p className="text-xs text-blue-600 mt-0.5">성공률</p>
            </div>
          </div>

          {/* 예약 성공 환자명 */}
          {bookingNames && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <p className="text-xs font-medium text-green-700 mb-1">예약 성공 환자</p>
              <p className="text-sm text-green-800">{bookingNames}</p>
            </div>
          )}

          {/* 상세 기록 테이블 */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-gray-500" />
              상세 기록 ({recallCount}건)
            </h4>

            {patients.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">이 날짜에 처리된 리콜 기록이 없습니다</p>
                <p className="text-xs mt-1">리콜 환자의 상태를 변경하면 여기에 기록됩니다</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">환자명</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">전화번호</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">차트번호</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">상태</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">처리시간</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">메모</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {patients.map(patient => (
                      <tr key={patient.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          {patient.patient_name}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          <a
                            href={`tel:${patient.phone_number}`}
                            className="flex items-center gap-1 hover:text-blue-600"
                          >
                            <Phone className="w-3 h-3" />
                            {formatPhoneNumber(patient.phone_number)}
                          </a>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">
                          {patient.chart_number || '-'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${RECALL_STATUS_COLORS[patient.status]}`}>
                            {RECALL_STATUS_LABELS[patient.status]}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">
                          {patient.recall_datetime ? formatTime(patient.recall_datetime) : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 max-w-[200px] truncate">
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
