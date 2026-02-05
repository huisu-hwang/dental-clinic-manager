'use client'

import { useState, useEffect } from 'react'
import {
  X,
  Phone,
  MessageSquare,
  Clock,
  User,
  Calendar
} from 'lucide-react'
import type { RecallPatient, RecallContactLog } from '@/types/recall'
import { RECALL_STATUS_LABELS, RECALL_STATUS_COLORS, CONTACT_TYPE_LABELS } from '@/types/recall'
import { recallContactLogService } from '@/lib/recallService'
import { displayPhoneNumber } from '@/lib/phoneCallService'

interface ContactHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  patient: RecallPatient | null
}

export default function ContactHistoryModal({
  isOpen,
  onClose,
  patient
}: ContactHistoryModalProps) {
  const [logs, setLogs] = useState<RecallContactLog[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 이력 로드
  useEffect(() => {
    if (isOpen && patient) {
      loadHistory()
    }
  }, [isOpen, patient?.id])

  const loadHistory = async () => {
    if (!patient) return

    setIsLoading(true)
    setError(null)

    try {
      const result = await recallContactLogService.getContactLogs(patient.id)
      if (result.success && result.data) {
        setLogs(result.data)
      } else {
        setError(result.error || '이력을 불러오는데 실패했습니다.')
      }
    } catch (error) {
      console.error('Load history error:', error)
      setError('이력을 불러오는데 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen || !patient) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">연락 이력</h3>
              <p className="text-sm text-gray-500">{patient.patient_name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 환자 정보 */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <User className="w-6 h-6 text-gray-400" />
            </div>
            <div>
              <p className="font-medium text-gray-900">{patient.patient_name}</p>
              <p className="text-sm text-gray-500">{displayPhoneNumber(patient.phone_number)}</p>
              {patient.chart_number && (
                <p className="text-xs text-gray-400">차트: {patient.chart_number}</p>
              )}
            </div>
            <div className="ml-auto text-right">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${RECALL_STATUS_COLORS[patient.status]}`}>
                {RECALL_STATUS_LABELS[patient.status]}
              </span>
              <p className="text-xs text-gray-400 mt-1">총 {patient.contact_count}회 연락</p>
            </div>
          </div>

          {/* 예약 정보 */}
          {patient.appointment_date && (
            <div className="mt-3 p-3 bg-green-50 rounded-lg flex items-center gap-2">
              <Calendar className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-900">
                  예약: {patient.appointment_date}
                  {patient.appointment_time && ` ${patient.appointment_time}`}
                </p>
                {patient.appointment_notes && (
                  <p className="text-xs text-green-700">{patient.appointment_notes}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 이력 목록 */}
        <div className="p-4">
          {isLoading ? (
            <div className="py-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
              <p className="text-sm text-gray-500">로딩 중...</p>
            </div>
          ) : error ? (
            <div className="py-8 text-center text-red-500">
              <p>{error}</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-8 text-center">
              <Clock className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">연락 이력이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log, index) => (
                <div
                  key={log.id}
                  className="relative pl-8 pb-4 border-l-2 border-gray-200 last:border-l-0 last:pb-0"
                >
                  {/* 타임라인 점 */}
                  <div className={`absolute left-[-9px] top-0 w-4 h-4 rounded-full ${
                    log.contact_type === 'call' ? 'bg-green-500' : 'bg-blue-500'
                  }`}>
                    {log.contact_type === 'call' ? (
                      <Phone className="w-2.5 h-2.5 text-white absolute top-[3px] left-[3px]" />
                    ) : (
                      <MessageSquare className="w-2.5 h-2.5 text-white absolute top-[3px] left-[3px]" />
                    )}
                  </div>

                  {/* 이력 내용 */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                        log.contact_type === 'call' ? 'text-green-600' : 'text-blue-600'
                      }`}>
                        {log.contact_type === 'call' ? (
                          <Phone className="w-3 h-3" />
                        ) : (
                          <MessageSquare className="w-3 h-3" />
                        )}
                        {CONTACT_TYPE_LABELS[log.contact_type]}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(log.contact_date).toLocaleString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>

                    {/* 결과 상태 */}
                    {log.result_status && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${RECALL_STATUS_COLORS[log.result_status]}`}>
                        {RECALL_STATUS_LABELS[log.result_status]}
                      </span>
                    )}

                    {/* 문자 내용 */}
                    {log.sms_content && (
                      <div className="mt-2 p-2 bg-white rounded border border-gray-200 text-sm text-gray-700">
                        {log.sms_content}
                      </div>
                    )}

                    {/* 통화 시간 */}
                    {log.call_duration && (
                      <p className="mt-1 text-xs text-gray-500">
                        통화 시간: {Math.floor(log.call_duration / 60)}분 {log.call_duration % 60}초
                      </p>
                    )}

                    {/* 메모 */}
                    {log.result_notes && (
                      <p className="mt-2 text-sm text-gray-600">
                        {log.result_notes}
                      </p>
                    )}

                    {/* 담당자 */}
                    {log.contacted_by_name && (
                      <p className="mt-2 text-xs text-gray-400">
                        담당: {log.contacted_by_name}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex justify-end p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
