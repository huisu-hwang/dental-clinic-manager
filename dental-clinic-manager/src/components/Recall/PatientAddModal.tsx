'use client'

import { useState } from 'react'
import {
  X,
  UserPlus,
  User,
  Phone,
  FileText,
  Calendar,
  Clipboard,
  AlertCircle
} from 'lucide-react'
import type { RecallPatientFormData, Gender } from '@/types/recall'
import { GENDER_LABELS } from '@/types/recall'
import { recallPatientService } from '@/lib/recallService'

interface PatientAddModalProps {
  isOpen: boolean
  onClose: () => void
  campaignId?: string
  onAddComplete: () => void
}

export default function PatientAddModal({
  isOpen,
  onClose,
  campaignId,
  onAddComplete
}: PatientAddModalProps) {
  const [formData, setFormData] = useState<RecallPatientFormData>({
    patient_name: '',
    phone_number: '',
    chart_number: '',
    birth_date: '',
    gender: undefined,
    last_visit_date: '',
    treatment_type: '',
    notes: ''
  })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 폼 초기화
  const resetForm = () => {
    setFormData({
      patient_name: '',
      phone_number: '',
      chart_number: '',
      birth_date: '',
      gender: undefined,
      last_visit_date: '',
      treatment_type: '',
      notes: ''
    })
    setError(null)
  }

  // 입력값 변경 핸들러
  const handleChange = (field: keyof RecallPatientFormData, value: string | Gender | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // 전화번호 포맷팅
  const formatPhoneNumber = (value: string): string => {
    // 숫자만 추출
    const numbers = value.replace(/\D/g, '')

    // 포맷팅
    if (numbers.length <= 3) {
      return numbers
    } else if (numbers.length <= 7) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
    } else if (numbers.length <= 11) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`
    }
    return numbers.slice(0, 13) // 최대 길이 제한
  }

  // 전화번호 입력 핸들러
  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneNumber(value)
    handleChange('phone_number', formatted)
  }

  // 저장
  const handleSave = async () => {
    // 유효성 검사
    if (!formData.patient_name.trim()) {
      setError('환자 이름을 입력해주세요.')
      return
    }
    if (!formData.phone_number.trim()) {
      setError('전화번호를 입력해주세요.')
      return
    }

    // 전화번호 형식 검사
    const phoneNumbers = formData.phone_number.replace(/\D/g, '')
    if (phoneNumbers.length < 10 || phoneNumbers.length > 11) {
      setError('올바른 전화번호를 입력해주세요.')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const result = await recallPatientService.addPatient(formData, campaignId)

      if (result.success) {
        onAddComplete()
        resetForm()
        onClose()
      } else {
        setError(result.error || '환자 추가에 실패했습니다.')
      }
    } catch (err) {
      console.error('Patient add error:', err)
      setError('환자 추가 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  // 모달 닫기
  const handleClose = () => {
    resetForm()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">환자 추가</h3>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 내용 */}
        <div className="p-4 space-y-4">
          {/* 에러 메시지 */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* 환자 이름 (필수) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <span className="flex items-center gap-1">
                <User className="w-4 h-4" />
                환자 이름 <span className="text-red-500">*</span>
              </span>
            </label>
            <input
              type="text"
              value={formData.patient_name}
              onChange={(e) => handleChange('patient_name', e.target.value)}
              placeholder="홍길동"
              className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* 전화번호 (필수) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <span className="flex items-center gap-1">
                <Phone className="w-4 h-4" />
                전화번호 <span className="text-red-500">*</span>
              </span>
            </label>
            <input
              type="tel"
              value={formData.phone_number}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="010-1234-5678"
              className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* 차트번호 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <span className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                차트번호
              </span>
            </label>
            <input
              type="text"
              value={formData.chart_number}
              onChange={(e) => handleChange('chart_number', e.target.value)}
              placeholder="C-12345"
              className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* 생년월일 & 성별 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  생년월일
                </span>
              </label>
              <input
                type="date"
                value={formData.birth_date}
                onChange={(e) => handleChange('birth_date', e.target.value)}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                성별
              </label>
              <select
                value={formData.gender || ''}
                onChange={(e) => handleChange('gender', e.target.value as Gender || undefined)}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">선택안함</option>
                {(Object.keys(GENDER_LABELS) as Gender[]).map(gender => (
                  <option key={gender} value={gender}>
                    {GENDER_LABELS[gender]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 마지막 내원일 & 치료 종류 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                마지막 내원일
              </label>
              <input
                type="date"
                value={formData.last_visit_date}
                onChange={(e) => handleChange('last_visit_date', e.target.value)}
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                치료 종류
              </label>
              <input
                type="text"
                value={formData.treatment_type}
                onChange={(e) => handleChange('treatment_type', e.target.value)}
                placeholder="스케일링"
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <span className="flex items-center gap-1">
                <Clipboard className="w-4 h-4" />
                메모
              </span>
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
              placeholder="환자에 대한 추가 메모..."
              className="w-full p-2.5 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <span className="animate-spin">⏳</span>
                저장 중...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                추가
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
