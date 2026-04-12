'use client'

import { useState, useEffect } from 'react'
import {
  X,
  Phone,
  PhoneOff,
  PhoneMissed,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  User,
  AlertCircle
} from 'lucide-react'
import type { RecallPatient, PatientRecallStatus } from '@/types/recall'
import { RECALL_STATUS_LABELS } from '@/types/recall'
import { makePhoneCall, detectDeviceType, displayPhoneNumber } from '@/lib/phoneCallService'
import { usePhoneDialSettings } from '@/hooks/usePhoneDialSettings'
import { recallContactLogService, recallPatientService } from '@/lib/recallService'

interface CallModalProps {
  isOpen: boolean
  onClose: () => void
  patient: RecallPatient | null
  clinicId: string
  onCallComplete: () => void
}

export default function CallModal({
  isOpen,
  onClose,
  patient,
  clinicId,
  onCallComplete
}: CallModalProps) {
  const [callStatus, setCallStatus] = useState<'ready' | 'calling' | 'ended'>('ready')
  const [selectedResult, setSelectedResult] = useState<PatientRecallStatus | null>(null)
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [deviceType, setDeviceType] = useState<'mobile' | 'desktop' | 'tablet'>('desktop')
  const [error, setError] = useState<string | null>(null)
  const { settings: phoneDialSettings } = usePhoneDialSettings()

  useEffect(() => {
    setDeviceType(detectDeviceType())
  }, [])

  // 모달이 열릴 때 상태 초기화
  useEffect(() => {
    if (isOpen) {
      setCallStatus('ready')
      setSelectedResult(null)
      setNotes('')
      setError(null)
    }
  }, [isOpen, patient?.id])

  // 전화 걸기
  const handleCall = async () => {
    if (!patient) return

    setCallStatus('calling')
    setError(null)

    try {
      const result = await makePhoneCall(patient.phone_number, {
        deviceType,
        settings: phoneDialSettings,
        clinicId
      })

      if (!result.success && result.error) {
        setError(result.error)
      }

      // 전화 시도 후 결과 입력 대기 상태로 전환
      setTimeout(() => {
        setCallStatus('ended')
      }, 1000)

    } catch (error) {
      console.error('Call error:', error)
      setError('전화 연결 중 오류가 발생했습니다.')
      setCallStatus('ended')
    }
  }

  // 결과 저장
  const handleSave = async () => {
    if (!patient || !selectedResult) return

    setIsSaving(true)
    setError(null)

    try {
      // 연락 이력 저장
      await recallContactLogService.addContactLog({
        patient_id: patient.id,
        campaign_id: patient.campaign_id,
        contact_type: 'call',
        result_status: selectedResult,
        result_notes: notes
      })

      // 환자 상태 업데이트
      await recallPatientService.updatePatientStatus(
        patient.id,
        selectedResult
      )

      onCallComplete()
      onClose()

    } catch (error) {
      console.error('Save error:', error)
      setError('저장 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  // 결과 선택 옵션 (간소화된 상태)
  const resultOptions: { value: PatientRecallStatus; label: string; icon: React.ReactNode; color: string }[] = [
    { value: 'appointment_made', label: '예약 성공', icon: <Calendar className="w-5 h-5" />, color: 'bg-at-success-bg text-at-success border-green-300' },
    { value: 'appointment_pending', label: '예약보류', icon: <Clock className="w-5 h-5" />, color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
    { value: 'already_booked', label: '이미예약', icon: <CheckCircle className="w-5 h-5" />, color: 'bg-cyan-100 text-cyan-700 border-cyan-300' },
    { value: 'no_answer', label: '부재중', icon: <PhoneMissed className="w-5 h-5" />, color: 'bg-orange-100 text-orange-700 border-orange-300' },
    { value: 'call_rejected', label: '통화 거부', icon: <PhoneOff className="w-5 h-5" />, color: 'bg-at-error-bg text-at-error border-red-300' },
    { value: 'visit_refused', label: '내원 거부', icon: <XCircle className="w-5 h-5" />, color: 'bg-at-error-bg text-at-error border-red-300' },
    { value: 'invalid_number', label: '없는 번호', icon: <AlertCircle className="w-5 h-5" />, color: 'bg-at-surface-alt text-at-text-secondary border-at-border' }
  ]

  if (!isOpen || !patient) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-at-card w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-at-border">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              callStatus === 'calling' ? 'bg-at-success-bg' : 'bg-at-tag'
            }`}>
              <Phone className={`w-5 h-5 ${callStatus === 'calling' ? 'text-at-success animate-pulse' : 'text-at-accent'}`} />
            </div>
            <div>
              <h3 className="font-semibold text-at-text">전화 걸기</h3>
              <p className="text-sm text-at-text-weak">{patient.patient_name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-at-text-weak hover:text-at-text-secondary"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 내용 */}
        <div className="p-4 space-y-4">
          {/* 환자 정보 */}
          <div className="flex items-center gap-4 p-4 bg-at-surface-alt rounded-xl">
            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center border border-at-border">
              <User className="w-6 h-6 text-at-text-weak" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-at-text">{patient.patient_name}</p>
              <p className="text-lg font-bold text-at-accent">{displayPhoneNumber(patient.phone_number)}</p>
              {patient.chart_number && (
                <p className="text-sm text-at-text-weak">차트: {patient.chart_number}</p>
              )}
            </div>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-at-error-bg text-at-error rounded-lg">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* 전화 버튼 */}
          {callStatus === 'ready' && (
            <button
              onClick={handleCall}
              className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl flex items-center justify-center gap-2 text-lg font-medium transition-colors"
            >
              <Phone className="w-6 h-6" />
              전화 걸기
            </button>
          )}

          {/* 통화 중 표시 */}
          {callStatus === 'calling' && (
            <div className="py-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-at-success-bg flex items-center justify-center">
                <Phone className="w-8 h-8 text-at-success animate-pulse" />
              </div>
              <p className="text-lg font-medium text-at-text">전화 연결 중...</p>
              <p className="text-sm text-at-text-weak mt-1">
                {deviceType === 'mobile' ? '전화 앱이 열립니다' : '전화 프로그램으로 연결됩니다'}
              </p>
              <button
                onClick={() => setCallStatus('ended')}
                className="mt-4 px-4 py-2 text-at-text-secondary hover:bg-at-surface-hover rounded-xl"
              >
                통화 완료 / 결과 입력
              </button>
            </div>
          )}

          {/* 결과 입력 */}
          {callStatus === 'ended' && (
            <>
              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-3">
                  통화 결과 선택
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {resultOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => setSelectedResult(option.value)}
                      className={`p-3 rounded-xl border-2 flex items-center gap-2 transition-all ${
                        selectedResult === option.value
                          ? option.color + ' border-current'
                          : 'border-at-border hover:border-at-border'
                      }`}
                    >
                      {option.icon}
                      <span className="text-sm font-medium">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 메모 */}
              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-2">
                  메모 (선택)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="통화 내용이나 특이사항을 입력하세요..."
                  className="w-full p-3 border border-at-border rounded-xl resize-none text-sm"
                />
              </div>
            </>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex justify-end gap-3 p-4 border-t border-at-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-at-text-secondary border border-at-border rounded-xl hover:bg-at-surface-hover"
          >
            취소
          </button>
          {callStatus === 'ended' && (
            <button
              onClick={handleSave}
              disabled={isSaving || !selectedResult}
              className="px-4 py-2 bg-at-accent text-white rounded-xl hover:bg-at-accent-hover disabled:bg-at-border disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <span className="animate-spin">⏳</span>
                  저장 중...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  결과 저장
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
