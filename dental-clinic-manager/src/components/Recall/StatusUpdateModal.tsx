'use client'

import { useState } from 'react'
import {
  X,
  CheckCircle,
  Calendar,
  Clock,
  PhoneOff,
  PhoneMissed,
  XCircle,
  AlertCircle
} from 'lucide-react'
import type { RecallPatient, PatientRecallStatus } from '@/types/recall'
import { RECALL_STATUS_LABELS } from '@/types/recall'
import { recallPatientService } from '@/lib/recallService'

interface StatusUpdateModalProps {
  isOpen: boolean
  onClose: () => void
  patient: RecallPatient | null
  onUpdateComplete: () => void
}

export default function StatusUpdateModal({
  isOpen,
  onClose,
  patient,
  onUpdateComplete
}: StatusUpdateModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<PatientRecallStatus | null>(null)
  const [appointmentDate, setAppointmentDate] = useState('')
  const [appointmentTime, setAppointmentTime] = useState('')
  const [appointmentNotes, setAppointmentNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 상태 옵션 (간소화 - 문자발송은 자동으로만 설정됨)
  const statusOptions: { value: PatientRecallStatus; label: string; icon: React.ReactNode; color: string; description: string }[] = [
    {
      value: 'pending',
      label: '대기중',
      icon: <Clock className="w-5 h-5" />,
      color: 'bg-gray-100 text-gray-700 border-gray-300',
      description: '아직 연락하지 않음'
    },
    {
      value: 'appointment_made',
      label: '예약완료',
      icon: <Calendar className="w-5 h-5" />,
      color: 'bg-green-100 text-green-700 border-green-300',
      description: '내원 예약 확정'
    },
    {
      value: 'no_answer',
      label: '부재중',
      icon: <PhoneMissed className="w-5 h-5" />,
      color: 'bg-orange-100 text-orange-700 border-orange-300',
      description: '전화를 받지 않음'
    },
    {
      value: 'call_rejected',
      label: '통화거부',
      icon: <PhoneOff className="w-5 h-5" />,
      color: 'bg-red-100 text-red-700 border-red-300',
      description: '통화를 거부함'
    },
    {
      value: 'visit_refused',
      label: '내원거부',
      icon: <XCircle className="w-5 h-5" />,
      color: 'bg-red-100 text-red-700 border-red-300',
      description: '내원 의사 없음'
    },
    {
      value: 'invalid_number',
      label: '없는번호',
      icon: <AlertCircle className="w-5 h-5" />,
      color: 'bg-gray-100 text-gray-500 border-gray-300',
      description: '전화번호가 유효하지 않음'
    }
  ]

  // 저장
  const handleSave = async () => {
    if (!patient || !selectedStatus) return

    setIsSaving(true)
    setError(null)

    try {
      const appointmentInfo = selectedStatus === 'appointment_made' ? {
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        appointment_notes: appointmentNotes
      } : undefined

      const result = await recallPatientService.updatePatientStatus(
        patient.id,
        selectedStatus,
        appointmentInfo
      )

      if (result.success) {
        onUpdateComplete()
        onClose()
      } else {
        setError(result.error || '상태 변경에 실패했습니다.')
      }
    } catch (error) {
      console.error('Status update error:', error)
      setError('상태 변경 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen || !patient) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h3 className="font-semibold text-gray-900">상태 변경</h3>
            <p className="text-sm text-gray-500">{patient.patient_name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 내용 */}
        <div className="p-4 space-y-4">
          {/* 현재 상태 */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500 mb-1">현재 상태</p>
            <p className="font-medium">{RECALL_STATUS_LABELS[patient.status]}</p>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* 상태 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              새 상태 선택
            </label>
            <div className="grid grid-cols-2 gap-2">
              {statusOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => setSelectedStatus(option.value)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    selectedStatus === option.value
                      ? option.color + ' border-current'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {option.icon}
                    <span className="text-sm font-medium">{option.label}</span>
                  </div>
                  <p className="text-xs text-gray-500">{option.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* 예약 정보 (예약 완료 선택 시) */}
          {selectedStatus === 'appointment_made' && (
            <div className="space-y-3 p-4 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2 text-green-700">
                <Calendar className="w-5 h-5" />
                <span className="font-medium">예약 정보 입력</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">예약 날짜 *</label>
                  <input
                    type="date"
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">예약 시간</label>
                  <input
                    type="time"
                    value={appointmentTime}
                    onChange={(e) => setAppointmentTime(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">메모</label>
                <textarea
                  value={appointmentNotes}
                  onChange={(e) => setAppointmentNotes(e.target.value)}
                  rows={2}
                  placeholder="예약 관련 메모..."
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !selectedStatus || (selectedStatus === 'appointment_made' && !appointmentDate)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <span className="animate-spin">⏳</span>
                저장 중...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                저장
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
